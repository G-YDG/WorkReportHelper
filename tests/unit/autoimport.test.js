import { describe, it, expect, vi } from 'vitest'
import { clampMinutes, createGitAutoImporter } from '../../src/main/services/autoimport'
import { importCommits } from '../../shared/gitimport'

const deps = (over = {}) => {
  const state = { db: { frags: [], reports: [], nid: 1, cfg: { repos: [{ n: 'r', p: 'D:\\r', on: true }], gitAuto: { on: true, minutes: 30 } } } }
  const notify = vi.fn()
  const collect = vi.fn(async () => [{ h: 'a1', t: '10:00', m: 'feat: x', r: 'r' }])
  return {
    state, notify, collect, importCommits,
    getDb: () => state.db,
    setDb: (db) => { state.db = db },
    updated: vi.fn(),
    ...over
  }
}

describe('clampMinutes', () => {
  it('越界收敛 / 非法回退 30', () => {
    expect(clampMinutes(1)).toBe(5)
    expect(clampMinutes(99999)).toBe(1440)
    expect(clampMinutes('abc')).toBe(30)
    expect(clampMinutes(30.4)).toBe(30)
  })
})
describe('createGitAutoImporter', () => {
  it('开启时首 tick 立即导入并通知 added', async () => {
    const d = deps()
    let t = new Date(2026, 10, 16, 10, 0)
    const imp = createGitAutoImporter({ now: () => t, ...d })
    imp.tick(d.state.db)
    await vi.waitFor(() => expect(d.notify).toHaveBeenCalledWith('工作报告助手', '自动导入 1 条 Git 提交'))
    expect(d.state.db.frags).toHaveLength(1)
    expect(d.updated).toHaveBeenCalled()
  })
  it('间隔内重复 tick 不再 collect；到间隔后再次 collect 但无新增不通知', async () => {
    const d = deps()
    let t = new Date(2026, 10, 16, 10, 0)
    const imp = createGitAutoImporter({ now: () => t, ...d })
    imp.tick(d.state.db)
    await vi.waitFor(() => expect(d.collect).toHaveBeenCalledTimes(1))
    // 等首轮 job 真正结束（updated 在 job 末尾调用；waitFor 轮询为宏任务，确保 finally 已复位 running）
    await vi.waitFor(() => expect(d.updated).toHaveBeenCalledTimes(1))
    t = new Date(2026, 10, 16, 10, 29)
    imp.tick(d.state.db)
    expect(d.collect).toHaveBeenCalledTimes(1)
    t = new Date(2026, 10, 16, 10, 30)
    imp.tick(d.state.db)
    await vi.waitFor(() => expect(d.collect).toHaveBeenCalledTimes(2))
    expect(d.notify).toHaveBeenCalledTimes(1) // 第二次 added=0 → 不通知
  })
  it('关闭不 collect；失败通知按仓库集合去重', async () => {
    const d = deps({ collect: vi.fn(async (_date, _repos, onProgress) => { onProgress('r', false, 'boom'); return [] }) })
    let t = new Date(2026, 10, 16, 10, 0)
    const imp = createGitAutoImporter({ now: () => t, ...d })
    d.state.db.cfg.gitAuto.on = false
    imp.tick(d.state.db)
    expect(d.collect).not.toHaveBeenCalled()
    d.state.db.cfg.gitAuto.on = true
    imp.tick(d.state.db)
    await vi.waitFor(() => expect(d.notify).toHaveBeenCalledTimes(1))
    t = new Date(2026, 10, 16, 10, 30)
    imp.tick(d.state.db)
    await vi.waitFor(() => expect(d.collect).toHaveBeenCalledTimes(2))
    expect(d.notify).toHaveBeenCalledTimes(1) // 相同失败集合不重复通知
  })
  it('无启用仓库时不 collect 不通知', async () => {
    const d = deps()
    d.state.db.cfg.repos = []
    const imp = createGitAutoImporter({ now: () => new Date(2026, 10, 16, 10, 0), ...d })
    imp.tick(d.state.db)
    await new Promise((r) => setTimeout(r, 0))
    expect(d.collect).not.toHaveBeenCalled()
    expect(d.notify).not.toHaveBeenCalled()
  })
})
