// src/renderer/src/views/repos.js — Git 仓库视图：草稿编辑 / 扫描文件夹 / 保存配置
import { state, persist } from '../state'
import { $, esc, toast } from '../ui'
import { renderAll } from '../main'

let repoDraft = null
let repoDirty = false
let scanRes = []
let scanning = false

const draft = () => (repoDraft ??= state.db.cfg.repos.map((r) => ({ ...r })))

const markDirty = () => {
  repoDirty = true
  $('repo-save').disabled = false
  $('repo-hint').textContent = '有未保存的修改'
}

export function renderRepos() {
  draft()
  $('repo-rows').innerHTML =
    repoDraft
      .map(
        (r, i) =>
          '<div class="rrow">' +
          '<span class="sw' + (r.on !== false ? ' on' : '') + '" data-i="' + i + '" title="是否参与导入"></span>' +
          '<input class="rn" data-i="' + i + '" data-k="n" value="' + esc(r.n) + '" placeholder="仓库名">' +
          '<input class="rp" data-i="' + i + '" data-k="p" value="' + esc(r.p) + '" placeholder="路径 如 D:\\code\\app">' +
          (r.on === false ? '<span class="off-tag">已停用</span>' : '') +
          '<button class="op del" data-i="' + i + '" title="删除"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"><path d="M5 7h14M9 7V5h6v2m-8 0l1 13h6l1-13"/></svg></button></div>'
      )
      .join('') || '<div class="empty" style="padding:12px 0">尚未添加仓库 · 点「手动添加」或「扫描文件夹」</div>'
  $('repo-rows').querySelectorAll('.sw').forEach((s) => (s.onclick = () => {
    const i = +s.dataset.i
    repoDraft[i].on = repoDraft[i].on === false
    markDirty()
    renderRepos()
  }))
  $('repo-rows').querySelectorAll('input').forEach((inp) => (inp.oninput = () => {
    repoDraft[+inp.dataset.i][inp.dataset.k] = inp.value
    markDirty()
  }))
  $('repo-rows').querySelectorAll('.op.del').forEach((b) => (b.onclick = () => {
    repoDraft.splice(+b.dataset.i, 1)
    markDirty()
    renderRepos()
  }))
  $('repo-stats').textContent = repoDraft.length + ' 个仓库 · ' + repoDraft.filter((r) => r.on !== false).length + ' 个参与导入'
  $('repo-save').disabled = !repoDirty
}

// 扫描结果弹窗：fresh 可勾选（默认全选），已知仓库禁用并标注「已存在」
function renderScanResult(freshCount) {
  $('scan-path').textContent = $('scan-dir').value.trim().replace(/[\\/]+$/, '')
  if (!scanRes.length) {
    $('scan-sum').textContent = '发现 0 个 Git 仓库'
    $('scan-list').innerHTML = '<div class="empty">该目录下未发现 Git 仓库<br>会遍历子目录检测 .git，最多向下 3 层</div>'
    $('scan-ok').disabled = true
    $('ovl-scan').classList.add('show')
    return
  }
  $('scan-sum').textContent = '发现 ' + scanRes.length + ' 个 Git 仓库 · 新 ' + freshCount + ' 个 · 勾选要加入的（已存在的不可选）'
  $('scan-list').innerHTML = scanRes
    .map(
      (f, i) =>
        '<div class="commit' + (f.fresh ? '' : ' imp') + '" data-i="' + i + '">' +
        '<input type="checkbox"' + (f.picked ? ' checked' : '') + (!f.fresh ? ' disabled' : '') + '>' +
        '<span class="cm" style="white-space:normal"><b>' + esc(f.n) + '</b><br>' +
        '<span style="color:var(--text3);font-size:11px">' + esc(f.p) + '</span></span>' +
        '<span class="cd">' + (f.fresh ? '新仓库' : '已存在') + '</span></div>'
    )
    .join('')
  $('scan-list').querySelectorAll('.commit').forEach((row) => {
    const idx = +row.dataset.i
    if (!scanRes[idx].fresh) return
    row.onclick = () => {
      scanRes[idx].picked = !scanRes[idx].picked
      row.querySelector('input').checked = scanRes[idx].picked
      $('scan-ok').disabled = !scanRes.some((x) => x.fresh && x.picked)
    }
  })
  $('scan-ok').disabled = !scanRes.some((x) => x.fresh && x.picked)
  $('ovl-scan').classList.add('show')
}

export function bindRepos() {
  // 手动添加：弹出系统文件夹选择框，选中即加入草稿；仓库名默认取文件夹名
  $('repo-add').onclick = async () => {
    const dir = await window.api.app.pickDir()
    if (!dir) return
    draft()
    const folder = (dir.split(/[\\/]/).filter(Boolean).pop() || '').replace(/\.git$/, '')
    repoDraft.push({ n: folder, p: dir, on: true })
    markDirty()
    renderRepos()
  }
  $('repo-scan').onclick = async () => {
    if (scanning) return
    const dir = await window.api.app.pickDir($('scan-dir').value.trim() || undefined)
    if (!dir) return
    $('scan-dir').value = dir
    scanning = true
    $('scan-sum').textContent = '扫描中…'
    $('scan-list').innerHTML = ''
    $('scan-path').textContent = dir
    $('scan-ok').disabled = true
    $('ovl-scan').classList.add('show')
    try {
      const found = await window.api.git.scan(dir)
      const known = new Set(draft().map((r) => r.p.replace(/[\\/]+$/, '')))
      scanRes = found
        .map((f) => ({ n: f.n, p: f.p, fresh: !known.has(f.p.replace(/[\\/]+$/, '')), picked: true }))
      renderScanResult(scanRes.filter((f) => f.fresh).length)
    } catch (e) {
      scanRes = []
      $('scan-sum').textContent = '扫描失败：' + String((e && e.message) || e).split('\n')[0]
      $('scan-list').innerHTML = '<div class="empty">请检查路径是否存在且可访问</div>'
      $('scan-ok').disabled = true
    } finally {
      scanning = false
    }
  }
  $('scan-ok').onclick = () => {
    const picks = scanRes.filter((f) => f.fresh && f.picked)
    if (!picks.length) return toast('请至少勾选一个新发现的仓库', 'err')
    draft()
    picks.forEach((f) => repoDraft.push({ n: f.n, p: f.p, on: true }))
    markDirty()
    renderRepos()
    $('ovl-scan').classList.remove('show')
    toast('已添加 ' + picks.length + ' 个仓库（点「保存仓库配置」生效）', 'ok')
  }
  $('repo-save').onclick = () => {
    state.db.cfg.repos = repoDraft
      .map((r) => ({
        n:
          (r.n || '').trim() ||
          ((r.p || '').split(/[\\/]/).filter(Boolean).pop() || '').replace(/\.git$/, '') ||
          'repo',
        p: (r.p || '').trim(),
        on: r.on !== false
      }))
      .filter((r) => r.p)
    persist()
    repoDirty = false
    repoDraft = null
    renderRepos()
    renderAll()
    $('repo-hint').textContent = ''
    toast('仓库配置已保存 · ' + state.db.cfg.repos.length + ' 个', 'ok')
  }
}
