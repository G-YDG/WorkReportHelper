// src/renderer/src/md.js — 受限 Markdown 渲染器：只支持报告用到的语法
// （### / #### 标题、**加粗**、- 列表、段落），先转义再套标签，无 XSS 面
import { esc } from './ui'

const inline = (s) => s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')

export function mdToHtml(src) {
  const lines = String(src || '').split(/\r?\n/)
  const out = []
  let inList = false
  const closeList = () => { if (inList) { out.push('</ul>'); inList = false } }
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line.trim()) { closeList(); continue }
    const h = line.match(/^(#{2,4})\s+(.*)$/)
    if (h) {
      closeList()
      const level = h[1].length // ## → h2, ### → h3, #### → h4
      out.push('<h' + level + '>' + inline(esc(h[2])) + '</h' + level + '>')
      continue
    }
    if (/^[-*]\s+/.test(line.trim())) {
      if (!inList) { out.push('<ul>'); inList = true }
      out.push('<li>' + inline(esc(line.trim().replace(/^[-*]\s+/, ''))) + '</li>')
      continue
    }
    closeList()
    out.push('<p>' + inline(esc(line)) + '</p>')
  }
  closeList()
  return out.join('\n')
}
