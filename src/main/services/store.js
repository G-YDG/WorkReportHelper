// src/main/services/store.js
import { readFileSync, writeFileSync, renameSync, existsSync, copyFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { safeStorage } from 'electron'

const DEFAULT_DB = () => ({ frags: [], reports: [], cfg: { repos: [] }, nid: 1 })

export function loadDb(file) {
  for (const f of [file, file + '.bak']) {
    if (!existsSync(f)) continue
    try {
      const db = JSON.parse(readFileSync(f, 'utf-8'))
      return { ...DEFAULT_DB(), ...db, cfg: { repos: [], ...db.cfg } }
    } catch {
      if (f === file) copyFileSync(file, file + '.corrupt') // 主文件坏才留证
    }
  }
  return DEFAULT_DB()
}

export function saveDb(file, db) {
  mkdirSync(dirname(file), { recursive: true }) // 父目录可能尚未创建（首次启动/清过 APPDATA）
  const tmp = file + '.tmp'
  writeFileSync(tmp, JSON.stringify(db, null, 2))
  if (existsSync(file)) renameSync(file, file + '.bak') // 原子移动旧主文件为 .bak（避免 copy 中断留下半写备份）
  else copyFileSync(tmp, file + '.bak') // 首次保存：备份新内容，保证 .bak 始终完好
  renameSync(tmp, file) // 原子替换
}

export function encryptKey(plain) {
  if (!plain) return ''
  return safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(plain).toString('base64')
    : Buffer.from(plain, 'utf-8').toString('base64') // 非 Windows 降级
}
export function decryptKey(enc) {
  if (!enc) return ''
  const buf = Buffer.from(enc, 'base64')
  return safeStorage.isEncryptionAvailable()
    ? safeStorage.decryptString(buf)
    : buf.toString('utf-8')
}

// 数据目录锚点：自定义保存路径写在独立文件里（cfg 在 data.json 内，无法自指）
export function anchorFilePath() {
  return join(process.env.APPDATA || dirname(process.execPath), 'WorkReportHelper', 'datapath.txt')
}

export function defaultDataDir() {
  return join(process.env.APPDATA || dirname(process.execPath), 'WorkReportHelper')
}

// 读锚点文件得到当前数据目录；空/损坏/未设置 → 默认目录
export function getDataDir(anchorFile = anchorFilePath()) {
  if (process.env.WORKREPORTHELPER_HOME) return process.env.WORKREPORTHELPER_HOME // E2E：临时目录隔离数据
  try {
    const dir = readFileSync(anchorFile, 'utf-8').trim()
    if (dir && existsSync(dir)) return dir
  } catch {
    /* 无锚点或不可读 → 默认 */
  }
  return defaultDataDir()
}

// 写入/清空锚点；目录非法时抛错由调用方提示
export function setDataDir(dir, anchorFile = anchorFilePath()) {
  const d = String(dir || '').trim()
  if (!d) {
    writeFileSync(anchorFile, '')
    return
  }
  if (!existsSync(d)) throw new Error('目录不存在：' + d)
  writeFileSync(anchorFile, d)
}

export function dataFilePath() {
  return join(getDataDir(), 'data.json')
}
