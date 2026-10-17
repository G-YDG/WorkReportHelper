// src/main/services/git.js
import { execFile } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join, basename } from 'node:path'

const run = (args, cwd, timeout = 10000) =>
  new Promise((resolve, reject) => {
    execFile('git', args, { cwd, timeout, maxBuffer: 10 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message))
      else resolve(stdout)
    })
  })

// 解析 git log 输出：%x1f 分隔字段、%x1e 分隔记录，多行 commit message（%B）不破坏结构
export function parseGitLog(stdout) {
  return String(stdout)
    .split('\x1e')
    .map((rec) => rec.replace(/^\n/, '').trim())
    .filter(Boolean)
    .map((rec) => {
      const [h, t, ...rest] = rec.split('\x1f')
      return { h: (h || '').trim(), t: (t || '').trim(), m: rest.join('\x1f').trim() }
    })
}

export async function collectCommits(date, repos, onProgress) {
  const results = []
  await Promise.all(
    repos
      .filter((r) => r.on !== false && r.p)
      .map(async (repo) => {
        const since = date + 'T00:00:00'
        const until = date + 'T23:59:59'
        try {
          // 「本人」= 仓库 git config 的 user.email（与用户平时提交身份一致）
          let authorEmail = ''
          try {
            authorEmail = (await run(['config', 'user.email'], repo.p)).trim().toLowerCase()
          } catch {
            /* 未配置邮箱的仓库退回不过滤 */
          }
          const out = await run(
            [
              'log',
              '--since=' + since,
              '--until=' + until,
              ...(authorEmail ? ['--author=' + authorEmail] : []),
              // %x1f 字段分隔 / %x1e 记录分隔：%B 保留完整多行 message
              '--pretty=format:%h%x1f%ad%x1f%B%x1e',
              '--date=format:%H:%M'
            ],
            repo.p
          )
          parseGitLog(out).forEach((c) => results.push({ ...c, r: repo.n, d: date }))
          onProgress?.(repo.n, true, results.length)
        } catch (e) {
          onProgress?.(repo.n, false, String(e.message || e).split('\n')[0])
        }
      })
  )
  return results.sort((a, b) => b.t.localeCompare(a.t))
}

export async function scanRepos(dir) {
  const found = []
  const walk = (d, depth) => {
    if (depth > 3) return
    let entries
    try {
      entries = readdirSync(d, { withFileTypes: true })
    } catch {
      return
    }
    if (entries.some((e) => e.isDirectory() && e.name === '.git')) {
      found.push({ n: basename(d), p: d })
      return // 已是仓库根，不再向下
    }
    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') {
        walk(join(d, e.name), depth + 1)
      }
    }
  }
  walk(dir, 0)
  return found
}
