// tests/unit/store.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadDb, saveDb, encryptKey, decryptKey, getDataDir, setDataDir, defaultDataDir, migrateCfg } from '../../src/main/services/store'

let dir
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'wrh-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('store', () => {
  it('首次 load 返回空库默认值', () => {
    const db = loadDb(join(dir, 'data.json'))
    expect(db.frags).toEqual([])
    expect(db.reports).toEqual([])
    expect(db.cfg.repos).toEqual([])
    expect(db.nid).toBe(1)
  })
  it('save 后 load 往返一致', () => {
    const p = join(dir, 'data.json')
    saveDb(p, { frags: [{ id: 1 }], reports: [], cfg: {}, nid: 2 })
    expect(loadDb(p).frags[0].id).toBe(1)
  })
  it('主文件损坏时回退 .bak', () => {
    const p = join(dir, 'data.json')
    saveDb(p, { frags: [{ id: 7 }], reports: [], cfg: {}, nid: 8 })
    writeFileSync(p, '{broken json')
    expect(loadDb(p).frags[0].id).toBe(7)
  })
  it('损坏的旧库会被下次 save 修复，且损坏内容先备份为 .corrupt', () => {
    const p = join(dir, 'data.json')
    writeFileSync(p, 'garbage')
    const db = loadDb(p)
    expect(db.frags).toEqual([])
    saveDb(p, db)
    expect(existsSync(p + '.corrupt')).toBe(true)
    expect(loadDb(p).frags).toEqual([])
  })
  it('连续 save 两次后主文件为新内容，.bak 为旧内容且均可解析', () => {
    const p = join(dir, 'data.json')
    saveDb(p, { frags: [{ id: 1 }], reports: [], cfg: {}, nid: 2 })
    saveDb(p, { frags: [{ id: 2 }], reports: [], cfg: {}, nid: 3 })
    expect(JSON.parse(readFileSync(p, 'utf-8')).frags[0].id).toBe(2)
    expect(JSON.parse(readFileSync(p + '.bak', 'utf-8')).frags[0].id).toBe(1)
  })
  it('父目录不存在时自动创建（ENOENT 回归测试）', () => {
    const p = join(dir, 'not-exist', 'sub', 'data.json')
    saveDb(p, { frags: [{ id: 9 }], reports: [], cfg: {}, nid: 10 })
    expect(loadDb(p).frags[0].id).toBe(9)
  })
  it('主文件与 .bak 同时损坏时返回默认值，且两文件内容未被改动', () => {
    const p = join(dir, 'data.json')
    writeFileSync(p, 'corrupted-main')
    writeFileSync(p + '.bak', 'corrupted-bak')
    const db = loadDb(p)
    expect(db.frags).toEqual([])
    expect(db.reports).toEqual([])
    expect(db.cfg.repos).toEqual([])
    expect(db.nid).toBe(1)
    expect(readFileSync(p, 'utf-8')).toBe('corrupted-main')
    expect(readFileSync(p + '.bak', 'utf-8')).toBe('corrupted-bak')
  })
  it('DPAPI 加解密往返（仅 Windows）', () => {
    const enc = encryptKey('sk-test-123')
    expect(enc).not.toBe('sk-test-123')
    expect(decryptKey(enc)).toBe('sk-test-123')
  })
})

describe('数据目录锚点（可修改保存路径）', () => {
  it('未设置锚点时返回默认目录', () => {
    const anchor = join(dir, 'datapath.txt')
    expect(getDataDir(anchor)).toBe(defaultDataDir())
  })
  it('setDataDir 写入锚点后 getDataDir 返回自定义目录；目录不存在时抛错', () => {
    const anchor = join(dir, 'datapath.txt')
    const custom = mkdtempSync(join(tmpdir(), 'wrh-data-'))
    setDataDir(custom, anchor)
    expect(getDataDir(anchor)).toBe(custom)
    expect(() => setDataDir('X:\\__not_exist_dir__', anchor)).toThrow('目录不存在')
    setDataDir('', anchor) // 清空回默认
    expect(getDataDir(anchor)).toBe(defaultDataDir())
  })
  it('锚点文件损坏时回退默认目录', () => {
    const anchor = join(dir, 'broken.txt')
    writeFileSync(anchor, '')
    expect(getDataDir(anchor)).toBe(defaultDataDir())
  })
})

