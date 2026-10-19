import { keyOf } from '../../../shared/periods'

// 纯逻辑定时器：主进程 index.js 里 setInterval(() => s.tick(getDb()), 60_000)
// 只负责「到点且未重复触发」；无碎片跳过等业务判断在 onTrigger 内——
// 触发后可能先自动导入 Git 提交，触发前无法判断当天是否已有碎片
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
      void onTrigger(db, n)
    }
  }
}
