// src/preload/index.js — contextBridge 白名单：渲染侧只能触达此处列出的通道
import { contextBridge, ipcRenderer } from 'electron'

const on = (channel, fn) => {
  const allowed = ['ai:delta', 'tray:toggle']
  if (allowed.includes(channel)) {
    const h = (_e, ...a) => fn(...a)
    ipcRenderer.on(channel, h)
    return () => ipcRenderer.removeListener(channel, h)
  }
}

contextBridge.exposeInMainWorld('api', {
  store: {
    load: () => ipcRenderer.invoke('db:load'),
    save: (db) => ipcRenderer.invoke('db:save', db),
    encryptKey: (p) => ipcRenderer.invoke('key:encrypt', p),
    decryptKey: (p) => ipcRenderer.invoke('key:decrypt', p)
  },
  git: {
    collect: (date, repos) => ipcRenderer.invoke('git:collect', date, repos),
    scan: (dir) => ipcRenderer.invoke('git:scan', dir)
  },
  ai: {
    test: (cfg) => ipcRenderer.invoke('ai:test', cfg),
    generate: (cfg, type, meta, frags, promptOverride) => ipcRenderer.invoke('ai:generate', cfg, type, meta, frags, promptOverride),
    onDelta: (fn) => on('ai:delta', fn)
  },
  app: {
    exportMd: (name, text, dir) => ipcRenderer.invoke('app:export-md', name, text, dir),
    pickDir: (defaultPath) => ipcRenderer.invoke('app:pick-dir', defaultPath),
    setBoot: (on2) => ipcRenderer.invoke('app:set-boot', on2),
    notify: (title, body) => ipcRenderer.invoke('notify', title, body),
    onTray: (fn) => on('tray:toggle', fn)
  }
})
