import { describe, it, expect } from 'vitest'
import { keyOf, labelOf, isoWeek, monthOf, genMeta } from '../../shared/periods'

describe('periods', () => {
  it('keyOf 补零', () => {
    expect(keyOf(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
  it('labelOf 今天/昨天/其他', () => {
    const today = new Date(2026, 9, 16, 12, 0)
    expect(labelOf('2026-10-16', today)).toContain('今天')
    expect(labelOf('2026-10-15', today)).toContain('昨天')
    expect(labelOf('2026-09-30', today)).toContain('09-30')
  })
  it('isoWeek 周一起点', () => {
    // 2026-10-14 是周三，所在周周一为 10-12
    const w = isoWeek(new Date(2026, 9, 14))
    expect(w.from).toBe('2026-10-12')
    expect(w.to).toBe('2026-10-18')
    expect(w.d).toBe('W-2026-10-12')
    expect(w.label).toContain('2026 年第')
  })
  it('monthOf', () => {
    const m = monthOf(new Date(2026, 9, 16))
    expect(m.from).toBe('2026-10-01')
    expect(m.to).toBe('2026-10-31')
    expect(m.d).toBe('M-2026-10')
  })
  it('genMeta 三种类型', () => {
    const now = new Date(2026, 9, 16, 12, 0)
    expect(genMeta('daily', now).d).toBe('2026-10-16')
    expect(genMeta('weekly', now).d).toBe('W-2026-10-12')
    expect(genMeta('monthly', now).d).toBe('M-2026-10')
  })
})
