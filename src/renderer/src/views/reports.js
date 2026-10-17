// src/renderer/src/views/reports.js — 报告管理：列表 / Tab 筛选 / 编辑 / 预览 / 复制 / 导出 .md / 重新生成
import { state, persist } from '../state'
import { $, esc, toast } from '../ui'
import { TP, labelOf, isoWeek, monthOf } from '../../../../shared/periods'
import { openGen } from './gen'
import { mdToHtml } from '../md'

const repId = (r) => r.type + ':' + r.d
let repFilter = 'all'
let selRep = null
let repMode = 'preview' // preview | edit（默认预览）

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
  $('rep-list').querySelectorAll('.repitem').forEach((b) => {
    b.onclick = () => { selRep = b.dataset.id; renderReports() }
    // 右键菜单：删除报告
    b.oncontextmenu = async (e) => {
      e.preventDefault()
      const pick = await window.api.app.ctxMenu([{ label: '删除报告' }])
      if (pick !== 0) return
      if (!confirm('删除该报告？')) return
      state.db.reports = state.db.reports.filter((r) => repId(r) !== b.dataset.id)
      persist()
      selRep = null
      renderReports()
      toast('已删除报告', 'ok')
    }
  })
  const cur = findRep(selRep)
  if (document.activeElement !== $('rep-text')) $('rep-text').value = cur.text
  $('rep-when').textContent = '生成于 ' + cur.when + ' · ' + repSrc(cur)
  applyMode(cur)
}

// 编辑 / 预览模式切换：预览态把 textarea 内容渲染为 Markdown
function applyMode(cur) {
  const preview = repMode === 'preview'
  $('rep-text').style.display = preview ? 'none' : ''
  $('rep-preview').style.display = preview ? '' : 'none'
  if (preview) $('rep-preview').innerHTML = mdToHtml((cur || findRep(selRep))?.text || $('rep-text').value)
}
function setMode(m) {
  repMode = m
  $('rep-mode').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.m === m))
  applyMode()
}

export function bindReports() {
  $('rep-tabs').querySelectorAll('button').forEach((b) => (b.onclick = () => {
    repFilter = b.dataset.t; selRep = null
    $('rep-tabs').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b))
    renderReports()
  }))
  // 新建报告：以当前筛选的周期类型为准（筛选停在日报/周报/月报时按该类型新建）
  $('rep-new').onclick = () => openGen(repFilter === 'all' ? 'daily' : repFilter)
  $('rep-mode').querySelectorAll('button').forEach((b) => (b.onclick = () => setMode(b.dataset.m)))
  $('rep-text').oninput = (e) => {
    const r = findRep(selRep)
    if (r) { r.text = e.target.value; persist() }
    if (repMode === 'preview') applyMode() // 预览态下（理论上不可编辑）兜底刷新
  }
  // 复制：默认（预览模式）复制渲染后的富文本 HTML；编辑模式复制纯文本
  $('rep-copy').onclick = async () => {
    try {
      if (repMode === 'preview') {
        const item = new ClipboardItem({
          'text/html': new Blob([$('rep-preview').innerHTML], { type: 'text/html' }),
          'text/plain': new Blob([$('rep-text').value], { type: 'text/plain' })
        })
        await navigator.clipboard.write([item])
        toast('已复制（富文本，粘贴即保留格式）', 'ok')
      } else {
        await navigator.clipboard.writeText($('rep-text').value)
        toast('已复制', 'ok')
      }
    } catch (e) {
      // 富文本写入失败（浏览器兼容）时退回纯文本
      try { await navigator.clipboard.writeText($('rep-text').value); toast('已复制纯文本', 'ok') } catch { toast('复制失败', 'err') }
    }
  }
  // 复制 Markdown 源码
  $('rep-copy-md').onclick = async () => {
    try { await navigator.clipboard.writeText($('rep-text').value); toast('已复制 Markdown 源码', 'ok') } catch { toast('复制失败', 'err') }
  }
  $('rep-regen').onclick = () => { const r = findRep(selRep); if (r) openGen(r.type) }
}
