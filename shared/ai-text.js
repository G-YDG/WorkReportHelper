import { TP } from './periods'

// 记录行：日期 时间 [仓库名] 内容（已完成）；仓库名来自 Git 导入碎片，供 AI 按项目分组
const recLine = (f) => f.d + ' ' + f.t + (f.r ? ' [' + f.r + ']' : '') + ' ' + f.x + (f.done ? '（已完成）' : '')

const headOf = (type) => (type === 'daily' ? '今日完成工作' : type === 'weekly' ? '本周完成工作' : '本月完成工作')

// 默认提示词模板 —— 用户定稿版：Markdown 标题层级（二级=段落、三级=项目、四级=类别）
export function buildPrompt(meta, type, frags) {
  const lines = frags.map(recLine).join('\n')
  return (
    '角色：我是你的工作汇报助理。以下是我' + meta.name + '的碎片工作记录（Git 提交类碎片带 [仓库名] 标记），请整理成一份中国职场通用的' + TP[type] + '。\n\n' +
    '输出格式（严格遵守）：\n' +
    '1) 第一段标题为「### ' + headOf(type) + '」（三级标题），内容按项目/仓库分组：以记录中的 [仓库名] 作为组名，组名为四级标题「#### 仓库名」（无标记的碎片归入「其他」组）。\n' +
    '2) 组内按工作类别聚合：类别用加粗行「**类别**」（两到四个字的短词，如：功能开发、问题修复、代码重构、优化重构、日常维护），不加标题符号；同一类别的条目以「- 描述」列出，描述合并同类项、一句话讲清做了什么；不同类别块之间以一个空行分隔。\n' +
    '3) 第二段标题为「### 未完成工作」（三级标题），归纳记录中未完成（无「（已完成）」标记）的事项，条目格式「- 描述」；没有未完成事项时整段省略，不要输出该标题。\n' +
    '4) 只使用上述三/四级标题、加粗行与「-」列表，不要其他 Markdown 符号（如代码块、引用），不要输出额外说明。\n' +
    '5) 语气平实，对上级汇报口吻。\n\n' +
    '记录（共 ' + frags.length + ' 条）：\n' + lines
  )
}

// 本地降级生成（无 AI 配置/调用失败时）——结构对齐上述格式
const cat = (x) => {
  const m = String(x).match(/^(feat|fix|refactor|docs|chore|style|perf|test)\b/i)
  const map = { feat: '功能开发', fix: '问题修复', refactor: '代码重构', docs: '文档整理', chore: '日常维护', style: '代码格式', perf: '性能优化', test: '测试相关' }
  return m ? map[m[1].toLowerCase()] : '其他'
}

const group = (frags) => {
  // 仓库 → 类别 → 条目
  const repos = new Map()
  frags.forEach((f) => {
    const repo = f.r || '其他'
    if (!repos.has(repo)) repos.set(repo, new Map())
    const cats = repos.get(repo)
    const c = cat(f.x)
    if (!cats.has(c)) cats.set(c, [])
    cats.get(c).push(f.x)
  })
  return [...repos.entries()]
    .map(([repo, cats]) =>
      '#### ' + repo + '\n' +
      [...cats.entries()].map(([c, xs]) => '**' + c + '**\n' + xs.map((x) => '- ' + x).join('\n')).join('\n\n')
    )
    .join('\n\n')
}

export function localReport(type, frags) {
  const head = headOf(type)
  const done = frags.filter((f) => f.done)
  const doing = frags.filter((f) => !f.done)
  let body = '### ' + head + (done.length ? '\n\n' + group(done) : '\n\n-')
  if (doing.length) body += '\n\n### 未完成工作\n' + doing.map((f) => '- ' + f.x).join('\n')
  return body
}
