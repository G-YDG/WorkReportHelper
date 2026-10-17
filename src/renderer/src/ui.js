// src/renderer/src/ui.js — DOM 小工具：选择器 / 转义 / toast / editBox（原生 prompt 的桌面端替代）
export const $ = (id) => document.getElementById(id)
export const esc = (s) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

export function toast(msg, type) {
  const t = document.createElement('div')
  t.className = 'toast' + (type ? ' ' + type : '')
  t.textContent = msg
  $('toasts').appendChild(t)
  setTimeout(() => t.remove(), 2600)
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
