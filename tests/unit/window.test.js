// tests/unit/window.test.js
// 窗口图标契约：dev 模式跑 electron.exe（内嵌原子图标），
// 必须显式传 icon 才能让任务栏/窗口显示应用图标。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createWindow } from '../../src/main/window'

const ROOT = join(__dirname, '..', '..')

// electron-vite 打包时注入 __dirname；单测环境手动补齐
beforeEach(() => { vi.stubGlobal('__dirname', join(ROOT, 'src', 'main')) })
afterEach(() => { vi.unstubAllGlobals() })

describe('createWindow 图标配置', () => {
  it('窗口 icon 指向应用目录下 resources/icon.ico', () => {
    const win = createWindow()
    expect(win.options.icon).toBe(join(ROOT, 'resources', 'icon.ico'))
  })

  it('icon 指向的文件真实存在', () => {
    const win = createWindow()
    expect(existsSync(win.options.icon)).toBe(true)
  })
})