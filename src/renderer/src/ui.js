// src/renderer/src/ui.js — DOM 小工具：选择器 / 转义 / toast / editBox / 项目历史 chips
import { state } from './state'

// 项目历史 chips：从已有碎片的 r 字段聚合（按最近使用倒序去重），点击填充到 input
export function renderProjectChips(box, inputEl, max = 8) {
  const names = []
  for (let i = state.db.frags.length - 1; i >= 0; i--) {
    const r = state.db.frags[i].r
    if (r && !names.includes(r)) names.push(r)
    if (names.length >= max) break
  }
  box.innerHTML = names.length
    ? names.map((n) => '<span class="chip" data-n="' + esc(n) + '">' + esc(n) + '</span>').join('')
    : ''
  box.querySelectorAll('.chip').forEach((c) => (c.onclick = () => { inputEl.value = c.dataset.n }))
}
export const $ = (id) => document.getElementById(id)
export const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

export function toast(msg, type) {
  const t = document.createElement('div')
  t.className = 'toast' + (type ? ' ' + type : '')
  t.textContent = msg
  $('toasts').appendChild(t)
  setTimeout(() => t.remove(), 3200)
}

// editBox(title, value) → Promise<string|null>：复用 #ovl-edit 静态弹窗。
// Enter / 「确定」resolve(输入值)；Esc / 关闭按钮 / 「取消」resolve(null)。
let editResolve = null

export function editBox(title, value) {
  $('edit-title').textContent = title
  const input = $('edit-x')
  input.value = value || ''
  $('ovl-edit').classList.add('show')
  setTimeout(() => {
    input.focus()
    input.select()
  }, 80)
  return new Promise((resolve) => {
    editResolve = resolve
  })
}

function closeEdit(result) {
  if (!editResolve) return
  $('ovl-edit').classList.remove('show')
  const r = editResolve
  editResolve = null
  r(result)
}

// 模态焦点管理：打开时焦点移入弹窗、背景 inert（Tab 自然约束在弹窗内）；
// 关闭时归还焦点给触发元素。用 MutationObserver 监听 .show，覆盖所有打开/关闭路径
// （按钮 / Esc / 保存后自动关闭），调用方无需改动。
const modalStack = []
const FOCUSABLE = 'button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

function syncInert() {
  const top = modalStack[modalStack.length - 1]?.ovl
  const active = !!top
  // toasts 不 inert：保留 aria-live 播报（弹窗打开期间的降级/失败提示仍可达）
  for (const id of ['titlebar', 'win']) $(id).inert = active
  document.querySelectorAll('.ovl').forEach((o) => { o.inert = active && o !== top })
}
function onModalOpen(ovl) {
  modalStack.push({ ovl, prev: document.activeElement })
  syncInert()
  const first = [...ovl.querySelectorAll(FOCUSABLE)].find((el) => el.getClientRects().length)
  ;(first || ovl).focus()
}
function onModalClose(ovl) {
  const i = modalStack.findLastIndex((m) => m.ovl === ovl)
  if (i < 0) return
  const [m] = modalStack.splice(i, 1)
  syncInert()
  // 触发元素可能已随重渲染销毁（如碎片行按钮），销毁则不强行归还
  if (m.prev?.isConnected) m.prev.focus()
}
export function initModals() {
  document.querySelectorAll('.ovl').forEach((ovl) => {
    new MutationObserver(() => {
      const show = ovl.classList.contains('show')
      const inStack = modalStack.some((m) => m.ovl === ovl)
      if (show && !inStack) onModalOpen(ovl)
      else if (!show && inStack) onModalClose(ovl)
    }).observe(ovl, { attributes: true, attributeFilter: ['class'] })
  })
}

export function bindEditBox() {
  const input = $('edit-x')
  $('edit-ok').onclick = () => closeEdit(input.value)
  $('edit-cancel').onclick = () => closeEdit(null)
  $('edit-close').onclick = () => closeEdit(null)
  // textarea：Enter 换行；Ctrl+Enter 提交
  input.onkeydown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); closeEdit(input.value) }
    if (e.key === 'Escape') closeEdit(null)
  }
}
