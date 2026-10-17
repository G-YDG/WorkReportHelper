import { TP } from './periods'

const seg = (type) =>
  type === 'daily'
    ? '「今日完成 / 进行中 / 风险与阻塞 / 明日计划」四段'
    : '「主要产出 / 进行中 / 问题与改进 / 下阶段计划」四段'

export function buildPrompt(meta, type, frags) {
  const lines = frags.map((f) => f.d + ' ' + f.t + ' ' + f.x + (f.done ? '（已完成）' : '')).join('\n')
  return (
    '角色：我是你的工作汇报助理。以下是我' + meta.name + '的碎片工作记录，请整理成一份中国职场通用的' + TP[type] + '。\n\n' +
    '要求：1) 归纳同类事项，不要逐条复述；2) 结构为' + seg(type) + '，无内容的段落省略；3) 每段不超过 5 条，每条一句话；4) 语气平实、对上级汇报口吻；5) 输出纯文本，不要 Markdown 符号。\n\n' +
    '记录（共 ' + frags.length + ' 条）：\n' + lines
  )
}

const g = (arr) => arr.map((f, i) => i + 1 + '. ' + f.x).join('\n') || '（无）'

export function localReport(type, frags) {
  const done = frags.filter((f) => f.done)
  const doing = frags.filter((f) => !f.done)
  if (type === 'daily') {
    let out = '【今日完成】\n' + g(done)
    if (doing.length) out += '\n\n【进行中】\n' + doing.map((f, i) => i + 1 + '. ' + f.x + '（推进中）').join('\n')
    return out + '\n\n【明日计划】\n1. 继续推进上述进行中事项，并同步相关协作方。'
  }
  let out = '【主要产出】\n' + g(done.length ? done : frags.slice(0, 3))
  out += '\n\n【进行中】\n' + g(doing)
  return out + '\n\n【下阶段计划】\n1. 按当前进度推进未完成事项，并安排复盘。'
}
