import { pathToFileURL } from 'node:url';
import { resolve, sep } from 'node:path';
import { net, protocol } from 'electron';

export interface ProtocolDirs {
  /** The app's own window. */
  renderer: string;
  /** The real viewer, as built for the website. */
  viewer: string;
  /** Where the current episode is packaged for the preview. */
  preview: string;
}

/** Must run before the app is ready. */
export function registerScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
}

/**
 * Serves two separate origins from local folders, so the viewer in the preview frame can
 * never reach the app's window:
 *   app://author/  the window
 *   app://viewer/  the real viewer, with /archive/ answered from the preview build
 */
export function handleScheme(dirs: ProtocolDirs): void {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    let root: string;
    let relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    let noStore = false;

    if (url.hostname === 'author') root = dirs.renderer;
    else if (url.hostname === 'viewer') {
      if (relative.startsWith('archive/')) {
        root = dirs.preview;
        relative = relative.slice('archive/'.length);
        noStore = true; // the preview changes as the author types
      } else root = dirs.viewer;
    } else return new Response('Not found', { status: 404 });

    const file = resolve(root, relative);
    if (file !== root && !file.startsWith(root + sep)) return new Response('Forbidden', { status: 403 });

    try {
      const response = await net.fetch(pathToFileURL(file).toString());
      if (!noStore) return response;
      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'no-store');
      return new Response(response.body, { status: response.status, headers });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}
