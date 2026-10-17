// src/main/ipc.js — IPC 白名单注册：渲染侧只能调用此处注册的通道
import { app, dialog, ipcMain, Menu } from 'electron'
import { writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { loadDb, saveDb, encryptKey, decryptKey, dataFilePath } from './services/store'
import { collectCommits, scanRepos } from './services/git'
import { streamReport, testConnection } from './services/ai'
import { showNotification } from './services/notify'

const DATA = () => dataFilePath()
let dbCache = null
export const getDb = () => (dbCache ??= loadDb(DATA()))
export const persist = () => saveDb(DATA(), getDb())

export function registerIpc({ win }) {
  ipcMain.handle('db:load', () => getDb())
  ipcMain.handle('db:save', (_e, db) => {
    try {
      dbCache = db
      persist()
    } catch (err) {
      // 渲染端持久化是 fire-and-forget，落盘失败只能靠主进程兜底告知
      showNotification('工作报告助手', '数据保存失败：' + (err?.message || err))
      throw err
    }
  })
  ipcMain.handle('key:encrypt', (_e, plain) => encryptKey(plain))
  ipcMain.handle('key:decrypt', (_e, enc) => decryptKey(enc))
  ipcMain.handle('git:collect', async (_e, date, repos) => {
    const failures = []
    const commits = await collectCommits(date, repos, (repo, ok, msg) => {
      if (!ok) failures.push({ repo, msg })
    })
    return { commits, failures }
  })
  ipcMain.handle('git:scan', (_e, dir) => scanRepos(dir))
  ipcMain.handle('ai:test', (_e, cfg) => testConnection(cfg))
  ipcMain.handle('ai:generate', async (_e, cfg, type, meta, frags, promptOverride) => {
    return streamReport(cfg, type, meta, frags, (full) => win.webContents.send('ai:delta', full), promptOverride)
  })
  ipcMain.handle('app:export-md', async (_e, name, text, dir) => {
    const target = dir || dirname(DATA())
    await mkdir(target, { recursive: true })
    const p = join(target, name)
    await writeFile(p, text, 'utf-8')
    return p
  })
  ipcMain.handle('app:set-boot', (_e, on) => {
    // Electron Windows：开机自启
    app.setLoginItemSettings({ openAtLogin: !!on, path: process.execPath })
  })
  ipcMain.handle('app:pick-dir', async (_e, defaultPath) => {
    const res = await dialog.showOpenDialog(win, {
      title: '选择文件夹',
      defaultPath: defaultPath || undefined,
      properties: ['openDirectory', 'createDirectory']
    })
    return res.canceled ? null : res.filePaths[0]
  })
  ipcMain.handle('notify', (_e, title, body) => showNotification(title, body))
  // 通用右键菜单：items=[{label}]，返回点击项下标；未选择（点击别处关闭）返回 -1
  ipcMain.handle('app:ctx-menu', (_e, items) =>
    new Promise((resolve) => {
      const menu = Menu.buildFromTemplate(
        (items || []).map((it, i) => ({ label: it.label, click: () => resolve(i) }))
      )
      menu.popup({ window: win, callback: () => setTimeout(() => resolve(-1), 0) })
    })
  )
}
