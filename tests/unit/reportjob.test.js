import { describe, it, expect, vi } from 'vitest'
import { runReportJob } from '../../src/main/services/reportjob'
import { importCommits } from '../../shared/gitimport'

const setup = (over = {}) => {
  const s = {
    db: { frags: [], reports: [], nid: 1, cfg: { repos: [{ n: 'r', p: 'D:\\r', on: true }] } },
    notify: vi.fn(), updated: vi.fn(), persist: vi.fn(),
    collect: vi.fn(async () => []),
    generate: vi.fn(async () => '报告正文'),
    ...over
  }
  s.getDb = () => s.db
  s.setDb = (db) => { s.db = db }
  s.run = (type, now) => runReportJob({ type, now, getDb: s.getDb, setDb: s.setDb, persist: s.persist, notify: s.notify, updated: s.updated, collect: s.collect, importCommits, generate: s.generate })
  return s
}
const MON = new Date(2026, 10, 16, 9, 0)

describe('runReportJob', () => {
  it('daily：导入当天提交后生成并覆盖保存', async () => {
    const s = setup({ collect: vi.fn(async () => [{ h: 'a1', t: '10:00', m: 'feat: x', r: 'r' }]) })
    await s.run('daily', MON)
    expect(s.collect).toHaveBeenCalledWith('2026-11-16', expect.any(Array), expect.any(Function))
    expect(s.generate).toHaveBeenCalledWith(s.db.cfg, 'daily', expect.objectContaining({ d: '2026-11-16' }), expect.any(Array))
    expect(s.db.reports).toEqual([expect.objectContaining({ type: 'daily', d: '2026-11-16', text: '报告正文' })])
    expect(s.persist).toHaveBeenCalled()
  })
  it('weekly：meta 为上一周；对周期内 ≤ 今天逐日回填 collect', async () => {
    const s = setup()
    s.db.frags = [{ id: 1, d: '2026-11-10', done: true, x: '上周事' }]
    await s.run('weekly', MON)
    expect(s.generate).toHaveBeenCalledWith(expect.any(Object), 'weekly', expect.objectContaining({ from: '2026-11-09', to: '2026-11-15', d: 'W-2026-11-09' }), expect.any(Array))
    const days = s.collect.mock.calls.map((c) => c[0])
    expect(days).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'])
  })
  it('monthly：周期含未来日期时只回填 ≤ 今天', async () => {
    const s = setup()
    s.db.frags = [{ id: 1, d: '2026-10-05', done: true, x: '上月事' }]
    await s.run('monthly', new Date(2026, 10, 1, 9, 0))
    const days = s.collect.mock.calls.map((c) => c[0])
    expect(days).toHaveLength(31) // 10-01..10-31 全 ≤ 今天
    expect(days[days.length - 1]).toBe('2026-10-31')
  })
  it('周期内无碎片 → 跳过通知，不 generate 不写报告', async () => {
    const s = setup()
    await s.run('weekly', MON)
    expect(s.generate).not.toHaveBeenCalled()
    expect(s.db.reports).toEqual([])
    expect(s.notify).toHaveBeenCalledWith('工作报告助手', expect.stringContaining('跳过周报生成'))
  })
  it('同 type+周期 已存在 → 覆盖 text/when 不新增', async () => {
    const s = setup()
    s.db.frags = [{ id: 1, d: '2026-11-16', done: true, x: '事' }]
    s.db.reports = [{ type: 'daily', d: '2026-11-16', when: 'old', text: '旧' }]
    await s.run('daily', MON)
    expect(s.db.reports).toHaveLength(1)
    expect(s.db.reports[0].text).toBe('报告正文')
  })
  it('await 期间 db 被替换 → 报告写进最新 db（不丢）', async () => {
    const s = setup()
    s.db.frags = [{ id: 1, d: '2026-11-16', done: true, x: '事' }]
    s.collect = vi.fn(async () => {
      s.db = { ...s.db, frags: [...s.db.frags, { id: 2, d: '2026-11-16', done: false, x: '并发新增' }] } // 模拟渲染端保存替换
      return []
    })
    await s.run('daily', MON)
    expect(s.db.frags).toHaveLength(2)
    expect(s.db.reports).toHaveLength(1)
  })
  it('generate 抛错 → 失败通知，不写报告', async () => {
    const s = setup({ generate: vi.fn(async () => { throw new Error('ai down') }) })
    s.db.frags = [{ id: 1, d: '2026-11-16', done: true, x: '事' }]
    await s.run('daily', MON)
    expect(s.db.reports).toEqual([])
    expect(s.notify).toHaveBeenCalledWith('工作报告助手', expect.stringContaining('执行失败'))
  })
})
