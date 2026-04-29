const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('nanobanana', {
  config: () => ipcRenderer.invoke('nanobanana:config'),
  edit: (input) => ipcRenderer.invoke('nanobanana:edit', input),
})
