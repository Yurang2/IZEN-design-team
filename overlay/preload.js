const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('overlay', {
  close: () => ipcRenderer.send('overlay:close'),
  minimize: () => ipcRenderer.send('overlay:minimize'),
  setOpacity: (value) => ipcRenderer.send('overlay:set-opacity', value),
})
