// src/main/tray.js — 托盘图标：单击显隐，菜单提供显示 / 生成日报 / 退出
import { Tray, Menu, nativeImage, app } from 'electron'
import { join } from 'node:path'

// 图标路径：打包版在 <resources>/resources/icon.png（extraResources 落位）；
// dev 下 resourcesPath 指向 node_modules/electron/dist/resources，需回退到项目根的 resources/
function trayIconPath() {
  if (app.isPackaged) return join(process.resourcesPath, 'resources', 'icon.png')
  return join(app.getAppPath(), 'resources', 'icon.png')
}

export function createTray(win, genDaily) {
  const icon = nativeImage.createFromPath(trayIconPath())
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
