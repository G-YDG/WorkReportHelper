import { describe, it, expect } from 'vitest'
import { importCommits, importedHashes } from '../../shared/gitimport'

const db = {
  frags: [{ id: 1, d: '2026-10-19', t: '09:00', x: '已有碎片', done: true, h: 'aaa1111', r: 'alpha' }],
  reports: [], cfg: {}, nid: 2
}
const commits = [
  { h: 'bbb2222', t: '10:30', m: 'feat: 新接口', r: 'alpha' },
  { h: 'aaa1111', t: '11:00', m: 'fix: 已导入过的', r: 'alpha' },
  { h: 'ccc3333', t: '14:20', m: 'fix: 修复登录', r: 'beta' }
]

describe('gitimport（纯逻辑）', () => {
  it('按 hash 去重：只导入新提交，标记已完成', () => {
    const { db: next, added } = importCommits(db, commits, '2026-10-19')
    expect(added).toBe(2)
    expect(next.nid).toBe(4)
    const fresh = next.frags.filter((f) => f.h === 'bbb2222' || f.h === 'ccc3333')
    expect(fresh).toHaveLength(2)
    fresh.forEach((f) => {
      expect(f.done).toBe(true)
      expect(f.d).toBe('2026-10-19')
      expect(f.r).toBeTruthy()
    })
  })
  it('不修改入参 db', () => {
    const before = JSON.stringify(db)
    importCommits(db, commits, '2026-10-19')
    expect(JSON.stringify(db)).toBe(before)
  })
  it('全部已导入时 added 为 0', () => {
    expect(importCommits(db, [commits[1]], '2026-10-19').added).toBe(0)
  })
  it('空提交列表安全', () => {
    expect(importCommits(db, [], '2026-10-19').added).toBe(0)
    expect(importedHashes(db).size).toBe(1)
  })
})
