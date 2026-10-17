import { describe, it, expect } from 'vitest'
import { buildPrompt, buildInstruction, buildRecords, composePrompt, localReport } from '../../shared/ai-text'

const frags = [
  { d: '2026-10-16', t: '09:00', x: '评审会', done: true },
  { d: '2026-10-16', t: '10:00', x: '修 bug', done: false },
  { d: '2026-10-16', t: '11:00', x: 'feat: 新增导出接口', done: true, r: 'order-center' }
]

describe('buildPrompt（用户日报格式）', () => {
  it('日报：Markdown 标题层级（二级=段落/三级=项目/四级=类别）', () => {
    const p = buildPrompt({ name: '今天', from: '2026-10-16', to: '2026-10-16' }, 'daily', frags)
    expect(p).toContain('工作汇报助理')
    expect(p).toContain('「### 今日完成工作」')
    expect(p).toContain('「#### 仓库名」')
    expect(p).toContain('「**类别**」')
    expect(p).toContain('「### 未完成工作」')
    // 记录行带仓库名标记，供 AI 分组
    expect(p).toContain('[order-center]')
    expect(p).toContain('评审会')
    expect(p).toContain('共 3 条')
  })
  it('周报/月报：标题随周期变化，分组规则一致', () => {
    const w = buildPrompt({ name: '本周', from: '2026-10-12', to: '2026-10-18' }, 'weekly', frags)
    expect(w).toContain('「### 本周完成工作」')
    const m = buildPrompt({ name: '本月', from: '2026-10-01', to: '2026-10-31' }, 'monthly', frags)
    expect(m).toContain('「### 本月完成工作」')
  })
})

describe('指令与记录分离', () => {
  it('buildInstruction 只含指令（无记录段）', () => {
    const ins = buildInstruction({ name: '今天' }, 'daily')
    expect(ins).toContain('工作汇报助理')
    expect(ins).toContain('「### 今日完成工作」')
    expect(ins).not.toContain("工作碎片（共")
    expect(ins).not.toContain("工作碎片（共")
  })
  it('buildRecords 只含记录段', () => {
    const rec = buildRecords(frags)
    expect(rec).toContain('工作碎片（共 3 条）')
    expect(rec).toContain('[order-center]')
    expect(rec).not.toContain('输出格式')
  })
  it('buildPrompt = 指令 + 记录', () => {
    const p = buildPrompt({ name: '今天' }, 'daily', frags)
    expect(p).toBe(buildInstruction({ name: '今天' }, 'daily') + '\n\n' + buildRecords(frags))
  })
  it('composePrompt：用户指令覆盖默认，记录始终由数据生成', () => {
    const custom = '自定义指令：只用一句话总结'
    const p = composePrompt(custom, { name: '今天' }, 'daily', frags)
    expect(p).toContain('自定义指令：只用一句话总结')
    expect(p).toContain('工作碎片（共 3 条）')
    expect(p).not.toContain('输出格式（严格遵守）') // 默认指令被覆盖
    // 空指令回退默认
    expect(composePrompt('', { name: '今天' }, 'daily', frags)).toContain('输出格式（严格遵守）')
  })
})

describe('localReport（降级模板对齐用户格式）', () => {
  it('日报：二级段落标题 + 三级项目标题 + 四级类别标题', () => {
    const out = localReport('daily', frags)
    expect(out).toContain('### 今日完成工作')
    expect(out).toContain('#### order-center')
    expect(out).toContain('**功能开发**')
    expect(out).toContain('- feat: 新增导出接口')
    expect(out).toContain('### 未完成工作')
    expect(out).toContain('- 修 bug')
  })
  it('全部完成时未完成段整段省略', () => {
    const out = localReport('daily', [{ d: '2026-10-16', t: '09:00', x: '完成 A', done: true }])
    expect(out).not.toContain('未完成工作')
    expect(out).not.toContain('需协调工作')
  })
  it('周报/月报：标题随周期变化', () => {
    expect(localReport('weekly', frags)).toContain('### 本周完成工作')
    expect(localReport('monthly', frags)).toContain('### 本月完成工作')
  })
  it('空记录不抛错', () => {
    expect(() => localReport('daily', [])).not.toThrow()
    expect(() => buildPrompt({ name: '今天', from: 'x', to: 'x' }, 'daily', [])).not.toThrow()
  })
})

describe('类别块间距', () => {
  it('同项目不同类别之间空一行', () => {
    const out = localReport('daily', [
      { d: '2026-10-16', t: '09:00', x: 'feat(app): 功能 A', done: true, r: 'work-report-helper' },
      { d: '2026-10-16', t: '10:00', x: 'fix: 修复 B', done: true, r: 'work-report-helper' }
    ])
    expect(out).toContain('- feat(app): 功能 A\n\n**问题修复**')
  })
})

describe('项目间距', () => {
  it('不同项目之间空一行（与类别块分隔拉开一档）', () => {
    const out = localReport('daily', [
      { d: '2026-10-16', t: '09:00', x: 'feat(app): 项目A功能', done: true, r: 'alpha' },
      { d: '2026-10-16', t: '10:00', x: 'feat: 项目B功能', done: true, r: 'beta' }
    ])
    expect(out).toContain('- feat(app): 项目A功能\n\n\n#### beta')
  })
})
