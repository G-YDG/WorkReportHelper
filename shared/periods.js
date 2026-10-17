const pad = (n) => String(n).padStart(2, '0')
const WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
export const keyOf = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
export const labelOf = (k, now = new Date()) => {
  const t = keyOf(now)
  const y = keyOf(new Date(now.getTime() - 864e5))
  const head = k === t ? '今天' : k === y ? '昨天' : k.replace(/^\d{4}-/, '')
  return head + ' · ' + WD[new Date(k + 'T00:00:00').getDay()]
}
export const mondayOf = (d) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}
export const isoWeek = (d) => {
  const m = mondayOf(d)
  const t = new Date(m)
  t.setDate(t.getDate() + 3)
  const y = t.getFullYear()
  const jan = new Date(y, 0, 1)
  const wk = Math.ceil(((t - jan) / 864e5 + jan.getDay() + 1) / 7)
  return { label: y + ' 年第 ' + pad(wk) + ' 周', from: keyOf(m), to: keyOf(new Date(m.getTime() + 6 * 864e5)), d: 'W-' + keyOf(m) }
}
export const monthOf = (d) => ({
  label: d.getFullYear() + ' 年 ' + pad(d.getMonth() + 1) + ' 月',
  from: keyOf(new Date(d.getFullYear(), d.getMonth(), 1)),
  to: keyOf(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
  d: 'M-' + d.getFullYear() + '-' + pad(d.getMonth() + 1)
})
export const genMeta = (type, now = new Date()) => {
  if (type === 'weekly') return { ...isoWeek(now), name: '本周' }
  if (type === 'monthly') return { ...monthOf(now), name: '本月' }
  const k = keyOf(now)
  return { d: k, from: k, to: k, name: '今天' }
}
export const TP = { daily: '日报', weekly: '周报', monthly: '月报' }
