// src/renderer/src/views/settings.js — 设置弹窗：AI 配置 / 定时 / 自启 / DPAPI 加密 Key
// 保存时仅在新填写 Key 时重新加密（留空保留旧 keyEnc）；boot 变化才调 setBoot
import { state, persist } from '../state'
import { $, toast } from '../ui'
import { renderAll } from '../main'

export function openSet() {
  const c = state.db.cfg
  $('s-url').value = c.url || ''
  // Key 有保存记忆时用 ●●● 占位显示（点眼睛解密看实际值）；无记忆为空
  const hasKey = !!c.keyEnc
  $('s-key').value = hasKey ? '●●●●●●●●●●●●' : ''
  $('s-key').placeholder = hasKey ? '点击 👁 查看已保存的 Key' : 'sk-…（留空保持已保存的 Key）'
  $('s-key').type = 'password' // 每次打开重置为隐藏态
  $('s-key-eye').querySelector('.eye-on').style.display = ''
  $('s-key-eye').querySelector('.eye-off').style.display = 'none'
  $('s-model').value = c.model || 'deepseek-v4.1-flash' // 模型名默认值
  $('s-data').value = c.dataPath || ''
  $('s-auto').classList.toggle('on', !!c.auto) // 定时生成开关（恢复默认记忆）
  $('s-time').value = c.time || '18:30'
  $('s-boot').classList.toggle('on', !!c.boot)
  $('s-testmsg').textContent = ''
  $('ovl-set').classList.add('show')
}

export function bindSettings() {
  $('btn-settings').onclick = openSet
  $('s-boot').onclick = () => $('s-boot').classList.toggle('on')
  $('s-auto').onclick = () => $('s-auto').classList.toggle('on')
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
    const c = state.db.cfg
    c.url = $('s-url').value.trim()
    c.model = $('s-model').value.trim()
    const key = $('s-key').value.trim()
    // ●●● 占位（未查看/未修改）不算新输入，保留旧 keyEnc；空 = 清除 Key
    if (key && key !== KEY_MASK) c.keyEnc = await window.api.store.encryptKey(key)
    if (!key && !c.keyEnc) c.keyEnc = ''
    c.dataPath = $('s-data').value.trim()
    const bootChanged = !!c.boot !== $('s-boot').classList.contains('on')
    c.auto = $('s-auto').classList.contains('on')
    c.time = $('s-time').value || '18:30'
    c.boot = $('s-boot').classList.contains('on')
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
