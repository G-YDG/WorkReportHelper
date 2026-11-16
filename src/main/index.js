// src/main/index.js — 主进程入口：单实例锁 + 窗口 / 托盘 / 快捷键 / 定时生成
import { app, globalShortcut } from 'electron'
import { join } from 'node:path'
import { setInterval } from 'node:timers'
import { createWindow } from './window'
import { createTray } from './tray'
import { registerHotkey } from './hotkey'
import { registerIpc, getDb, setDb, persist } from './ipc'
import { createScheduler } from './services/scheduler'
import { createGitAutoImporter } from './services/autoimport'
import { runReportJob } from './services/reportjob'
import { streamReport } from './services/ai'
import { showNotification } from './services/notify'
import { collectCommits } from './services/git'
import { localReport } from '../../shared/ai-text'
import { importCommits } from '../../shared/gitimport'

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
  // 定时生成：到点由 runReportJob 承载流程（读写均现取 getDb()，防并发替换丢报告）
  const scheduler = createScheduler({
    onTrigger: (db, now, type) => runReportJob({
      type, now, getDb, setDb, persist,
      notify: showNotification,
      updated: () => win?.webContents.send('db:updated'), // 渲染端内存副本重载
      collect: collectCommits,
      importCommits,
      generate: async (cfg, t, meta, frags) => {
        try {
          return cfg.url && cfg.keyEnc ? await streamReport(cfg, t, meta, frags, () => {}) : localReport(t, frags)
        } catch {
          return localReport(t, frags) // AI 失败降级，不算执行失败
        }
      }
    })
  })
  // Git 自动导入：独立间隔调度，与定时生成共用 60s tick
  const gitImporter = createGitAutoImporter({
    getDb, setDb,
    updated: () => win?.webContents.send('db:updated'),
    notify: showNotification,
    collect: collectCommits,
    importCommits
  })
  setInterval(() => { const db = getDb(); scheduler.tick(db); gitImporter.tick(db) }, 60_000)
  app.on('second-instance', () => win?.show())
})

app.on('before-quit', () => { global.__quitting = true })
app.on('will-quit', () => globalShortcut.unregisterAll())
