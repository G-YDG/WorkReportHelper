import { describe, it, expect } from 'vitest'
import { parseSSE, normalizeUrl, extractNonStreamContent } from '../../src/main/services/ai'

describe('parseSSE', () => {
  it('解析标准 data 行', () => {
    const chunk = 'data: {"choices":[{"delta":{"content":"你好"}}]}\n\n'
    expect(parseSSE(chunk)).toEqual(['你好'])
  })
  it('忽略 [DONE] 与空行、跨行拼接', () => {
    const chunk = 'data: {"choices":[{"delta":{"content":"a"}}]}\ndata: [DONE]\n\n'
    expect(parseSSE(chunk)).toEqual(['a'])
  })
  it('非 JSON 行静默忽略', () => {
    expect(parseSSE(': keep-alive\ndata: notjson\n\n')).toEqual([])
  })
  it('半行跨块：完整行保留、半行被忽略', () => {
    const chunk = 'data: {"choices":[{"delta":{"content":"世"}}]}\ndata: {"cho'
    expect(parseSSE(chunk)).toEqual(['世'])
  })
  it('CRLF 行', () => {
    expect(parseSSE('data: {"choices":[{"delta":{"content":"a"}}]}\r\n\r\n')).toEqual(['a'])
  })
})

describe('normalizeUrl', () => {
  it('基地址自动补全 /chat/completions', () => {
    expect(normalizeUrl('https://api.deepseek.com/v1')).toBe('https://api.deepseek.com/v1/chat/completions')
    expect(normalizeUrl('https://api.deepseek.com/v1/')).toBe('https://api.deepseek.com/v1/chat/completions')
  })
  it('已含完整路径则不重复追加（含尾斜杠）', () => {
    expect(normalizeUrl('https://x.com/v1/chat/completions')).toBe('https://x.com/v1/chat/completions')
    expect(normalizeUrl('https://x.com/v1/chat/completions/')).toBe('https://x.com/v1/chat/completions')
  })
})

describe('normalizeUrl 裸地址', () => {
  it('仅 host:port 无路径时补全 /v1/chat/completions（one-api 类网关约定）', () => {
    expect(normalizeUrl('http://172.16.88.88:3000')).toBe('http://172.16.88.88:3000/v1/chat/completions')
    expect(normalizeUrl('http://172.16.88.88:3000/')).toBe('http://172.16.88.88:3000/v1/chat/completions')
  })
})

describe('兼容非标准流式响应', () => {
  it('parseSSE 兼容一次性返回 message 内容的 SSE 行', () => {
    const chunk = 'data: {"choices":[{"message":{"content":"完整内容"}}]}\n\n'
    expect(parseSSE(chunk)).toEqual(['完整内容'])
  })
  it('extractNonStreamContent 提取普通 JSON 响应', () => {
    const body = JSON.stringify({ choices: [{ message: { content: '非流式内容' } }] })
    expect(extractNonStreamContent(body)).toBe('非流式内容')
  })
  it('extractNonStreamContent 对非 JSON/空 choices 返回空串', () => {
    expect(extractNonStreamContent('not json')).toBe('')
    expect(extractNonStreamContent('{"choices":[]}')).toBe('')
  })
})
