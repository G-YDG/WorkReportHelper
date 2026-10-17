// src/renderer/src/views/gen.js — AI 生成弹窗：提示词预览 / 流式生成（未配置时本地降级）/ 存入报告管理
import { state, persist } from '../state'
import { $, toast } from '../ui'
import { mdToHtml } from '../md'
import { genMeta, TP, keyOf } from '../../../../shared/periods'
import { buildInstruction, buildRecords, localReport } from '../../../../shared/ai-text'
import { switchView } from '../main'

let genType = 'daily'
let genM = null
let genFull = ''
let offDelta = null
let running = false
let typeTimer = null
let shownLen = 0 // 已渲染到面板的字符数
let targetText = '' // 目标全文（流式增量 / 一次性结果都只更新它）
let promptEdited = false // 用户是否修改过提示词指令（修改后按修改版调用 AI）
let genMode = 'preview' // preview | edit（默认预览，与报告管理一致）

// 自定义指令按周期类型分别记忆（cfg.promptIns[type]），空 = 使用内置默认
const savedIns = (type) => (state.db.cfg.promptIns || {})[type] || ''
const saveIns = (type, text) => {
  state.db.cfg.promptIns = { ...(state.db.cfg.promptIns || {}), [type]: text }
  persist()
}

// 提示词面板 tab：指令（可编辑）/ 碎片记录（只读）
function setPromptMode(m) {
  $('prompt-mode').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.m === m))
  const rec = m === 'rec'
  $('prompt').style.display = rec ? 'none' : ''
  $('prompt-records').style.display = rec ? '' : 'none'
}

// 预览 / 编辑切换：编辑态填入全文（停止动画），预览态直接显示全文渲染
function setGenMode(m) {
  genMode = m
  $('gen-mode').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.m === m))
  const edit = m === 'edit'
  $('gen-text').style.display = edit ? '' : 'none'
  $('gen').style.display = edit ? 'none' : ''
  if (edit) { stopTyping(); shownLen = targetText.length; $('gen-text').value = genFull || targetText }
}

const fragsOf = (m) => state.db.frags.filter((f) => f.d >= m.from && f.d <= m.to)
const setTabsDisabled = (dis) => $('gen-tabs').querySelectorAll('button').forEach((b) => (b.disabled = dis))
const stopTyping = () => { clearInterval(typeTimer); typeTimer = null }

// 平滑流式：无论增量是一段段到达还是一次性到达，面板都向 targetText 渐进渲染，
// 且以 Markdown 预览形式呈现（每帧全量渲染已到达部分，几 KB 文本开销可忽略）。
// 未闭合语法（如 **功能）在过渡帧会短暂显示原始符号，播完即渲染正确。
function startTyping(el) {
  stopTyping()
  typeTimer = setInterval(() => {
    if (shownLen >= targetText.length) return stopTyping()
    shownLen = Math.min(targetText.length, shownLen + 3)
    el.innerHTML = mdToHtml(targetText.slice(0, shownLen))
  }, 16)
}
const pushTarget = (el, full) => {
  targetText = full
  if (!typeTimer) startTyping(el) // 已有动画在跑则继续追赶新目标，不重启
}

export function openGen(type, dayKey) {
  stopTyping() // 防止上一次的打字机动画继续写入面板
  genType = type
  // 日报可用任意历史日期；周报/月报以所选日期所在周/月为准
  const base = dayKey ? new Date(dayKey + 'T00:00:00') : new Date()
  genM = genMeta(type, base)
  if (type === 'daily') genM.name = dayKey && dayKey !== keyOf(new Date()) ? dayKey.replace(/^\d{4}-/, '') + ' 当天' : '今天'
  setTabsDisabled(false)
  $('gen-tabs').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.t === type))
  $('gen-date').value = genM.from // 周报回填周一、月报回填当月 1 号，均可被 date 控件接受
  $('m-title').textContent = '生成' + TP[type]
  const list = fragsOf(genM)
  promptEdited = false // 换类型/换日期后重新加载对应记忆
  if (!list.length) {
    // 无碎片：仍打开弹窗，提示用户可换日期或换周期类型
    $('rep-src').textContent = '数据源：' + genM.name + '（该周期暂无碎片）'
    $('prompt').value = savedIns(type) || buildInstruction(genM, genType)
    $('prompt-records').textContent = '（' + genM.name + '没有可整理的碎片，请换一个日期或周期类型）'
    $('gen').innerHTML = ''
    $('gen-text').value = ''
    $('gen-run').disabled = true
    $('gen-copy').disabled = true
    $('gen-save').disabled = true
    $('ovl-report').classList.add('show')
    return
  }
  $('rep-src').textContent = '数据源：' + genM.name + ' ' + list.length + ' 条碎片（' + genM.from + (genM.to !== genM.from ? ' ~ ' + genM.to : '') + '）'
  $('prompt').value = savedIns(type) || buildInstruction(genM, genType) // 有自定义指令则记忆，否则内置默认
  $('prompt-records').textContent = buildRecords(list)
  setPromptMode('ins') // 每次打开弹窗重置为指令 tab
  setGenMode('preview') // 每次打开弹窗重置为预览态
  $('gen').innerHTML = ''
  $('gen-run').disabled = false
  $('gen-copy').disabled = true
  $('gen-save').disabled = true
  $('ovl-report').classList.add('show')
}

