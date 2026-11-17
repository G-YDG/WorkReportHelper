import { describe, it, expect } from 'vitest'
import { keyOf, labelOf, isoWeek, monthOf, genMeta, prevMeta, shiftDay, mondayOfWeekValue, mondayOf } from '../../shared/periods'

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

describe('prevMeta', () => {
  it('weekly：周一触发 → 上一自然周（含 name 上周）', () => {
    const m = prevMeta('weekly', new Date(2026, 10, 16, 9, 0)) // 2026-11-16 周一
    expect(m.from).toBe('2026-11-09')
    expect(m.to).toBe('2026-11-15')
    expect(m.d).toBe('W-2026-11-09')
    expect(m.name).toBe('上周')
  })
  it('weekly：跨 DST 的周一凌晨仍取上一周（日历减法而非毫秒减法）', () => {
    const m = prevMeta('weekly', new Date(2026, 2, 9, 0, 30)) // 周一 00:30
    expect(m.from).toBe('2026-03-02')
  })
  it('monthly：1 号触发 → 上一自然月', () => {
    const m = prevMeta('monthly', new Date(2026, 10, 1, 9, 0))
    expect(m.from).toBe('2026-10-01')
    expect(m.to).toBe('2026-10-31')
    expect(m.d).toBe('M-2026-10')
    expect(m.name).toBe('上月')
  })
  it('monthly：跨年 1 月 → 上年 12 月', () => {
    expect(prevMeta('monthly', new Date(2026, 0, 1)).d).toBe('M-2025-12')
  })
  it('daily：等同 genMeta daily', () => {
    const now = new Date(2026, 10, 16, 18, 30)
    expect(prevMeta('daily', now)).toEqual({ ...genMeta('daily', now), name: '今天' })
  })
})

describe('shiftDay / 周值互转', () => {
  it('shiftDay 跨月跨年边界', () => {
    expect(shiftDay('2026-11-01', -1)).toBe('2026-10-31')
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftDay('2026-11-16', 0)).toBe('2026-11-16')
  })
  it('isoWeek 输出 ISO 周值 value', () => {
    expect(isoWeek(new Date(2026, 10, 16)).value).toBe('2026-W47')
    expect(isoWeek(new Date(2026, 0, 1)).value).toBe('2026-W01')
  })
  it('mondayOfWeekValue 周值反解周一（含跨年周）', () => {
    expect(mondayOfWeekValue('2026-W47')).toBe('2026-11-16')
    expect(mondayOfWeekValue('2026-W01')).toBe('2025-12-29')
    expect(mondayOfWeekValue('2026-W53')).toBe('2026-12-28')
  })
  it('周值往返一致', () => {
    for (const k of ['2026-11-16', '2026-01-01', '2026-12-31', '2025-12-29']) {
      expect(mondayOfWeekValue(isoWeek(new Date(k + 'T00:00:00')).value)).toBe(mondayOf(new Date(k + 'T00:00:00')) && keyOf(mondayOf(new Date(k + 'T00:00:00'))))
    }
  })
})

describe('ISO 周号非幸运年份（1 月 1 日周五/周六）', () => {
  it('2027（元旦周五）周号不错位、年末不产生非法 W53', () => {
    expect(isoWeek(new Date(2027, 0, 7)).value).toBe('2027-W01')
    expect(isoWeek(new Date(2027, 11, 27)).value).toBe('2027-W52')
    expect(isoWeek(new Date(2021, 0, 4)).value).toBe('2021-W01')
  })
  it('2027 逐日周值往返一致', () => {
    for (const k of ['2027-01-04', '2027-06-15', '2027-12-27', '2028-01-01']) {
      const d = new Date(k + 'T00:00:00')
      expect(mondayOfWeekValue(isoWeek(d).value)).toBe(keyOf(mondayOf(d)))
    }
  })
})
