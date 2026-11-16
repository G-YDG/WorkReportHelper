import { describe, it, expect } from 'vitest'
import { createScheduler } from '../../src/main/services/scheduler'

const cfg = (over = {}) => ({
  sched: {
    daily: { on: true, time: '18:30' },
    weekly: { on: true, time: '09:00', weekday: 1 },
    monthly: { on: true, time: '09:00', day: 1 },
    ...over
  }
})
const db = (over) => ({ frags: [], reports: [], cfg: cfg(over) })
const MON = new Date(2026, 10, 16, 9, 0) // 周一
const make = (now, calls) => createScheduler({ now: () => now, onTrigger: async (_db, _n, type) => calls.push(type) })

describe('scheduler 多类型', () => {
  it('daily 到点触发一次，同分钟不重复', async () => {
    const calls = []
    const s = make(new Date(2026, 10, 16, 18, 30), calls)
    s.tick(db()); s.tick(db())
    await new Promise((r) => setTimeout(r, 0))
    expect(calls).toEqual(['daily'])
  })
  it('weekly 仅在配置星期几到点触发', async () => {
    const calls = []
    make(MON, calls).tick(db()) // 周一 09:00 → weekly
    make(new Date(2026, 10, 17, 9, 0), calls).tick(db()) // 周二 → 不触发
    await new Promise((r) => setTimeout(r, 0))
    expect(calls).toEqual(['weekly'])
  })
  it('monthly 仅在配置日期到点触发；二月 28 日可触发', async () => {
    const calls = []
    make(new Date(2026, 10, 1, 9, 0), calls).tick(db()) // 11-01 → monthly
    make(new Date(2026, 10, 17, 9, 0), calls).tick(db()) // 17 号周二 → monthly/weekly 均不触发
    make(new Date(2027, 1, 28, 9, 0), calls).tick(db({ monthly: { on: true, time: '09:00', day: 28 } }))
    await new Promise((r) => setTimeout(r, 0))
    expect(calls).toEqual(['monthly', 'monthly'])
  })
  it('同一分钟多类型同时到点各自触发', async () => {
    const calls = []
    const s = make(new Date(2027, 1, 1, 9, 0), calls) // 2027-02-01 是周一且 1 号：weekly+monthly
    s.tick(db({ daily: { on: true, time: '09:00' } })) // daily 也改 09:00
    await new Promise((r) => setTimeout(r, 0))
    expect(calls.sort()).toEqual(['daily', 'monthly', 'weekly'])
  })
  it('on=false 的类型不触发；无 sched 不触发', async () => {
    const calls = []
    make(MON, calls).tick(db({ weekly: { on: false, time: '09:00', weekday: 1 } }))
    make(MON, calls).tick({ frags: [], reports: [], cfg: {} })
    await new Promise((r) => setTimeout(r, 0))
    expect(calls).toEqual([])
  })
  it('weekday/day 缺省回退 1', async () => {
    const calls = []
    make(MON, calls).tick(db({ weekly: { on: true, time: '09:00' }, monthly: { on: true, time: '09:00' } }))
    await new Promise((r) => setTimeout(r, 0))
    expect(calls).toEqual(['weekly']) // 16 号非 1 号，monthly 不触发
  })
})

describe('scheduler 多时间点', () => {
  it('daily 多时间点各自到点触发一次，同时间点同分钟不重复', async () => {
    const calls = []
    const cfgOver = { daily: { on: true, times: ['09:00', '18:30'] }, weekly: { on: false, times: ['09:00'], weekday: 1 }, monthly: { on: false, times: ['09:00'], day: 1 } }
    const s = make(new Date(2026, 10, 16, 9, 0), calls)
    s.tick(db(cfgOver))
    await new Promise((r) => setTimeout(r, 0))
    expect(calls).toEqual(['daily'])
    const s2 = make(new Date(2026, 10, 16, 18, 30), calls)
    s2.tick(db(cfgOver))
    s2.tick(db(cfgOver))
    await new Promise((r) => setTimeout(r, 0))
    expect(calls).toEqual(['daily', 'daily'])
  })
  it('weekly 多时间点与星期几条件叠加', async () => {
    const calls = []
    const over = { weekly: { on: true, times: ['09:00', '12:00'], weekday: 1 } }
    make(MON, calls).tick(db(over)) // 周一 09:00 命中第一个
    make(new Date(2026, 10, 16, 12, 0), calls).tick(db(over)) // 周一 12:00 命中第二个
    make(new Date(2026, 10, 17, 9, 0), calls).tick(db(over)) // 周二不触发
    await new Promise((r) => setTimeout(r, 0))
    expect(calls).toEqual(['weekly', 'weekly'])
  })
})
