// src/renderer/src/views/today.js — 今日记录视图：速记 / 今日碎片 / 概览
import { state, addFrag, toggleFrag, editFrag, delFrag, fragOfDay, persist } from '../state'
import { $, esc, toast, editBox, renderProjectChips } from '../ui'
import { keyOf } from '../../../../shared/periods'
import { renderAll } from '../main'
import { openGen } from './gen'

const pad = (n) => String(n).padStart(2, '0')
const nowHM = () => { const n = new Date(); return pad(n.getHours()) + ':' + pad(n.getMinutes()) }

const ICON_OK = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M4 13l4 4L20 5"/></svg>'
const ICON_ED = '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M4 20l10-10 3 3L7 23H4zM15 7l3-3 3 3-3 3z"/></svg>'
const ICON_DEL = '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M5 7h14M9 7V5h6v2m-8 0l1 13h6l1-13"/></svg>'

export const fragRow = (f) =>
  '<div class="frag' + (f.done ? ' done' : '') + '" data-id="' + f.id + '">' +
  '<span class="dash"></span><span class="t">' + f.t + '</span>' +
  (f.h ? '<span class="hash">' + esc((f.r ? f.r + ' · ' : '') + f.h) + '</span>' : '') +
  '<span class="x" role="button" tabindex="0" aria-expanded="false" title="展开 / 收起完整内容">' + esc(f.x) + '</span>' +
  '<span class="ops"><button class="op" data-a="ok" title="' + (f.done ? '标记为待办' : '标记为完成') + '" aria-label="' + (f.done ? '标记为待办' : '标记为完成') + '">' + ICON_OK + '</button>' +
  '<button class="op" data-a="ed" title="编辑" aria-label="编辑">' + ICON_ED + '</button>' +
  '<button class="op del" data-a="del" title="删除" aria-label="删除">' + ICON_DEL + '</button></span></div>'

export function bindFragRows(box) {
  box.querySelectorAll('.frag').forEach((row) => {
    const id = +row.dataset.id
    // 内容默认折叠为单行，点击 / 回车 / 空格展开收起完整内容
    const x = row.querySelector('.x')
    const toggleOpen = () => x.setAttribute('aria-expanded', String(x.classList.toggle('open')))
    x.onclick = (e) => { e.stopPropagation(); toggleOpen() }
    x.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleOpen() } }
    row.querySelectorAll('.op').forEach((b) => (b.onclick = async () => {
      const a = b.dataset.a
      const idx = [...box.querySelectorAll('.frag')].indexOf(row)
      if (a === 'ok') toggleFrag(id)
      else if (a === 'ed') { const v = await editBox('编辑碎片', state.db.frags.find((x) => x.id === id).x); if (v?.trim()) editFrag(id, v.trim()) }
      else if (a === 'del') { if (confirm('删除这条记录？')) delFrag(id) }
      renderAll()
      // 重渲染销毁了被聚焦的按钮：按 id / 原位置找回新节点，保证键盘可连续操作
      setTimeout(() => {
        const view = document.querySelector('.view.on')
        if (!view) return
        const dels = view.querySelectorAll('.frag .op[data-a="del"]')
        const target = a === 'del'
          ? (dels[idx] || dels[idx - 1] || view.querySelector('#quick,#fq'))
          : view.querySelector('.frag[data-id="' + id + '"] .op[data-a="' + a + '"]')
        target?.focus()
      }, 0)
    }))
  })
}

function addQuick(done) {
  const el = $('quick'), x = el.value.trim()
  const r = $('quick-r').value.trim()
  if (!x) { el.classList.add('bad'); setTimeout(() => el.classList.remove('bad'), 350); return }
  const f = addFrag(keyOf(new Date()), nowHM(), x, done, r ? { r } : {})
  el.value = ''
  $('quick-r').value = ''
  renderAll()
  renderProjectChips($('quick-r-chips'), $('quick-r')) // 新项目进入历史候选
  toast('已保存 · ' + f.t + (f.done ? '（已完成）' : '（待办）') + (r ? '（' + r + '）' : ''), 'ok')
}

export function renderToday() {
  const d = keyOf(new Date()), list = fragOfDay(d), dn = list.filter((f) => f.done).length
  $('ov-stat').innerHTML = list.length + '<small>条碎片 · ' + dn + ' 已完成</small>'
  $('ov-todo').textContent = String(list.length - dn)
  $('ov-last').textContent = list.length ? list[list.length - 1].t : '—'
  $('ov-rep').textContent = state.db.reports.some((r) => r.type === 'daily' && r.d === d) ? '已生成' : '未生成'
  const box = $('today-frags')
  box.innerHTML = list.length ? list.map(fragRow).join('') : '<div class="empty">还没有记录，敲一行回车保存</div>'
  bindFragRows(box)
}

export function bindToday() {
  renderProjectChips($('quick-r-chips'), $('quick-r')) // 初始渲染项目历史候选
  $('btn-save').onclick = () => addQuick(false)
  $('btn-done').onclick = () => addQuick(true)
  // textarea：Enter 换行；Ctrl+Enter 快速完成录入
  $('quick').onkeydown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); addQuick(true) }
  }
  $('btn-gen-daily').onclick = () => openGen('daily')
  $('btn-git').onclick = () => import('./gitimport').then((m) => m.openGit(keyOf(new Date())))
  $('all-done').onclick = () => {
    const list = fragOfDay(keyOf(new Date())), n = list.filter((f) => !f.done).length
    if (!list.length) return toast('今天还没有碎片记录', 'err')
    if (!n) return toast('今天的记录都已标记完成', 'ok')
    list.forEach((f) => (f.done = true)); persist(); renderAll()
    toast('已完成 · 本批 ' + n + ' 条标记为完成', 'ok')
  }
  $('all-clear').onclick = () => {
    const d = keyOf(new Date()), list = fragOfDay(d)
    if (!list.length) return toast('今天还没有碎片记录', 'err')
    if (!confirm('确定清空今天全部 ' + list.length + ' 条碎片？\n（已生成的日报不受影响）')) return
    state.db.frags = state.db.frags.filter((f) => f.d !== d); persist(); renderAll()
    toast('已清空今日 ' + list.length + ' 条碎片', 'ok')
  }
}
