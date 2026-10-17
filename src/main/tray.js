// src/main/tray.js — 托盘图标：单击显隐，菜单提供显示 / 生成日报 / 退出
import { Tray, Menu, nativeImage, app } from 'electron'
import { join } from 'node:path'

export function createTray(win, genDaily) {
  const icon = nativeImage.createFromPath(join(process.env.VITE_DEV_SERVER_URL ? process.cwd() : process.resourcesPath || process.cwd(), 'resources/icon.png'))
  const tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)
  tray.setToolTip('工作报告助手')
  tray.on('click', () => (win.isVisible() ? win.hide() : win.show()))
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示', click: () => win.show() },
      { label: '生成日报', click: genDaily },
      { type: 'separator' },
      { label: '退出', click: () => { global.__quitting = true; app.quit() } }
    ])
  )
  return tray
}
