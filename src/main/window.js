// src/main/window.js — 无边框主窗口；关闭 = 隐藏到托盘（规格 4.6）
import { BrowserWindow } from 'electron'
import { join } from 'node:path'

export function createWindow() {
  const win = new BrowserWindow({
    width: 1080,
    height: 680,
    resizable: false,
    maximizable: false,
    frame: false,
    show: false,
    backgroundColor: '#101216',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  win.on('ready-to-show', () => win.show())
  // 关闭 = 隐藏到托盘（规格 4.6）
  win.on('close', (e) => {
    if (!global.__quitting) {
      e.preventDefault()
      win.hide()
    }
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}
