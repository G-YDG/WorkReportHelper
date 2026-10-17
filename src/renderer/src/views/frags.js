// src/renderer/src/views/frags.js — 工作碎片视图：按日期回看 / 搜索 / 批量操作 / 手动新增
import { state, persist, fragOfDay } from '../state'
import { $, esc, toast } from '../ui'
import { keyOf, labelOf } from '../../../../shared/periods'
import { renderAll } from '../main'
import { fragRow, bindFragRows } from './today'
import { openGit } from './gitimport'
import { openAdd } from './frags-add'

const dayKeys = () => [...new Set(state.db.frags.map((f) => f.d))].sort().reverse()

export function renderFrags() {
  const q = $('fq').value.trim().toLowerCase()
  const matchOf = (k) => (q ? fragOfDay(k).filter((f) => f.x.toLowerCase().includes(q)) : fragOfDay(k))
  let days = dayKeys()
  if (q) days = days.filter((k) => matchOf(k).length)
  if (!days.length || !days.includes(state.selDay)) state.selDay = days[0] || ''
  $('frag-days').innerHTML = days.length
    ? days.map((k) => {
        const list = matchOf(k)
        const last = list[list.length - 1] || fragOfDay(k)[fragOfDay(k).length - 1]
        return '<button class="repitem' + (k === state.selDay ? ' on' : '') + '" data-d="' + k + '"><b>' + labelOf(k) +
          '<span class="tag">' + fragOfDay(k).length + ' 条</span></b><span>' + (last ? esc(last.x) : '（空）') + '</span></button>'
      }).join('')
    : '<div class="empty">还没有任何碎片</div>'
  $('frag-days').querySelectorAll('.repitem').forEach((b) => (b.onclick = () => { state.selDay = b.dataset.d; renderFrags() }))
  const list = state.selDay ? matchOf(state.selDay) : []
  $('frag-stats').textContent = q
    ? '匹配 ' + days.reduce((s, k) => s + matchOf(k).length, 0) + ' 条 · 跨 ' + days.length + ' 天'
    : state.selDay ? '共 ' + list.length + ' 条 · 完成 ' + list.filter((f) => f.done).length : ''
  const box = $('frag-list')
  box.innerHTML = list.length ? list.map(fragRow).join('')
    : '<div class="empty">' + (q ? '这一天没有匹配的碎片' : state.selDay ? '这一天还没有记录' : '还没有任何碎片，去「今日记录」记一条') + '</div>'
  bindFragRows(box)
  $('frag-when').textContent = state.selDay ? labelOf(state.selDay) + ' · 原始记录 ' + fragOfDay(state.selDay).length + ' 条' : ''
}

export function bindFrags() {
  $('fq').oninput = renderFrags
  $('frag-add').onclick = () => openAdd()
  $('frag-git').onclick = () => openGit(state.selDay || keyOf(new Date()))
  $('frag-done').onclick = () => {
    const list = fragOfDay(state.selDay), n = list.filter((f) => !f.done).length
    if (!list.length) return toast('这一天还没有记录', 'err')
    if (!n) return toast('这一天的记录都已标记完成', 'ok')
    list.forEach((f) => (f.done = true)); persist(); renderAll()
    toast('已完成 · 本批 ' + n + ' 条标记为完成', 'ok')
  }
  $('frag-clear').onclick = () => {
    const list = fragOfDay(state.selDay)
    if (!list.length) return toast('这一天还没有记录', 'err')
    if (!confirm('确定清空 ' + state.selDay + ' 全部 ' + list.length + ' 条碎片？\n（已生成的日报不受影响）')) return
    state.db.frags = state.db.frags.filter((f) => f.d !== state.selDay); persist(); renderAll()
    toast('已清空 ' + state.selDay + ' 的 ' + list.length + ' 条碎片', 'ok')
  }
}
