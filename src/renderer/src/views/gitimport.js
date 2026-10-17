// src/renderer/src/views/gitimport.js — Git 导入弹窗：收集各仓库提交 / 勾选排除 / 导入为已完成碎片
import { state, addFrag } from '../state'
import { $, esc, toast } from '../ui'
import { keyOf } from '../../../../shared/periods'
import { renderAll } from '../main'

let collected = null
let gitOff = new Set()
const importedSet = () => new Set(state.db.frags.filter((f) => f.h).map((f) => f.h))
const activeRepos = () => state.db.cfg.repos.filter((r) => r.on !== false && !gitOff.has(r.n))

export function openGit(targetDay) {
  gitOff = new Set()
  collected = null
  $('git-src').value = targetDay || keyOf(new Date())
  $('git-target').value = $('git-src').value
  renderGit()
  $('ovl-git').classList.add('show')
}

function renderGit() {
  const src = $('git-src').value || keyOf(new Date())
  const imp = importedSet()
  $('repo-tags').innerHTML = state.db.cfg.repos
    .map((r) => {
      const off = r.on === false || gitOff.has(r.n)
      return '<span class="chip' + (off ? ' off' : ' on') + '" data-n="' + esc(r.n) + '">' + esc(r.n) + '</span>'
    })
    .join('')
  $('repo-tags').querySelectorAll('.chip').forEach((ch) => (ch.onclick = () => {
    const r = state.db.cfg.repos.find((x) => x.n === ch.dataset.n)
    if (!r || r.on === false) return
    if (gitOff.has(r.n)) gitOff.delete(r.n)
    else gitOff.add(r.n)
    if (collected && collected.date === src) renderGit()
  }))
  if (!collected || collected.date !== src) {
    $('commit-list').innerHTML =
      '<div class="empty">选择提交日期后点「查询提交日志」<br>将从各启用仓库拉取该日期的提交</div>'
    $('git-stats').textContent = ''
    $('git-import').disabled = true
    $('git-import').textContent = '导入'
    return
  }
  const ls = collected.commits
  const newN = ls.filter((c) => !imp.has(c.h)).length
  $('git-stats').textContent =
    '共 ' + ls.length + ' 条 · 可导入 ' + newN + ' 条' +
    (collected.failures.length ? ' · 失败 ' + collected.failures.length + ' 个仓库' : '')
  $('commit-list').innerHTML = ls.length
    ? ls
        .map((c) => {
          const isImp = imp.has(c.h)
          return (
            '<div class="commit' + (isImp ? ' imp' : '') + '" style="cursor:default">' +
            '<span class="ch">' + c.h + '</span>' +
            '<span class="chip" style="cursor:default;flex:none">' + esc(c.r) + '</span>' +
            '<span class="cm">' + esc(c.m) + '</span>' +
            '<span class="cd">' + c.t + (isImp ? ' · 已导入' : '') + '</span></div>'
          )
        })
        .join('')
    : '<div class="empty">该日期没有提交记录</div>'
  $('git-import').disabled = newN === 0
  $('git-import').textContent = '导入 ' + newN + ' 条'
}

export function bindGitImport() {
  $('git-collect').onclick = async () => {
    const src = $('git-src').value || keyOf(new Date())
    if (!activeRepos().length) return toast('没有启用的仓库，请先在「Git 仓库」添加', 'err')
    $('git-collect').disabled = true
    $('git-stats').textContent = '收集 ' + src + ' 的提交中…'
    try {
      const { commits, failures } = await window.api.git.collect(src, activeRepos())
      collected = { date: src, commits, failures }
      $('git-target').value = src
      failures.forEach((f) => toast('仓库 ' + f.repo + ' 失败：' + f.msg, 'err'))
      renderGit()
    } catch (e) {
      $('git-stats').textContent = ''
      toast('收集失败：' + String((e && e.message) || e).split('\n')[0], 'err')
    } finally {
      $('git-collect').disabled = false
    }
  }
  $('git-src').onchange = () => {
    collected = null
    renderGit()
  }
  $('git-import').onclick = () => {
    const imp = importedSet()
    const tgt = $('git-target').value || keyOf(new Date())
    const picks = (collected ? collected.commits : []).filter((c) => !imp.has(c.h))
    if (!picks.length) return toast('没有可导入的新提交', 'err')
    picks.forEach((c) => addFrag(tgt, c.t, c.m, true, { h: c.h, r: c.r }))
    if (state.view === 'frags') state.selDay = tgt
    renderAll()
    $('ovl-git').classList.remove('show')
    toast('已导入 ' + picks.length + ' 条提交到 ' + tgt + '（标记已完成）', 'ok')
  }
}
