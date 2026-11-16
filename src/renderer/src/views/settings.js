// src/renderer/src/views/settings.js — 设置弹窗：三 tab（通用 / 模型配置 / 定时任务）
// 保存时仅在新填写 Key 时重新加密（留空保留旧 keyEnc）；boot 变化才调 setBoot
// 定时配置读写 cfg.sched / cfg.gitAuto（store 迁移保证存在）；旧 auto/time 不再读写
import { state, persist } from '../state'
import { $, esc, toast } from '../ui'
import { renderAll } from '../main'

let setTab = 'general' // 默认第一项通用；记忆上次停留的 tab，重开恢复
const TIMES_LIMIT = 8 // 每类型时间点上限
const sw = (id) => $(id).classList.contains('on')
// 多时间点编辑器：列表渲染 / 读取 / 增删按钮禁用态同步
const TIME_ITEM = (t) =>
  '<span class="time-item"><input type="time" class="sched-ctl" value="' + esc(t) + '" aria-label="触发时间">' +
  '<button type="button" class="op del" data-del aria-label="删除时间点"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></span>'
const timesOf = (type) => [...$('s-' + type + '-times').querySelectorAll('input')].map((i) => i.value)
// weekly/monthly 时间点 = 日期+时间对：日期下拉（周几 / 几号）+ 时间 + 删除
const DAY_OPTS = {
  w: [[1, '周一'], [2, '周二'], [3, '周三'], [4, '周四'], [5, '周五'], [6, '周六'], [0, '周日']],
  m: Array.from({ length: 28 }, (_, i) => [i + 1, (i + 1) + ' 号'])
}
const POINT_ITEM = (type, p) =>
  '<span class="time-item"><select class="sched-ctl" aria-label="触发日期">' +
  DAY_OPTS[type].map(([v, l]) => '<option value="' + v + '"' + (v === p.day ? ' selected' : '') + '>' + l + '</option>').join('') +
  '</select><input type="time" class="sched-ctl" value="' + esc(p.time) + '" aria-label="触发时间">' +
  '<button type="button" class="op del" data-del aria-label="删除时间点"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></span>'
const pointsOf = (type) =>
  [...$('s-' + type + '-points').querySelectorAll('.time-item')].map((it) => ({
    day: +it.querySelector('select').value,
    time: it.querySelector('input').value
  }))
const editorBox = (type) => $(type === 'd' ? 's-d-times' : 's-' + type + '-points')
function syncEditor(type) {
  const box = editorBox(type)
  const n = box.querySelectorAll('.time-item').length
  document.querySelector('#set-sched [data-add="' + type + '"]').disabled = n >= TIMES_LIMIT
  box.querySelectorAll('[data-del]').forEach((b) => (b.disabled = n <= 1))
}
function renderTimes(type, times) {
  editorBox(type).innerHTML = times.map(TIME_ITEM).join('')
  syncEditor(type)
}
function renderPoints(type, points) {
  editorBox(type).innerHTML = points.map((p) => POINT_ITEM(type, p)).join('')
  syncEditor(type)
}
// 开关状态同步：视觉 class 与 aria-checked 保持一致（role="switch" 的 button）
const setSwitch = (el, on) => { el.classList.toggle('on', on); el.setAttribute('aria-checked', String(on)) }
const flipSwitch = (el) => setSwitch(el, !el.classList.contains('on'))

function applyTab(t) {
  setTab = t
  document.querySelectorAll('.set-tabs button').forEach((b) => {
    b.classList.toggle('on', b.dataset.t === t)
    b.setAttribute('aria-pressed', String(b.dataset.t === t))
  })
  document.querySelectorAll('.set-pane').forEach((p) => p.classList.toggle('on', p.id === 'set-' + t))
}

