const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')

// Custom protocol — 웹에서 izen-overlay:// 링크로 실행 가능
const PROTOCOL = 'izen-overlay'
if (!app.isPackaged) {
  app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(__dirname)])
} else {
  app.setAsDefaultProtocolClient(PROTOCOL)
}

// Single instance lock — 이미 떠 있으면 기존 창을 포커스
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
}

let win

function createWindow() {
  win = new BrowserWindow({
    width: 360,
    height: 640,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.setOpacity(0.75)
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'))
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())

ipcMain.on('overlay:close', () => win.close())
ipcMain.on('overlay:minimize', () => win.minimize())
ipcMain.on('overlay:set-opacity', (_event, value) => {
  win.setOpacity(Math.max(0.1, Math.min(1, value)))
})
