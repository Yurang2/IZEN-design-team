const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('nanobanana', {
  config: () => ipcRenderer.invoke('nanobanana:config'),
  edit: (input) => ipcRenderer.invoke('nanobanana:edit', input),
  deleteItem: (input) => ipcRenderer.invoke('nanobanana:delete-item', input),
  filePath: (file) => webUtils.getPathForFile(file),
  history: () => ipcRenderer.invoke('nanobanana:history'),
})
