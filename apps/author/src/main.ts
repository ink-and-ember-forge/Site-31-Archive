import { app, BrowserWindow } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

// PLACEHOLDER shell. The real editor and the preview (which must mount the
// real viewer) come after the package format is agreed.
function createWindow(): void {
  const win = new BrowserWindow({ width: 1100, height: 750 });
  void win.loadFile(path.join(here, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