async function runGen() {
  if (running) return
  running = true
  try {
    await doRunGen()
  } finally {
    running = false
  }
}

async function doRunGen() {
  $('gen-run').disabled = true
  $('gen-run').textContent = '生成中…'
  setTabsDisabled(true)
  const list = fragsOf(genM)
  const cfg = state.db.cfg
  try {
    if (cfg.url && cfg.keyEnc) {
      offDelta?.()
      stopTyping()
      shownLen = 0
      targetText = ''
      offDelta = window.api.ai.onDelta((full) => { genFull = full; pushTarget($('gen'), full) })
      try {
        genFull = await window.api.ai.generate(cfg, genType, genM, list, $('prompt').value)
        if (!genFull) throw new Error('接口返回空内容')
      } catch (e) {
        toast('AI 调用失败，已降级本地生成：' + e.message, 'err')
        genFull = localReport(genType, list)
      }
    } else {
      toast('未配置 AI 接口，已使用本地模板生成（可在「设置」中配置）', 'ok')
      genFull = localReport(genType, list)
    }
  } finally {
    setTabsDisabled(false)
  }
  // 确保动画把最终全文播完（无流式增量时也从零开始播）；编辑态则直接填全文
  if (genMode === 'edit') { shownLen = genFull.length; targetText = genFull; $('gen-text').value = genFull }
  else pushTarget($('gen'), genFull)
  $('gen-copy').disabled = false
  $('gen-save').disabled = false
  $('gen-run').disabled = false
  $('gen-run').textContent = '重新生成'
}

export function bindGen() {
  $('gen-tabs').querySelectorAll('button').forEach((b) => (b.onclick = () => openGen(b.dataset.t, $('gen-date').value)))
  // 切换目标日期：按当前类型重新计算周期
  $('gen-date').onchange = () => openGen(genType, $('gen-date').value)
  // 指令修改即自动保存（按周期类型记忆），生成时始终以面板当前内容为准
  $('prompt').oninput = (e) => { promptEdited = true; saveIns(genType, e.target.value) }
  $('prompt-reset').onclick = () => {
    saveIns(genType, '')
    $('prompt').value = buildInstruction(genM, genType)
    promptEdited = false
    toast('已恢复默认提示词', 'ok')
  }
  $('prompt-mode').querySelectorAll('button').forEach((b) => (b.onclick = () => setPromptMode(b.dataset.m)))
  $('gen-mode').querySelectorAll('button').forEach((b) => (b.onclick = () => setGenMode(b.dataset.m)))
  // 编辑态的修改实时同步到 genFull，复制/存入均取最新
  $('gen-text').oninput = (e) => { genFull = e.target.value; targetText = genFull }
  $('gen-run').onclick = runGen
  $('gen-copy').onclick = async () => {
    try { await navigator.clipboard.writeText(genFull); toast('已复制到剪贴板', 'ok') } catch { toast('复制失败', 'err') }
  }
  $('gen-save').onclick = () => {
    const now = new Date()
    const when = keyOf(now) + ' ' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')
    const old = state.db.reports.find((r) => r.type === genType && r.d === genM.d)
    if (old) { old.text = genFull; old.when = when } else state.db.reports.push({ type: genType, d: genM.d, when, text: genFull })
    persist()
    $('ovl-report').classList.remove('show')
    toast('已存入报告管理（' + TP[genType] + '）', 'ok')
    switchView('reports')
  }
  document.querySelectorAll('#ovl-report .m-close').forEach((b) => (b.onclick = () => { stopTyping(); $('ovl-report').classList.remove('show') }))
}
