// src/main/hotkey.js — 全局快捷键：Alt+E 显隐主窗口
import { globalShortcut } from 'electron'
export function registerHotkey(win) {
  globalShortcut.register('Alt+E', () => (win.isVisible() ? win.hide() : win.show()))
}
