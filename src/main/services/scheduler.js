import { keyOf } from '../../../shared/periods'

// 纯逻辑定时器：主进程 index.js 里 setInterval(() => s.tick(loadDb()), 60_000)
export function createScheduler({ now = () => new Date(), onTrigger }) {
  let lastFired = ''
  return {
    tick(db) {
      const { auto, time } = db.cfg || {}
      if (!auto) return
      const n = now()
      const hm = String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0')
      const stamp = keyOf(n) + ' ' + hm
      if (hm !== time || lastFired === stamp) return
      lastFired = stamp
      if (!db.frags.some((f) => f.d === keyOf(n))) return // 当天无碎片跳过
      void onTrigger(db, n)
    }
  }
}
