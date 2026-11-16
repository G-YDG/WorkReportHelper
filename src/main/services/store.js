// src/main/services/store.js
import { readFileSync, writeFileSync, renameSync, existsSync, copyFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { safeStorage } from 'electron'

// 定时配置默认值（单一事实来源）：周报默认周一、月报默认 1 号（day 限 1–28 保证短月必触发）
// daily：times 时间点数组（同一天多时间）；weekly/monthly：points 日期+时间对数组（不同日期各自触发）
// weekly 的 point.day = 星期几 0–6；monthly 的 point.day = 几号 1–28
const SCHED_DEFAULT = {
  daily: { on: false, times: ['18:30'] },
  weekly: { on: false, points: [{ day: 1, time: '09:00' }] },
  monthly: { on: false, points: [{ day: 1, time: '09:00' }] }
}
const GIT_AUTO_DEFAULT = { on: false, minutes: 30 }

// 成员级归一（data.json 不可信）：time 必须 HH:MM；point 的 day 强转数字并按类型范围过滤。
// 畸形成员丢弃（比静默永不触发/运行时抛错更可感知）；全丢弃回退默认
const HM = /^\d{2}:\d{2}$/
const normTime = (t) => (typeof t === 'string' && HM.test(t) ? t : null)
const normPoint = (p, maxDay) => {
  if (!p || typeof p !== 'object') return null
  const day = Math.round(Number(p.day))
  const time = normTime(p.time)
  if (!Number.isFinite(day) || day < 0 || day > maxDay || !time) return null
  return { day, time }
}

// 逐类型合并默认值；time 单值 → times 数组（已有非空 times 优先），剔除旧 time 字段
// over 空值归一：畸形 data.json（sched.<type>: null）容忍回退默认，与旧 spread 语义等价，
// 避免解构抛错被 loadDb 判为整库损坏而降级丢数据
const withTimes = (base, over) => {
  const { time, ...rest } = over && typeof over === 'object' ? over : {}
  const raw = Array.isArray(rest.times) && rest.times.length ? rest.times : time ? [time] : base.times
  const times = raw.map(normTime).filter(Boolean)
  return { ...base, ...rest, times: times.length ? times : base.times }
}

// weekly/monthly：旧「单 weekday/day + time/times」迁移为「同日期 × 各时间点」的 points；
// 已有非空 points 原样保留；剔除旧 weekday/day/time/times 字段；空值容忍回退默认
const withPoints = (base, over, dayKey) => {
  const o = over && typeof over === 'object' ? over : {}
  const { time, times, points, weekday, day, ...rest } = o
  const legacyDay = (dayKey === 'weekday' ? weekday : day) ?? 1
  const maxDay = dayKey === 'weekday' ? 6 : 28
  const ts = Array.isArray(times) && times.length ? times : time ? [time] : null
  const raw = Array.isArray(points) && points.length ? points : ts ? ts.map((t) => ({ day: legacyDay, time: t })) : base.points
  const pts = raw.map((p) => normPoint(p, maxDay)).filter(Boolean)
  return { ...base, ...rest, points: pts.length ? pts : base.points }
}

// 旧 cfg.auto/time → sched.daily；已有 sched/gitAuto 逐类型补默认不覆盖；迁移后剔除旧字段
export function migrateCfg(cfg) {
  const { auto, time, ...rest } = cfg || {}
  const sched = rest.sched || { daily: { on: !!auto, time: time || '18:30' } }
  return {
    ...rest,
    sched: {
      daily: withTimes(SCHED_DEFAULT.daily, sched.daily),
      weekly: withPoints(SCHED_DEFAULT.weekly, sched.weekly, 'weekday'),
      monthly: withPoints(SCHED_DEFAULT.monthly, sched.monthly, 'day')
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
