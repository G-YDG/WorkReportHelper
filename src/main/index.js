// src/main/index.js — 主进程入口：单实例锁 + 窗口 / 托盘 / 快捷键
import { app, globalShortcut } from 'electron'
import { join } from 'node:path'
import { createWindow } from './window'
import { createTray } from './tray'
import { registerHotkey } from './hotkey'
import { registerIpc } from './ipc'

if (!app.requestSingleInstanceLock()) app.quit()

// E2E 隔离：设置了 WORKREPORTHELPER_HOME 时，Chromium 的 userData（缓存/单实例锁）
// 也指到该目录下，避免与真实运行的实例（dev 或打包版）互相持锁导致启动失败。
// 必须在 app ready 之前调用才生效。
if (process.env.WORKREPORTHELPER_HOME) {
  app.setPath('userData', join(process.env.WORKREPORTHELPER_HOME, 'userData'))
}

let win

app.whenReady().then(() => {
  app.setAppUserModelId(app.name) // Windows 通知必需
  win = createWindow()
  registerIpc({ win })
  createTray(win, () => {
    win.show()
    win.webContents.send('tray:toggle', 'gen-daily') // 渲染端打开生成弹窗
  })
  registerHotkey(win)
  // 注：每日定时自动生成模块已按需求移除（scheduler 服务保留但不再启动）
  app.on('second-instance', () => win?.show())
})

app.on('before-quit', () => { global.__quitting = true })
app.on('will-quit', () => globalShortcut.unregisterAll())
