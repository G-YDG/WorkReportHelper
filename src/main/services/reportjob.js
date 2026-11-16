// src/main/services/reportjob.js — 定时报告生成流程（纯逻辑，依赖注入可单测）
// 通知 → 周期内逐日回填 Git 提交 → 无碎片跳过 → 生成（AI/降级由 generate 适配器决定）→ 覆盖保存
// 所有 await 之后现取 getDb()：渲染端 db:save 可能替换主进程 dbCache，沿用旧引用会丢报告
import { genMeta, prevMeta, keyOf, TP } from '../../../shared/periods'

const pad = (n) => String(n).padStart(2, '0')

export async function runReportJob({ type, now, getDb, setDb, persist, notify, updated, collect, importCommits, generate }) {
  try {
    notify('工作报告助手', '定时' + TP[type] + '开始执行')
    const meta = type === 'daily' ? genMeta('daily', now) : prevMeta(type, now)
    let cur = getDb()
    const cfg = cur.cfg
    const repos = (cfg.repos || []).filter((r) => r.on !== false && r.p)
    const today = keyOf(now)
    // 回填日期：daily 仅当天；weekly/monthly 为周期内 ≤ 今天的每一天（含端点）
    const days = []
    if (type === 'daily') days.push(today)
    else {
      for (let d = new Date(meta.from + 'T00:00:00'); keyOf(d) <= meta.to && keyOf(d) <= today; d.setDate(d.getDate() + 1)) {
        days.push(keyOf(d))
      }
    }
    const failed = []
    if (repos.length) {
      notify('工作报告助手', '正在收集 Git 提交…')
      for (const day of days) {
        const commits = await collect(day, repos, (repo, ok) => { if (!ok) failed.push(repo) })
        const { db: next, added } = importCommits(cur, commits, day)
        if (added) { setDb(next); cur = getDb(); updated() }
      }
    }
    const frags = cur.frags.filter((f) => f.d >= meta.from && f.d <= meta.to)
    if (!frags.length) {
      notify('工作报告助手', meta.name + '无工作碎片，已跳过' + TP[type] + '生成')
      return
    }
    notify('工作报告助手', '正在生成' + TP[type] + '…')
    const text = await generate(cfg, type, meta, frags)
    const when = today + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes())
    const latest = getDb()
    const old = latest.reports.find((r) => r.type === type && r.d === meta.d)
    if (old) { old.text = text; old.when = when } else latest.reports.push({ type, d: meta.d, when, text })
    persist()
    updated()
    const failN = new Set(failed).size
    notify('工作报告助手', meta.name + TP[type] + '已生成' + (failN ? '（' + failN + ' 个仓库采集失败）' : ''))
  } catch (e) {
    notify('工作报告助手', '定时' + TP[type] + '执行失败：' + String(e.message || e).slice(0, 100))
  }
}
