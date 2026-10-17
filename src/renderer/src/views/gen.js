// src/renderer/src/views/gen.js — AI 生成弹窗：提示词预览 / 流式生成（未配置时本地降级）/ 存入报告管理
import { state, persist } from '../state'
import { $, toast } from '../ui'
import { genMeta, TP, keyOf } from '../../../../shared/periods'
import { buildPrompt, localReport } from '../../../../shared/ai-text'
import { switchView } from '../main'

let genType = 'daily'
let genM = null
let genFull = ''
let offDelta = null
let running = false

const fragsOf = (m) => state.db.frags.filter((f) => f.d >= m.from && f.d <= m.to)
const setTabsDisabled = (dis) => $('gen-tabs').querySelectorAll('button').forEach((b) => (b.disabled = dis))

export function openGen(type, dayKey) {
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
  if (!list.length) {
    // 无碎片：仍打开弹窗，提示用户可换日期或换周期类型
    $('rep-src').textContent = '数据源：' + genM.name + '（该周期暂无碎片）'
    $('prompt').textContent = '（' + genM.name + '没有可整理的碎片，请换一个日期或周期类型）'
    $('gen').textContent = ''
    $('gen-run').disabled = true
    $('gen-copy').disabled = true
    $('gen-save').disabled = true
    $('ovl-report').classList.add('show')
    return
  }
  $('rep-src').textContent = '数据源：' + genM.name + ' ' + list.length + ' 条碎片（' + genM.from + (genM.to !== genM.from ? ' ~ ' + genM.to : '') + '）'
  $('prompt').textContent = buildPrompt(genM, genType, list)
  $('gen').textContent = ''
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
  setTabsDisabled(true)
  const list = fragsOf(genM)
  const cfg = state.db.cfg
  try {
    if (cfg.url && cfg.keyEnc) {
      offDelta?.()
      offDelta = window.api.ai.onDelta((full) => { genFull = full; $('gen').textContent = full })
      try {
        genFull = await window.api.ai.generate(cfg, genType, genM, list)
      } catch (e) {
        toast('AI 调用失败，已降级本地生成：' + e.message, 'err')
        genFull = localReport(genType, list)
      }
    } else {
      genFull = localReport(genType, list)
    }
  } finally {
    setTabsDisabled(false)
  }
  $('gen').textContent = genFull
  $('gen-copy').disabled = false
  $('gen-save').disabled = false
}

export function bindGen() {
  $('gen-tabs').querySelectorAll('button').forEach((b) => (b.onclick = () => openGen(b.dataset.t, $('gen-date').value)))
  // 切换目标日期：按当前类型重新计算周期
  $('gen-date').onchange = () => openGen(genType, $('gen-date').value)
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
  document.querySelectorAll('#ovl-report .m-close').forEach((b) => (b.onclick = () => $('ovl-report').classList.remove('show')))
}
