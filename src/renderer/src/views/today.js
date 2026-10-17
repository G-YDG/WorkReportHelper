// src/renderer/src/views/today.js — 今日记录视图：速记 / 今日碎片 / 概览
import { state, addFrag, toggleFrag, editFrag, delFrag, fragOfDay, persist } from '../state'
import { $, esc, toast, editBox } from '../ui'
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
  '<span class="dash"></span><span class="t">' + f.t + '</span><span class="x">' + esc(f.x) +
  (f.h ? '<span class="hash">' + esc((f.r ? f.r + ' · ' : '') + f.h) + '</span>' : '') + '</span>' +
  '<span class="ops"><button class="op" data-a="ok">' + ICON_OK + '</button>' +
  '<button class="op" data-a="ed">' + ICON_ED + '</button>' +
  '<button class="op del" data-a="del">' + ICON_DEL + '</button></span></div>'

export function bindFragRows(box) {
  box.querySelectorAll('.frag').forEach((row) => {
    const id = +row.dataset.id
    row.querySelectorAll('.op').forEach((b) => (b.onclick = async () => {
      const a = b.dataset.a
      if (a === 'ok') toggleFrag(id)
      else if (a === 'ed') { const v = await editBox('编辑这条碎片', state.db.frags.find((x) => x.id === id).x); if (v?.trim()) editFrag(id, v.trim()) }
      else if (a === 'del') { if (confirm('删除这条记录？')) delFrag(id) }
      renderAll()
    }))
  })
}

function addQuick(done) {
  const el = $('quick'), x = el.value.trim()
  if (!x) { el.classList.add('bad'); setTimeout(() => el.classList.remove('bad'), 350); return }
  const f = addFrag(keyOf(new Date()), nowHM(), x, done)
  el.value = ''
  renderAll()
  toast('已保存 · ' + f.t + (f.done ? '（已完成）' : '（待办）'), 'ok')
}

export function renderToday() {
  const d = keyOf(new Date()), list = fragOfDay(d), dn = list.filter((f) => f.done).length
  $('today-count').textContent = list.length + ' 条'
  $('ov-stat').innerHTML = list.length + '<small>条碎片 · ' + dn + ' 已完成</small>'
  $('ov-last').textContent = list.length ? list[list.length - 1].t : '—'
  $('ov-rep').textContent = state.db.reports.some((r) => r.type === 'daily' && r.d === d) ? '已生成' : '未生成'
  const box = $('today-frags')
  box.innerHTML = list.length ? list.map(fragRow).join('') : '<div class="empty">还没有记录，敲一行回车保存</div>'
  bindFragRows(box)
  $('badge').textContent = list.length
}

export function bindToday() {
  $('btn-save').onclick = () => addQuick(false)
  $('btn-done').onclick = () => addQuick(true)
  $('quick').onkeydown = (e) => { if (e.key === 'Enter') addQuick(false) }
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
