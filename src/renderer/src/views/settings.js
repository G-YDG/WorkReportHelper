// src/renderer/src/views/settings.js — 设置弹窗：AI 配置 / 定时 / 自启 / DPAPI 加密 Key
// 保存时仅在新填写 Key 时重新加密（留空保留旧 keyEnc）；boot 变化才调 setBoot
import { state, persist } from '../state'
import { $, toast } from '../ui'
import { renderAll } from '../main'

export function openSet() {
  const c = state.db.cfg
  $('s-url').value = c.url || ''
  $('s-key').value = '' // 不回显，占位提示「已保存（留空保持不变）」
  $('s-model').value = c.model || ''
  $('s-time').value = c.time || '18:30'
  $('s-dir').value = c.dir || ''
  $('s-data').value = c.dataPath || '%APPDATA%\\WorkReportHelper'
  $('s-auto').classList.toggle('on', !!c.auto)
  $('s-boot').classList.toggle('on', !!c.boot)
  $('s-testmsg').textContent = ''
  $('ovl-set').classList.add('show')
}

export function bindSettings() {
  $('btn-settings').onclick = openSet
  $('s-auto').onclick = () => $('s-auto').classList.toggle('on')
  $('s-boot').onclick = () => $('s-boot').classList.toggle('on')
  $('s-test').onclick = async () => {
    const msg = $('s-testmsg')
    const url = $('s-url').value.trim(), key = $('s-key').value.trim()
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
    const c = state.db.cfg
    c.url = $('s-url').value.trim()
    c.model = $('s-model').value.trim()
    const key = $('s-key').value.trim()
    if (key) c.keyEnc = await window.api.store.encryptKey(key)
    c.time = $('s-time').value || '18:30'
    c.dir = $('s-dir').value.trim()
    c.dataPath = $('s-data').value.trim() || '%APPDATA%\\WorkReportHelper'
    const bootChanged = !!c.boot !== $('s-boot').classList.contains('on')
    c.auto = $('s-auto').classList.contains('on')
    c.boot = $('s-boot').classList.contains('on')
    persist()
    if (bootChanged) await window.api.app.setBoot(c.boot)
    $('ovl-set').classList.remove('show')
    renderAll()
    toast('设置已保存', 'ok')
  }
  document.querySelectorAll('#ovl-set .m-close').forEach((b) => (b.onclick = () => $('ovl-set').classList.remove('show')))
}
