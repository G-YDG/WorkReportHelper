import { describe, it, expect } from 'vitest'
import { parseSSE } from '../../src/main/services/ai'

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
