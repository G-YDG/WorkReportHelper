import { describe, it, expect, vi } from 'vitest'
import { createScheduler } from '../../src/main/services/scheduler'

const dbWith = (time, fragCount) => ({
  frags: Array.from({ length: fragCount }, (_, i) => ({ id: i, d: '2026-10-16', done: true })),
  reports: [],
  cfg: { auto: true, time }
})

describe('scheduler', () => {
  it('到达定时点且有碎片 → 生成并记录', async () => {
    const calls = []
    const s = createScheduler({
      now: () => new Date(2026, 9, 16, 18, 30),
      onTrigger: async (db) => {
        calls.push(db)
        return { generated: true }
      }
    })
    s.tick(dbWith('18:30', 3))
    await vi.waitFor(() => expect(calls).toHaveLength(1))
  })
  it('无碎片 → 跳过且不重复触发', async () => {
    const calls = []
    const s = createScheduler({ now: () => new Date(2026, 9, 16, 18, 30), onTrigger: async () => calls.push(1) })
    s.tick(dbWith('18:30', 0))
    s.tick(dbWith('18:30', 0))
    await vi.waitFor(() => {})
    expect(calls).toHaveLength(0)
  })
  it('同一分钟只触发一次；auto 关闭不触发', () => {
    let n = 0
    const s = createScheduler({ now: () => new Date(2026, 9, 16, 18, 30), onTrigger: async () => n++ })
    s.tick(dbWith('18:30', 2))
    s.tick(dbWith('18:30', 2))
    s.tick(dbWith('18:31', 2))
    expect(n).toBe(1)
    const s2 = createScheduler({ now: () => new Date(2026, 9, 16, 18, 30), onTrigger: async () => n++ })
    s2.tick({ frags: [{ id: 1 }], reports: [], cfg: { auto: false, time: '18:30' } })
    expect(n).toBe(1)
  })
})
