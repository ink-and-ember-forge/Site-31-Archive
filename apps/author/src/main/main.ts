import { join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import { checkDetails, type EpisodeDetails } from '@archive/casefile/authoring';
import type { EpisodeState, Result } from '../shared/api';
import { EpisodeSession, type Locations } from './episode';
import { handleScheme, registerScheme } from './protocol';

registerScheme();

let win: BrowserWindow | null = null;
let session: EpisodeSession | null = null;
let version = 0;
let building: Promise<void> = Promise.resolve();

// The packaged app keeps the viewer and theme beside it as real files; in development they are in dist/.
const resources = () => (app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'dist'));
const where = (): Locations => ({ themeDir: join(resources(), 'theme'), previewDir: join(app.getPath('temp'), 'archive-author-preview') });

/** Rebuilds the preview, one build at a time, then tells the window to reload it. */
function refreshPreview(): Promise<void> {
  const current = session;
  if (!current) return Promise.resolve();
  building = building
    .then(() => current.buildPreview())
    .then(() => {
      if (session === current) win?.webContents.send('author:preview', { version: ++version, id: current.id });
    })
    .catch((error) => console.error('Preview build failed', error));
  return building;
}

async function begin(opened: Result<EpisodeSession>): Promise<Result<EpisodeState>> {
  if (!opened.ok) return opened;
  session = opened.value;
  await refreshPreview();
  return { ok: true, value: await session.state() };
}

function registerIpc(): void {
  ipcMain.handle('author:new', async (_event, title: unknown) => {
    if (typeof title !== 'string' || title.length > 200) return { ok: false, message: 'Enter a title.' };
    const picked = await dialog.showOpenDialog(win!, {
      title: 'Choose where to save the new episode folder',
      defaultPath: app.getPath('documents'),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (picked.canceled || picked.filePaths.length === 0) return null;
    return begin(await EpisodeSession.create(picked.filePaths[0], title, where()));
  });

  ipcMain.handle('author:open', async () => {
    const picked = await dialog.showOpenDialog(win!, {
      title: 'Open an episode folder',
      defaultPath: app.getPath('documents'),
      properties: ['openDirectory'],
    });
    if (picked.canceled || picked.filePaths.length === 0) return null;
    return begin(await EpisodeSession.open(picked.filePaths[0], where()));
  });

  ipcMain.handle('author:save', async (_event, details: unknown): Promise<Result<EpisodeState>> => {
    if (!session) return { ok: false, message: 'No episode is open.' };
    const d = details as Partial<EpisodeDetails> | null;
    const candidate: EpisodeDetails | null =
      d && typeof d.title === 'string' && typeof d.submissionDate === 'string' &&
      (d.folderLabel === undefined || typeof d.folderLabel === 'string') &&
      (d.order === undefined || typeof d.order === 'number')
        ? { title: d.title, submissionDate: d.submissionDate, folderLabel: d.folderLabel, order: d.order }
        : null;
    if (!candidate || checkDetails(candidate).length > 0) return { ok: false, message: checkDetails(candidate ?? { title: '', submissionDate: '' }).join(' ') || 'Those details cannot be saved.' };
    const saved = session.saveDetails(candidate);
    if (!saved.ok) return saved;
    await refreshPreview();
    return { ok: true, value: await session.state() };
  });

  ipcMain.handle('author:reveal', () => {
    if (session) shell.showItemInFolder(join(session.folder, 'case.json'));
  });
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'Archive Author',
    backgroundColor: '#2b221b',
    webPreferences: {
      preload: join(app.getAppPath(), 'dist', 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  // The window only ever shows the app and the preview. Links open in the real browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('app://author/')) event.preventDefault();
  });
  void win.loadURL('app://author/index.html');
  win.on('closed', () => (win = null));
}

app.whenReady().then(() => {
  handleScheme({ renderer: join(app.getAppPath(), 'dist', 'renderer'), viewer: join(resources(), 'viewer'), preview: where().previewDir });
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []), { role: 'editMenu' as const }, { role: 'windowMenu' as const }]),
  );
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
