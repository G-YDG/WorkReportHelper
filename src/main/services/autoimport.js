// src/main/services/autoimport.js — Git 提交按间隔自动导入（纯逻辑，依赖注入可单测）
// 开启时启动立即执行一次；之后每 minutes 分钟一次；只导入当天提交（hash 去重由 importCommits 保证）
// 通知策略：仅 added>0 通知导入结果；失败通知按「失败仓库集合」去重防刷屏
import { keyOf } from '../../../shared/periods'

export const clampMinutes = (v) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(1440, Math.max(5, n)) : 30
}

export function createGitAutoImporter({ now = () => new Date(), getDb, setDb, updated, notify, collect, importCommits }) {
  let lastRun = 0 // 0 = 从未运行 → 首 tick 立即执行
  let running = false
  let lastFailKey = ''

  async function job() {
    try {
      const today = keyOf(now())
      const repos = (getDb().cfg.repos || []).filter((r) => r.on !== false && r.p)
      if (!repos.length) return
      const failed = []
      const commits = await collect(today, repos, (repo, ok) => { if (!ok) failed.push(repo) })
      // await 期间渲染端可能保存替换 dbCache：导入基准现取 getDb()
      const { db: next, added } = importCommits(getDb(), commits, today)
      if (added) {
        setDb(next) // 同步 fs 落盘，磁盘满/文件占用会抛错 → 下方 catch 通知
        updated()
        notify('工作报告助手', '自动导入 ' + added + ' 条 Git 提交')
      }
      const key = [...new Set(failed)].sort().join(',')
      if (key && key !== lastFailKey) notify('工作报告助手', 'Git 自动导入失败：' + key)
      lastFailKey = key
    } catch (e) {
      // 落盘等意外错误：通知用户（按错误去重防刷屏），不留未处理 rejection
      const msg = String(e.message || e).slice(0, 100)
      const key = 'job:' + msg
      if (key !== lastFailKey) notify('工作报告助手', 'Git 自动导入失败：' + msg)
      lastFailKey = key
    }
  }

  return {
    tick(db) {
      const g = db.cfg?.gitAuto
      if (!g?.on || running) return
      const t = now().getTime()
      if (lastRun && t - lastRun < clampMinutes(g.minutes) * 60000) return
      lastRun = t
      running = true
      void job().finally(() => { running = false })
    }
  }
}
