// src/renderer/src/views/frags-add.js — 手动新增弹窗（迁移自 docs/原型.html 671-687 行）
import { state, addFrag } from '../state'
import { $, toast } from '../ui'
import { keyOf } from '../../../../shared/periods'
import { renderAll } from '../main'

const pad = (n) => String(n).padStart(2, '0')

export function openAdd() {
  const d = state.selDay || keyOf(new Date()), now = new Date()
  $('add-date').value = d
  $('add-time').value = pad(now.getHours()) + ':' + pad(now.getMinutes())
  $('add-x').value = ''
  $('ovl-add').classList.add('show')
  setTimeout(() => $('add-x').focus(), 80)
}

// add-ok 绑定在模块层（frags.js 静态导入本模块，启动即生效，与原型一致）
$('add-ok').onclick = () => {
  const d = $('add-date').value, t = $('add-time').value || '12:00', x = $('add-x').value.trim()
  if (!d) return toast('请选择日期', 'err')
  if (!x) { $('add-x').classList.add('bad'); setTimeout(() => $('add-x').classList.remove('bad'), 350); return }
  addFrag(d, t, x, false)
  state.selDay = d; renderAll(); $('ovl-add').classList.remove('show')
  toast('已新增 ' + d + ' 的记录', 'ok')
}