describe('migrateCfg', () => {
  it('旧 auto/time 迁移为 sched.daily 并删除旧字段', () => {
    const cfg = migrateCfg({ repos: [], auto: true, time: '17:00' })
    expect(cfg.sched.daily).toEqual({ on: true, times: ['17:00'] })
    expect(cfg.auto).toBeUndefined()
    expect(cfg.time).toBeUndefined()
  })
  it('无旧字段也无 sched → 全默认（daily 关）', () => {
    const cfg = migrateCfg({ repos: [] })
    expect(cfg.sched.daily).toEqual({ on: false, times: ['18:30'] })
    expect(cfg.sched.weekly).toEqual({ on: false, points: [{ day: 1, time: '09:00' }] })
    expect(cfg.sched.monthly).toEqual({ on: false, points: [{ day: 1, time: '09:00' }] })
    expect(cfg.gitAuto).toEqual({ on: false, minutes: 30 })
  })
  it('已有 sched 不被覆盖，缺省类型补默认', () => {
    const cfg = migrateCfg({ sched: { weekly: { on: true, time: '08:00', weekday: 5 } }, gitAuto: { on: true, minutes: 10 } })
    expect(cfg.sched.weekly).toEqual({ on: true, points: [{ day: 5, time: '08:00' }] })
    expect(cfg.sched.daily.on).toBe(false)
    expect(cfg.gitAuto).toEqual({ on: true, minutes: 10 })
  })
  it('分支旧版单值 time / times+weekday/day 迁移为 points 日期时间对', () => {
    const cfg = migrateCfg({ sched: { daily: { on: true, time: '12:30' }, monthly: { on: true, times: ['08:00', '20:00'], day: 15 } } })
    expect(cfg.sched.daily).toEqual({ on: true, times: ['12:30'] })
    expect(cfg.sched.monthly.points).toEqual([{ day: 15, time: '08:00' }, { day: 15, time: '20:00' }])
    expect(cfg.sched.daily.time).toBeUndefined()
    expect(cfg.sched.monthly.day).toBeUndefined()
  })
  it('weekly/monthly 已有 points（不同日期）原样保留', () => {
    const pts = [{ day: 1, time: '09:00' }, { day: 5, time: '18:00' }]
    const cfg = migrateCfg({ sched: { weekly: { on: true, points: pts } } })
    expect(cfg.sched.weekly.points).toEqual(pts)
  })
  it('sched 类型为 null 时容忍回退默认（不抛错、不判整库损坏）', () => {
    const cfg = migrateCfg({ sched: { daily: null, weekly: null } })
    expect(cfg.sched.daily).toEqual({ on: false, times: ['18:30'] })
    expect(cfg.sched.weekly).toEqual({ on: false, points: [{ day: 1, time: '09:00' }] })
    writeFileSync(join(dir, 'data.json'), JSON.stringify({ frags: [{ id: 1, d: '2026-11-16', x: '在' }], reports: [], nid: 2, cfg: { repos: [], sched: { daily: null } } }))
    const db = loadDb(join(dir, 'data.json'))
    expect(db.frags).toHaveLength(1) // 完好数据不被降级丢失
    expect(existsSync(join(dir, 'data.json.corrupt'))).toBe(false)
  })
  it('loadDb 读旧版 data.json 自动迁移', () => {
    writeFileSync(join(dir, 'data.json'), JSON.stringify({ frags: [], reports: [], cfg: { repos: [], auto: true, time: '18:30' }, nid: 1 }))
    const db = loadDb(join(dir, 'data.json'))
    expect(db.cfg.sched.daily.on).toBe(true)
    expect(db.cfg.auto).toBeUndefined()
  })
})

describe('migrateCfg 成员级归一', () => {
  it('points 畸形成员过滤：null/缺 time/越界 day/非法 time 丢弃，字符串 day 强转', () => {
    const cfg = migrateCfg({ sched: { weekly: { on: true, points: [null, { day: 1 }, { day: '5', time: '09:00' }, { day: 7, time: '09:00' }, { day: 2, time: '9:00' }] } } })
    expect(cfg.sched.weekly.points).toEqual([{ day: 5, time: '09:00' }])
    const m = migrateCfg({ sched: { monthly: { on: true, points: [{ day: 28, time: '08:00' }, { day: 29, time: '08:00' }] } } })
    expect(m.sched.monthly.points).toEqual([{ day: 28, time: '08:00' }])
  })
  it('旧 times:[null] 迁移不再产出 time:null 成员（全畸形回退默认）', () => {
    const cfg = migrateCfg({ sched: { weekly: { on: true, times: [null], weekday: 5 } } })
    expect(cfg.sched.weekly.points).toEqual([{ day: 1, time: '09:00' }])
  })
  it('daily times 畸形成员过滤', () => {
    const cfg = migrateCfg({ sched: { daily: { on: true, times: [null, 900, '18:30'] } } })
    expect(cfg.sched.daily.times).toEqual(['18:30'])
  })
})
