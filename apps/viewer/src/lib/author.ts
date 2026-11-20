// Hooks for the authoring tool, which shows this viewer in a frame as its live preview.
// They do nothing on the website: they only act when the page is inside that frame (`?instant`).

/** The preview reloads on every edit, so it skips the opening animation. */
export const instant = typeof location !== 'undefined' && new URLSearchParams(location.search).has('instant');

const inAuthorFrame = instant && typeof window !== 'undefined' && window.parent !== window;

export type AuthorMessage =
  | { type: 'ready' }
  | { type: 'select'; doc: string }
  | { type: 'layout'; doc: string; x: number; y: number };

/** What the authoring tool can ask of the viewer. */
export type AuthorCommand =
  /** Load the episode again and update the table in place, keeping where everything is. */
  | { type: 'reload' }
  /** Bring a document to the front of the screen (or put everything back with null). */
  | { type: 'focus'; doc: string | null };

/** Listens for the authoring tool's commands. Only messages from the tool's own window are accepted. */
export function onAuthorCommand(handler: (command: AuthorCommand) => void): () => void {
  if (!inAuthorFrame) return () => {};
  const listener = (event: MessageEvent) => {
    if (event.origin !== 'app://author' || event.source !== window.parent) return;
    const m = event.data as { source?: string; type?: string; doc?: unknown } | null;
    if (m?.source !== 'archive-author') return;
    if (m.type === 'reload') handler({ type: 'reload' });
    else if (m.type === 'focus' && (typeof m.doc === 'string' || m.doc === null)) handler({ type: 'focus', doc: m.doc });
  };
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}

/** Tells the authoring tool what the author just did on the table. */
export function notifyAuthor(message: AuthorMessage): void {
  if (inAuthorFrame) window.parent.postMessage({ source: 'archive-viewer', ...message }, 'app://author');
}

/** Tells the authoring tool the table is on screen, so it can send what it was waiting to send. */
export function announceReady(): void {
  notifyAuthor({ type: 'ready' });
}
