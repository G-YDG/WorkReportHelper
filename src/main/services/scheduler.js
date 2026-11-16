import { keyOf } from '../../../shared/periods'

// 纯逻辑定时器：主进程 index.js 里 setInterval(() => s.tick(getDb()), 60_000)
// 只负责「到点且未重复触发」；无碎片跳过等业务判断在 onTrigger 内——
// 触发后可能先自动导入 Git 提交，触发前无法判断周期内是否已有碎片
// 三类型独立调度：daily 每天到点；weekly 配置星期几到点；monthly 配置日期到点
export function createScheduler({ now = () => new Date(), onTrigger }) {
  const lastFired = {} // key = type@time，值 = 日期+分钟 stamp（同时间点同分钟不重复）
  return {
    tick(db) {
      const sched = db.cfg?.sched || {}
      const n = now()
      const hm = String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0')
      const stamp = keyOf(n) + ' ' + hm
      for (const type of ['daily', 'weekly', 'monthly']) {
        const s = sched[type]
        if (!s?.on) continue
        if (type === 'weekly' && n.getDay() !== (s.weekday ?? 1)) continue
        if (type === 'monthly' && n.getDate() !== (s.day ?? 1)) continue
        // 多时间点：times 数组优先；旧单值 time 兼容回退
        const times = Array.isArray(s.times) && s.times.length ? s.times : s.time ? [s.time] : []
        for (const t of times) {
          const key = type + '@' + t
          if (t !== hm || lastFired[key] === stamp) continue
          lastFired[key] = stamp
          void onTrigger(db, n, type)
        }
      }
    }
  }
}
