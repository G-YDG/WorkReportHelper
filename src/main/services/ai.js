import { buildPrompt } from '../../../shared/ai-text'
import { decryptKey } from './store'

// 解析一段 SSE 文本中的内容增量（纯函数，可测）；兼容 CRLF 行尾
export function parseSSE(text) {
  const out = []
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.match(/^data:\s?(.*)$/)
    const payload = m ? m[1].trim() : ''
    if (!m || payload === '[DONE]') continue
    try {
      const j = JSON.parse(payload)
      const c = j.choices?.[0]?.delta?.content
      if (c) out.push(c)
    } catch {
      /* keep-alive 或非 JSON 行，静默忽略 */
    }
  }
  return out
}

export async function testConnection(cfg) {
  if (!/^https?:\/\//.test(cfg.url)) throw new Error('接口地址需以 http(s):// 开头')
  if (!cfg.key) throw new Error('请填写 API Key')
  const res = await fetch(cfg.url.replace(/\/+$/, ''), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key },
    body: JSON.stringify({ model: cfg.model || 'gpt-3.5-turbo', messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 })
  })
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + (await res.text()).slice(0, 120))
  return true
}

export async function streamReport(cfg, type, meta, frags, onDelta) {
  const res = await fetch(cfg.url.replace(/\/+$/, ''), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + decryptKey(cfg.keyEnc) },
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: 'user', content: buildPrompt(meta, type, frags) }],
      stream: true
    })
  })
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + (await res.text()).slice(0, 200))
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = '', full = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    // 只消费完整行，未完成的行尾留回 buf，避免跨 chunk 截断丢内容
    const i = buf.lastIndexOf('\n')
    if (i === -1) continue
    const chunks = parseSSE(buf.slice(0, i + 1))
    buf = buf.slice(i + 1)
    if (chunks.length) {
      full += chunks.join('')
      onDelta(full)
    }
  }
  return full
}
