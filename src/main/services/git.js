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
              '--pretty=format:%h|%ad|%s',
              '--date=format:%H:%M'
            ],
            repo.p
          )
          out
            .split('\n')
            .filter(Boolean)
            .forEach((line) => {
              const [h, t, ...rest] = line.split('|')
              results.push({ h, t, m: rest.join('|'), r: repo.n, d: date })
            })
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
