import { buildPrompt } from '../../../shared/ai-text'
import { decryptKey } from './store'

// 解析一段 SSE 文本中的内容增量（纯函数，可测）；兼容 CRLF 行尾。
// 兼容两种载荷：标准流式 delta.content 与网关一次性返回的 message.content
export function parseSSE(text) {
  const out = []
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.match(/^data:\s?(.*)$/)
    const payload = m ? m[1].trim() : ''
    if (!m || payload === '[DONE]') continue
    try {
      const j = JSON.parse(payload)
      const c = j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.message?.content
      if (c) out.push(c)
    } catch {
      /* keep-alive 或非 JSON 行，静默忽略 */
    }
  }
  return out
}

// 非流式响应（Content-Type: application/json）的内容提取：网关不支持 stream 时走这里
export function extractNonStreamContent(text) {
  try {
    return JSON.parse(text)?.choices?.[0]?.message?.content ?? ''
  } catch {
    return ''
  }
}

// 接口地址归一化：
// 1) 已以 /chat/completions 结尾 → 原样（去尾斜杠）
// 2) 有路径（如 /v1）→ 补 /chat/completions
// 3) 裸地址（仅 host:port，one-api/new-api 类网关的常见填法）→ 补 /v1/chat/completions
export function normalizeUrl(url) {
  const u = String(url || '').replace(/\/+$/, '')
  if (/\/chat\/completions$/.test(u)) return u
  let path = ''
  try {
    path = new URL(u).pathname.replace(/\/+$/, '')
  } catch {
    /* 非法 URL 交给 fetch 报错 */
  }
  if (!path) return u + '/v1/chat/completions'
  return u + '/chat/completions'
}

export async function testConnection(cfg) {
  if (!/^https?:\/\//.test(cfg.url)) throw new Error('接口地址需以 http(s):// 开头')
  if (!cfg.key) throw new Error('请填写 API Key')
  const res = await fetch(normalizeUrl(cfg.url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key },
    body: JSON.stringify({ model: cfg.model || 'gpt-3.5-turbo', messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 })
  })
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + (await res.text()).slice(0, 120))
  // 防「假成功」：部分网关对未知路径回落 SPA 首页（HTML, 200），那不是 API 端点
  const ctype = res.headers.get('content-type') || ''
  if (!ctype.includes('json')) {
    throw new Error('该地址返回的是网页而非 API（content-type: ' + ctype + '），请检查接口地址')
  }
  return true
}

export async function streamReport(cfg, type, meta, frags, onDelta, promptOverride) {
  if (!cfg.model) throw new Error('未配置模型名，请在设置中填写')
  // promptOverride：渲染端可编辑的提示词；未传/为空时按默认模板拼接
  const prompt = (promptOverride && String(promptOverride).trim()) || buildPrompt(meta, type, frags)
  const res = await fetch(normalizeUrl(cfg.url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + decryptKey(cfg.keyEnc) },
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: 'user', content: prompt }],
      stream: true
    })
  })
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + (await res.text()).slice(0, 200))
  // 部分网关不支持 stream:true，会以普通 JSON 一次性返回——按 Content-Type 分流
  const ctype = res.headers.get('content-type') || ''
  if (ctype.includes('application/json')) {
    const body = await res.text()
    const full = extractNonStreamContent(body)
    if (!full) throw new Error('接口响应无法解析（content-type: ' + ctype + '）→ ' + body.slice(0, 200))
    if (full) onDelta(full)
    return full
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = '', full = '', raw = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    const piece = decoder.decode(value, { stream: true })
    raw += piece
    buf += piece
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
  // 兜底：整段 raw 不是标准 SSE 时（如一次性 JSON 混在 event-stream 头里），直接按非流式提取
  if (!full) full = extractNonStreamContent(raw)
  if (!full) throw new Error('接口响应无法解析（content-type: ' + ctype + '，非标准 SSE）→ ' + raw.slice(0, 200))
  return full
}
