import { describe, it, expect } from 'vitest'
import { buildPrompt, localReport } from '../../shared/ai-text'

const frags = [
  { d: '2026-10-16', t: '09:00', x: '评审会', done: true },
  { d: '2026-10-16', t: '10:00', x: '修 bug', done: false }
]

describe('ai-text', () => {
  it('buildPrompt 含四段结构与记录', () => {
    const p = buildPrompt({ name: '今天', from: '2026-10-16', to: '2026-10-16' }, 'daily', frags)
    expect(p).toContain('工作汇报助理')
    expect(p).toContain('今日完成')
    expect(p).toContain('评审会')
    expect(p).toContain('共 2 条')
  })
  it('localReport 日报：完成与进行中分开', () => {
    const out = localReport('daily', frags)
    expect(out).toContain('【今日完成】')
    expect(out).toContain('1. 评审会')
    expect(out).toContain('【进行中】')
    expect(out).toContain('修 bug（推进中）')
    expect(out).toContain('【明日计划】')
  })
  it('localReport 周报：主要产出结构', () => {
    const out = localReport('weekly', frags)
    expect(out).toContain('【主要产出】')
    expect(out).toContain('【下阶段计划】')
  })
  it('空记录不抛错', () => {
    expect(() => localReport('daily', [])).not.toThrow()
    expect(() => buildPrompt({ name: '今天', from: 'x', to: 'x' }, 'daily', [])).not.toThrow()
  })
})
