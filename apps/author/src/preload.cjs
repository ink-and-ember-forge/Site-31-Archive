// The only bridge between the window and the app. The window cannot touch files or Node;
// it can only ask for these few actions.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('author', {
  newEpisode: (title) => ipcRenderer.invoke('author:new', title),
  openEpisode: () => ipcRenderer.invoke('author:open'),
  saveDetails: (details) => ipcRenderer.invoke('author:save', details),
  revealFolder: () => ipcRenderer.invoke('author:reveal'),
  onPreview: (callback) => {
    const handler = (_event, info) => callback(info);
    ipcRenderer.on('author:preview', handler);
    return () => ipcRenderer.removeListener('author:preview', handler);
  },
});
