// The only bridge between the window and the app. The window cannot touch files or Node;
// it can only ask for these few actions.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('author', {
  newEpisode: (title) => ipcRenderer.invoke('author:new', title),
  openEpisode: () => ipcRenderer.invoke('author:open'),
  saveDetails: (details) => ipcRenderer.invoke('author:save', details),
  addDocument: (template, name) => ipcRenderer.invoke('author:add-document', template, name),
  removeDocument: (id) => ipcRenderer.invoke('author:remove-document', id),
  setCentral: (id) => ipcRenderer.invoke('author:set-central', id),
  setHidden: (id, hidden) => ipcRenderer.invoke('author:set-hidden', id, hidden),
  setLayout: (id, layout, refresh) => ipcRenderer.invoke('author:set-layout', id, layout, refresh),
  setSlotText: (id, slot, text) => ipcRenderer.invoke('author:set-slot-text', id, slot, text),
  chooseImage: (id, slot) => ipcRenderer.invoke('author:choose-image', id, slot),
  setImageAlt: (id, slot, alt) => ipcRenderer.invoke('author:set-image-alt', id, slot, alt),
  revealFolder: () => ipcRenderer.invoke('author:reveal'),
  onPreview: (callback) => {
    const handler = (_event, info) => callback(info);
    ipcRenderer.on('author:preview', handler);
    return () => ipcRenderer.removeListener('author:preview', handler);
  },
});
