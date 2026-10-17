import { describe, it, expect } from 'vitest'
import { mdToHtml } from '../../src/renderer/src/md'

describe('mdToHtml（受限 Markdown 渲染）', () => {
  it('三级/四级标题、加粗、列表', () => {
    const html = mdToHtml('### 今日完成工作\n\n#### 项目A\n**功能开发**\n- feat: 新增接口\n- fix: 修复问题')
    expect(html).toContain('<h3>今日完成工作</h3>')
    expect(html).toContain('<h4>项目A</h4>')
    expect(html).toContain('<strong>功能开发</strong>')
    expect(html).toContain('<li>feat: 新增接口</li>')
    expect(html).toContain('<ul>')
  })
  it('HTML 字符转义（无 XSS 面）', () => {
    const html = mdToHtml('- <script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })
  it('二级标题与空串', () => {
    expect(mdToHtml('## 未完成工作')).toContain('<h2>未完成工作</h2>')
    expect(mdToHtml('')).toBe('')
  })
})