export function openSet() {
  const c = state.db.cfg
  $('s-url').value = c.url || ''
  // Key 有保存记忆时用 ●●● 占位显示（点眼睛解密看实际值）；无记忆为空
  const hasKey = !!c.keyEnc
  $('s-key').value = hasKey ? '●●●●●●●●●●●●' : ''
  $('s-key').placeholder = hasKey ? '点击眼睛按钮查看已保存的 Key' : 'sk-…（留空保持已保存的 Key）'
  $('s-key').type = 'password' // 每次打开重置为隐藏态
  $('s-key-eye').querySelector('.eye-on').style.display = ''
  $('s-key-eye').querySelector('.eye-off').style.display = 'none'
  $('s-model').value = c.model || 'deepseek-v4.1-flash' // 模型名默认值
  $('s-data').value = c.dataPath || ''
  // 定时任务 tab：三报告开关/时间/星期/日期 + Git 自动导入
  const sc = c.sched
  setSwitch($('s-d-on'), !!sc.daily.on)
  setSwitch($('s-w-on'), !!sc.weekly.on)
  setSwitch($('s-m-on'), !!sc.monthly.on)
  setSwitch($('s-g-on'), !!c.gitAuto.on)
  renderTimes('d', sc.daily.times)
  renderPoints('w', sc.weekly.points)
  renderPoints('m', sc.monthly.points)
  $('s-g-min').value = String(c.gitAuto.minutes)
  $('s-git-err').textContent = ''
  $('s-sched-err').textContent = ''
  setSwitch($('s-boot'), !!c.boot)
  $('s-testmsg').textContent = ''
  applyTab(setTab)
  $('ovl-set').classList.add('show')
}

