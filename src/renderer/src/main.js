// src/renderer/src/main.js — 渲染端入口：视图切换 / 总渲染 / 各视图模块装配
import './styles/main.css'
import { initState, state } from './state'
import { bindEditBox, $ } from './ui'
import { labelOf, keyOf } from '../../../shared/periods'
import { bindToday } from './views/today'
import { bindFrags } from './views/frags'
import { bindReports } from './views/reports'
import { bindRepos } from './views/repos'
import { bindGen, openGen } from './views/gen'
import { bindGitImport } from './views/gitimport'
import { bindSettings } from './views/settings'

const VIEWS = ['today', 'frags', 'reports', 'repos']
const RENDER = {
  today: () => import('./views/today').then((m) => m.renderToday()),
  frags: () => import('./views/frags').then((m) => m.renderFrags()),
  reports: () => import('./views/reports').then((m) => m.renderReports()),
  repos: () => import('./views/repos').then((m) => m.renderRepos())
}
export function switchView(v) {
  state.view = v
  VIEWS.forEach((k) => {
    document.getElementById('nav-' + k).classList.toggle('on', k === v)
    document.getElementById('view-' + k).classList.toggle('on', k === v)
  })
  renderAll() // 标题/副标题/计数随视图切换刷新
}
export function renderAll() {
  const VT = { today: '今日记录', frags: '工作碎片', reports: '报告管理', repos: 'Git 仓库' }
  const VS = { today: labelOf(keyOf(new Date())), frags: '按日期回看每一天的原始记录', reports: '按周期归档的 AI 报告，可查看与修改', repos: '维护参与 Git 导入的本地仓库' }
  $('v-title').textContent = VT[state.view]
  $('v-sub').textContent = VS[state.view]
  RENDER[state.view]()
  document.getElementById('cnt-frags').textContent = state.db.frags.length
  document.getElementById('cnt-reps').textContent = state.db.reports.length
  document.getElementById('cnt-repos').textContent = state.db.cfg.repos.length
}

initState()
  .then((db) => {
    bindEditBox()
    document.querySelectorAll('.m-close').forEach((b) => (b.onclick = () => document.getElementById(b.dataset.c).classList.remove('show')))
    bindToday(); bindFrags(); bindReports(); bindRepos(); bindGen(); bindGitImport(); bindSettings()
    // 左侧导航（原型 634-637 行）
    VIEWS.forEach((k) => (document.getElementById('nav-' + k).onclick = () => switchView(k)))
    window.api.app.onTray((cmd) => { if (cmd === 'gen-daily') openGen('daily') })
    switchView('today')
  })
  .catch((e) => {
    document.body.insertAdjacentHTML('beforeend', '<div style="padding:40px;color:#dd7580">数据加载失败：' + String(e.message || e) + '</div>')
  })
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.querySelectorAll('.ovl.show').forEach((o) => o.classList.remove('show'))
})
document.getElementById('btn-close').onclick = () => window.close() // 触发主进程 close→hide
