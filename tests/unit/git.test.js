// tests/unit/git.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { collectCommits, scanRepos } from '../../src/main/services/git'

let root, repoA
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'wrh-git-'))
  repoA = join(root, 'alpha')
  mkdirSync(repoA)
  const run = (c, env) => execSync(c, { cwd: repoA, ...(env ? { env } : {}) })
  run('git init -q')
  run('git config user.email t@t')
  run('git config user.name T')
  writeFileSync(join(repoA, 'a.txt'), 'x')
  run('git add a.txt')
  // 固定日期的一次提交（env 必须真实传入，否则提交日期是"今天"，导致 --since 过滤为空）
  const env = { ...process.env, GIT_AUTHOR_DATE: '2026-10-15T10:30:00', GIT_COMMITTER_DATE: '2026-10-15T10:30:00' }
  run('git commit -qm "feat: 增加导出接口"', env)
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('git service', () => {
  it('collectCommits 返回指定日期提交并解析字段', async () => {
    const out = await collectCommits('2026-10-15', [{ n: 'alpha', p: repoA, on: true }])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ r: 'alpha', d: '2026-10-15', t: '10:30', m: 'feat: 增加导出接口' })
    expect(out[0].h).toMatch(/^[0-9a-f]{7,}$/)
  })
  it('collectCommits 跳过无效仓库且其余正常', async () => {
    const out = await collectCommits('2026-10-15', [
      { n: 'bad', p: join(root, 'nope'), on: true },
      { n: 'alpha', p: repoA, on: true }
    ])
    expect(out).toHaveLength(1)
    expect(out[0].r).toBe('alpha')
  })
  it('collectCommits 采集完整多行 commit message（含 body）', async () => {
    const run = (c, env) => execSync(c, { cwd: repoA, ...(env ? { env } : {}) })
    writeFileSync(join(repoA, 'c.txt'), 'z')
    run('git add c.txt')
    // cmd.exe 会截断含换行的参数，多行 message 用 -F 文件传入
    const msg = 'feat: 完整框架\n\n- 新增主进程入口\n- 新增 IPC 白名单\n- 新增渲染端骨架'
    writeFileSync(join(repoA, 'msg.txt'), msg)
    const env = { ...process.env, GIT_AUTHOR_DATE: '2026-10-15T14:00:00', GIT_COMMITTER_DATE: '2026-10-15T14:00:00' }
    run('git commit -qF msg.txt', env)
    const out = await collectCommits('2026-10-15', [{ n: 'alpha', p: repoA, on: true }])
    const multi = out.find((c) => c.m.startsWith('feat: 完整框架'))
    expect(multi).toBeTruthy()
    expect(multi.m).toContain('- 新增主进程入口')
    expect(multi.m).toContain('- 新增 IPC 白名单')
    expect(multi.m).toContain('- 新增渲染端骨架')
    // 单行提交仍正常且不含分隔符残留
    expect(out.find((c) => c.m === 'feat: 增加导出接口')).toBeTruthy()
  })
  it('collectCommits 过滤掉非本人（仓库 git config user.email）的提交', async () => {
    const run = (c, env) => execSync(c, { cwd: repoA, ...(env ? { env } : {}) })
    // 他人提交（同一日期）
    writeFileSync(join(repoA, 'b.txt'), 'y')
    run('git add b.txt')
    const other = { ...process.env, GIT_AUTHOR_NAME: 'Other', GIT_AUTHOR_EMAIL: 'other@x', GIT_COMMITTER_NAME: 'Other', GIT_COMMITTER_EMAIL: 'other@x', GIT_AUTHOR_DATE: '2026-10-15T11:00:00', GIT_COMMITTER_DATE: '2026-10-15T11:00:00' }
    run('git -c user.name=Other -c user.email=other@x commit -qm "chore: 他人提交"', other)
    const out = await collectCommits('2026-10-15', [{ n: 'alpha', p: repoA, on: true }])
    expect(out).toHaveLength(1)
    expect(out[0].m).toBe('feat: 增加导出接口')
  })
  it('scanRepos 发现 3 层内的 .git 目录', async () => {
    const nested = join(root, 'work', 'proj', 'beta')
    mkdirSync(nested, { recursive: true })
    execSync('git init -q', { cwd: nested })
    const found = await scanRepos(root)
    const names = found.map((f) => f.n).sort()
    expect(names).toContain('alpha')
    expect(names).toContain('beta')
  })
})