export function bindSettings() {
  $('btn-settings').onclick = openSet
  document.querySelectorAll('.set-tabs button').forEach((b) => (b.onclick = () => applyTab(b.dataset.t)))
  for (const id of ['s-d-on', 's-w-on', 's-m-on', 's-g-on', 's-boot']) $(id).onclick = () => flipSwitch($(id))
  // 时间点增删（事件委托）：添加默认 12:00（周/月另带默认日期 1）；至少保留一个时间点
  $('set-sched').onclick = (e) => {
    const add = e.target.closest('[data-add]')
    if (add) {
      const type = add.dataset.add
      const box = editorBox(type)
      if (box.querySelectorAll('.time-item').length >= TIMES_LIMIT) return
      box.insertAdjacentHTML('beforeend', type === 'd' ? TIME_ITEM('12:00') : POINT_ITEM(type, { day: 1, time: '12:00' }))
      syncEditor(type)
      return
    }
    const del = e.target.closest('[data-del]')
    if (del && !del.disabled) {
      const box = del.closest('.times')
      if (box.querySelectorAll('.time-item').length <= 1) return
      del.closest('.time-item').remove()
      syncEditor(box.id.slice(2, 3)) // 's-d-times' / 's-w-points' → 'd' / 'w'
    }
  }
  // 数据保存路径：弹系统目录选择框
  $('s-data-pick').onclick = async () => {
    const dir = await window.api.app.pickDir($('s-data').value.trim() || undefined)
    if (dir) $('s-data').value = dir
  }
  // API Key 显示/隐藏切换（默认隐藏）：
  // 显示时若输入框为空且已有保存的 Key → 解密回显实际 Key；
  // 隐藏时若值仍是解密回显的旧 Key（未被编辑）→ 恢复 ●●● 占位
  const KEY_MASK = '●●●●●●●●●●●●'
  let echoedKey = '' // 当前解密回显的 Key，用于区分「回显值」与「用户新输入」
  $('s-key-eye').onclick = async () => {
    const inp = $('s-key')
    const show = inp.type === 'password'
    if (show) {
      // 占位（●●● 或空）且有保存的 Key → 解密回显实际 Key
      if ((!inp.value || inp.value === KEY_MASK) && state.db.cfg.keyEnc) {
        try {
          inp.value = await window.api.store.decryptKey(state.db.cfg.keyEnc)
          echoedKey = inp.value
        } catch (e) {
          toast('Key 解密失败：' + (e.message || e), 'err')
        }
      }
      inp.type = 'text'
    } else {
      if (echoedKey && inp.value === echoedKey) inp.value = KEY_MASK // 未编辑的回显值，隐藏时恢复占位
      echoedKey = ''
      inp.type = 'password'
    }
    $('s-key-eye').querySelector('.eye-on').style.display = show ? 'none' : ''
    $('s-key-eye').querySelector('.eye-off').style.display = show ? '' : 'none'
  }
  $('s-test').onclick = async () => {
    const msg = $('s-testmsg')
    const url = $('s-url').value.trim()
    let key = $('s-key').value.trim()
    // 占位状态下用已保存的 Key 测试
    if (key === KEY_MASK) key = state.db.cfg.keyEnc ? await window.api.store.decryptKey(state.db.cfg.keyEnc) : ''
    if (!/^https?:\/\//.test(url)) { msg.textContent = '接口地址需以 http(s):// 开头'; msg.className = 'testmsg err'; return }
    if (!key) { msg.textContent = '请填写 API Key'; msg.className = 'testmsg err'; return }
    msg.textContent = '测试中…'; msg.className = 'testmsg'
    try {
      await window.api.ai.test({ url, key, model: $('s-model').value.trim() })
      msg.textContent = '连接成功'; msg.className = 'testmsg ok'
    } catch (e) {
      msg.textContent = String(e.message || e).slice(0, 80); msg.className = 'testmsg err'
    }
  }
  $('s-save').onclick = async () => {
    // 间隔校验：非法时在字段旁报错且不关闭弹窗（主进程 clampMinutes 兜底）
    const n = Number($('s-g-min').value)
    if (!Number.isInteger(n) || n < 5 || n > 1440) {
      $('s-git-err').textContent = '间隔需为 5–1440 之间的整数分钟'
      applyTab('sched') // 错误字段在定时任务 pane：从其他 tab 保存时跳回，保证反馈可达
      return
    }
    $('s-git-err').textContent = ''
    // 时间点校验：非空 / 不重复（周/月按日期+时间）/ 不超上限，错误显示在定时任务 pane 并跳回
    const schedOut = {}
    for (const [type, key] of [['d', 'daily'], ['w', 'weekly'], ['m', 'monthly']]) {
      let bad = ''
      if (type === 'd') {
        const ts = timesOf('d')
        bad = !ts.length || ts.some((t) => !t) ? '时间点不能为空'
          : new Set(ts).size !== ts.length ? '时间点不能重复'
          : ts.length > TIMES_LIMIT ? '最多 ' + TIMES_LIMIT + ' 个时间点' : ''
        if (!bad) schedOut.daily = { on: sw('s-d-on'), times: ts }
      } else {
        const pts = pointsOf(type)
        const keys = pts.map((p) => p.day + '@' + p.time)
        bad = !pts.length || pts.some((p) => !p.time) ? '时间点不能为空'
          : new Set(keys).size !== keys.length ? '同日期时间点不能重复'
          : pts.length > TIMES_LIMIT ? '最多 ' + TIMES_LIMIT + ' 个时间点' : ''
        if (!bad) schedOut[key] = { on: sw('s-' + type + '-on'), points: pts }
      }
      if (bad) { $('s-sched-err').textContent = bad; applyTab('sched'); return }
    }
    $('s-sched-err').textContent = ''
    const c = state.db.cfg
    c.url = $('s-url').value.trim()
    c.model = $('s-model').value.trim()
    const key = $('s-key').value.trim()
    // ●●● 占位（未查看/未修改）不算新输入，保留旧 keyEnc；空 = 清除 Key
    if (key && key !== KEY_MASK) c.keyEnc = await window.api.store.encryptKey(key)
    if (!key && !c.keyEnc) c.keyEnc = ''
    c.dataPath = $('s-data').value.trim()
    c.sched = schedOut
    c.gitAuto = { on: sw('s-g-on'), minutes: n }
    const bootChanged = !!c.boot !== sw('s-boot')
    c.boot = sw('s-boot')
    persist()
    if (bootChanged) await window.api.app.setBoot(c.boot)
    // 数据目录变化 → 迁移数据文件并切换锚点（失败则提示且不关闭弹窗）
    const r = await window.api.app.setDataDir(c.dataPath)
    if (!r.ok) { toast(r.message, 'err'); return }
    if (r.message !== '目录未变化') {
      state.db.cfg.dataPath = c.dataPath
      $('ovl-set').classList.remove('show')
      renderAll()
      toast(r.message + '（已生效）', 'ok')
      return
    }
    $('ovl-set').classList.remove('show')
    renderAll()
    toast('设置已保存', 'ok')
  }
  document.querySelectorAll('#ovl-set .m-close').forEach((b) => (b.onclick = () => $('ovl-set').classList.remove('show')))
}
