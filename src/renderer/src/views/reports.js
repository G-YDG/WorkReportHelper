// src/renderer/src/views/reports.js — 报告管理：列表 / Tab 筛选 / 编辑 / 复制 / 导出 .md / 重新生成
import { state, persist } from '../state'
import { $, esc, toast } from '../ui'
import { TP, labelOf, isoWeek, monthOf } from '../../../../shared/periods'
import { openGen } from './gen'

const repId = (r) => r.type + ':' + r.d
let repFilter = 'all'
let selRep = null

function repTitle(r) {
  if (r.type === 'daily') return labelOf(r.d)
  if (r.type === 'weekly') return isoWeek(new Date(r.d.slice(2) + 'T00:00:00')).label
  return r.d.replace('M-', '').replace('-', ' 年 ') + ' 月'
}
function repSrc(r) {
  if (r.type === 'daily') return '数据源 ' + r.d + ' 的碎片'
  if (r.type === 'weekly') { const w = isoWeek(new Date(r.d.slice(2) + 'T00:00:00')); return '数据源 ' + w.from + ' ~ ' + w.to + ' 的碎片' }
  const p = r.d.slice(2).split('-')
  return '数据源 ' + p[0] + ' 年 ' + p[1] + ' 月全月碎片'
}
const findRep = (id) => state.db.reports.find((r) => repId(r) === id)

export function renderReports() {
  const all = [...state.db.reports].sort((a, b) => b.d.localeCompare(a.d))
  const ls = repFilter === 'all' ? all : all.filter((r) => r.type === repFilter)
  $('rep-stats').textContent = '共 ' + all.length + ' 份 · 日报 ' + all.filter((r) => r.type === 'daily').length +
    ' / 周报 ' + all.filter((r) => r.type === 'weekly').length + ' / 月报 ' + all.filter((r) => r.type === 'monthly').length
  if (!ls.length) {
    $('rep-list').innerHTML = '<div class="empty">暂无' + (TP[repFilter] || '报告') + '<br>点「新建报告」生成一份</div>'
    $('rep-detail').style.display = 'none'
    return
  }
  $('rep-detail').style.display = ''
  if (!selRep || !findRep(selRep)) selRep = repId(ls[0])
  $('rep-list').innerHTML = ls.map((r) =>
    '<button class="repitem' + (repId(r) === selRep ? ' on' : '') + '" data-id="' + repId(r) + '"><b>' + repTitle(r) +
    '<span class="tag">' + TP[r.type] + '</span></b><span>' + esc(r.text.split('\n')[0]) + '</span></button>'
  ).join('')
  $('rep-list').querySelectorAll('.repitem').forEach((b) => (b.onclick = () => { selRep = b.dataset.id; renderReports() }))
  const cur = findRep(selRep)
  if (document.activeElement !== $('rep-text')) $('rep-text').value = cur.text
  $('rep-when').textContent = '生成于 ' + cur.when + ' · ' + repSrc(cur)
}

export function bindReports() {
  $('rep-tabs').querySelectorAll('button').forEach((b) => (b.onclick = () => {
    repFilter = b.dataset.t; selRep = null
    $('rep-tabs').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b))
    renderReports()
  }))
  // 新建报告：以当前筛选的周期类型为准（筛选停在日报/周报/月报时按该类型新建）
  $('rep-new').onclick = () => openGen(repFilter === 'all' ? 'daily' : repFilter)
  $('rep-text').oninput = (e) => { const r = findRep(selRep); if (r) { r.text = e.target.value; persist() } }
  $('rep-copy').onclick = async () => { try { await navigator.clipboard.writeText($('rep-text').value); toast('已复制', 'ok') } catch { toast('复制失败', 'err') } }
  $('rep-md').onclick = async () => {
    const r = findRep(selRep)
    if (!r) return
    const name = selRep.replace(/[:/]/g, '-') + '-' + TP[r.type] + '.md'
    const dir = state.db.cfg.dir || ''
    try {
      const p = await window.api.app.exportMd(name, $('rep-text').value, dir)
      toast('已保存 ' + p, 'ok')
    } catch (e) {
      toast('导出失败：' + e.message, 'err')
    }
  }
  $('rep-regen').onclick = () => { const r = findRep(selRep); if (r) openGen(r.type) }
}
