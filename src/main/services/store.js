// src/main/services/store.js
import { readFileSync, writeFileSync, renameSync, existsSync, copyFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { safeStorage } from 'electron'

// 定时配置默认值（单一事实来源）：周报默认周一、月报默认 1 号（day 限 1–28 保证短月必触发）
// times 为时间点数组（多时间点生成）；旧单值 time 由 migrateCfg 迁移为 [time]
const SCHED_DEFAULT = {
  daily: { on: false, times: ['18:30'] },
  weekly: { on: false, times: ['09:00'], weekday: 1 },
  monthly: { on: false, times: ['09:00'], day: 1 }
}
const GIT_AUTO_DEFAULT = { on: false, minutes: 30 }

// 逐类型合并默认值；time 单值 → times 数组（已有非空 times 优先），剔除旧 time 字段
const withTimes = (base, over = {}) => {
  const { time, ...rest } = over
  const times = Array.isArray(rest.times) && rest.times.length ? rest.times : time ? [time] : base.times
  return { ...base, ...rest, times }
}

// 旧 cfg.auto/time → sched.daily；已有 sched/gitAuto 逐类型补默认不覆盖；迁移后剔除旧字段
export function migrateCfg(cfg) {
  const { auto, time, ...rest } = cfg || {}
  const sched = rest.sched || { daily: { on: !!auto, time: time || '18:30' } }
  return {
    ...rest,
    sched: {
      daily: withTimes(SCHED_DEFAULT.daily, sched.daily),
      weekly: withTimes(SCHED_DEFAULT.weekly, sched.weekly),
      monthly: withTimes(SCHED_DEFAULT.monthly, sched.monthly)
    },
    gitAuto: { ...GIT_AUTO_DEFAULT, ...rest.gitAuto }
  }
}

const DEFAULT_DB = () => ({ frags: [], reports: [], cfg: migrateCfg({ repos: [] }), nid: 1 })

export function loadDb(file) {
  for (const f of [file, file + '.bak']) {
    if (!existsSync(f)) continue
    try {
      const db = JSON.parse(readFileSync(f, 'utf-8'))
      return { ...DEFAULT_DB(), ...db, cfg: migrateCfg({ repos: [], ...db.cfg }) }
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
