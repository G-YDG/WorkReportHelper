// src/main/index.js — 主进程入口：单实例锁 + 窗口 / 托盘 / 快捷键 / 定时生成
import { app, globalShortcut } from 'electron'
import { join } from 'node:path'
import { setInterval } from 'node:timers'
import { createWindow } from './window'
import { createTray } from './tray'
import { registerHotkey } from './hotkey'
import { registerIpc, getDb, persist } from './ipc'
import { createScheduler } from './services/scheduler'
import { streamReport } from './services/ai'
import { showNotification } from './services/notify'
import { localReport } from '../../shared/ai-text'
import { genMeta, keyOf } from '../../shared/periods'

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
  const scheduler = createScheduler({
    onTrigger: async (_db, now) => {
      // 读取与写入均现取 getDb()：await 期间渲染端 db:save 可能替换主进程 dbCache，
      // 若沿用触发时的 db 引用会把报告写进旧对象，导致持久化时报告丢失
      const meta = genMeta('daily', now)
      const cur = getDb()
      const frags = cur.frags.filter((f) => f.d === keyOf(now))
      const cfg = cur.cfg
      let text
      try {
        text = cfg.url && cfg.keyEnc ? await streamReport(cfg, 'daily', meta, frags, () => {}) : localReport('daily', frags)
      } catch {
        text = localReport('daily', frags) // AI 失败降级
      }
      const when = keyOf(now) + ' ' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')
      const latest = getDb()
      const old = latest.reports.find((r) => r.type === 'daily' && r.d === meta.d)
      if (old) { old.text = text; old.when = when } else latest.reports.push({ type: 'daily', d: meta.d, when, text })
      persist()
      showNotification('工作报告助手', '今日日报已生成')
    }
  })
  setInterval(() => scheduler.tick(getDb()), 60_000)
  app.on('second-instance', () => win?.show())
})

app.on('before-quit', () => { global.__quitting = true })
app.on('will-quit', () => globalShortcut.unregisterAll())
