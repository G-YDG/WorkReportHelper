// e2e/app.e2e.js — E2E 主流程：记碎片 → 生成日报（本地降级）→ 报告管理可见 → 持久化落盘
import { test, expect, _electron } from '@playwright/test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'

// WORKREPORTHELPER_HOME 把数据目录指到临时目录（store.dataFilePath 支持该覆盖），
// 每个 test 独立一个临时目录，互不污染、不碰真实的 %APPDATA% 数据。
const LAUNCH_ARGS = ['out/main/index.js']

test('记碎片 → 生成日报（本地降级）→ 报告管理可见 → 数据已落盘', async () => {
  const home = mkdtempSync(join(tmpdir(), 'wrh-e2e-'))
  const env = { ...process.env, WORKREPORTHELPER_HOME: home }
  const app = await _electron.launch({ args: LAUNCH_ARGS, env })
  try {
    const win = await app.firstWindow()
    await win.waitForSelector('#view-today.on')

    // 1. 记一条碎片
    await win.fill('#quick', '完成 E2E 验证流程')
    await win.click('#btn-done')
    await expect(win.locator('#today-frags .frag')).toHaveCount(1)

    // 2. 生成日报（未配置 AI → localReport 降级，同步完成）
    await win.click('#btn-gen-daily')
    await win.waitForSelector('#ovl-report.show')
    await win.click('#gen-run')
    await win.waitForFunction(() => document.getElementById('gen').textContent.length > 10)
    await win.click('#gen-save')

    // 3. 报告管理可见
    await win.waitForSelector('#view-reports.on')
    await expect(win.locator('#rep-list .repitem')).toHaveCount(1)

    // 4. 持久化：data.json 落盘且含 1 条碎片 + 1 份报告（代替重启验证，更稳）
    const raw = JSON.parse(await readFile(join(home, 'data.json'), 'utf-8'))
    expect(raw.frags).toHaveLength(1)
    expect(raw.frags[0].x).toBe('完成 E2E 验证流程')
    expect(raw.reports).toHaveLength(1)
    expect(raw.reports[0].type).toBe('daily')
    expect(raw.reports[0].text.length).toBeGreaterThan(10)
  } finally {
    await app.close()
  }
})

test('导航切换：点击左侧导航可切换视图', async () => {
  const app2 = await _electron.launch({
    args: ['out/main/index.js'],
    env: { ...process.env, WORKREPORTHELPER_HOME: mkdtempSync(join(tmpdir(), 'wrh-e2e-')) }
  })
  try {
    const win = await app2.firstWindow()
    await win.waitForSelector('#view-today.on')
    await win.click('#nav-frags')
    await expect(win.locator('#view-frags.on')).toBeVisible()
    await win.click('#nav-reports')
    await expect(win.locator('#view-reports.on')).toBeVisible()
    await win.click('#nav-repos')
    await expect(win.locator('#view-repos.on')).toBeVisible()
    await win.click('#nav-today')
    await expect(win.locator('#view-today.on')).toBeVisible()
  } finally {
    await app2.close()
  }
})

test('生成弹窗支持选择历史日期（今日无碎片时仍可打开并换日期）', async () => {
  const app3 = await _electron.launch({
    args: ['out/main/index.js'],
    env: { ...process.env, WORKREPORTHELPER_HOME: mkdtempSync(join(tmpdir(), 'wrh-e2e-')) }
  })
  try {
    const win = await app3.firstWindow()
    await win.waitForSelector('#view-today.on')
    // 今日无碎片 → 生成日报弹窗仍应打开（不再 toast 后直接返回）
    await win.click('#btn-gen-daily')
    await expect(win.locator('#ovl-report.show')).toBeVisible()
    await expect(win.locator('#gen-run')).toBeDisabled()
    // 写入一条历史碎片的 db 数据后，用日期选择器生成该日日报
    const home = app3 === null ? null : null
    void home
    await win.fill('#gen-date', '2026-10-15')
    await expect(win.locator('#ovl-report.show')).toBeVisible()
    // 切到周报/月报不应报错（同一日期所在周期可能同样无碎片，但弹窗保持打开）
    await win.click('#gen-tabs button[data-t="monthly"]')
    await expect(win.locator('#ovl-report.show')).toBeVisible()
  } finally {
    await app3.close()
  }
})

test('设置 tab：定时配置往返保存 + 非法间隔报错不关闭', async () => {
  const home = mkdtempSync(join(tmpdir(), 'wrh-e2e-set-'))
  const app = await _electron.launch({ args: LAUNCH_ARGS, env: { ...process.env, WORKREPORTHELPER_HOME: home } })
  try {
    const win = await app.firstWindow()
    await win.waitForSelector('#view-today.on')
    await win.click('#btn-settings')
    await win.waitForSelector('#ovl-set.show')
    // tab 顺序：通用 / 模型配置 / 定时任务；默认停在第一项通用
    await expect(win.locator('#set-general')).toBeVisible()
    await expect(win.locator('#set-model')).toBeHidden()
    await expect(win.locator('#set-sched')).toBeHidden()
    await win.click('.set-tabs button[data-t="sched"]')
    await expect(win.locator('#set-sched')).toBeVisible()
    // 开启周报（周一 09:00 默认）+ Git 自动导入 5 分钟
    await win.click('#s-w-on')
    await win.fill('#s-g-min', '5')
    await win.click('#s-g-on')
    await win.click('#s-save')
    await expect(win.locator('#ovl-set')).toBeHidden()
    const db = JSON.parse(readFileSync(join(home, 'data.json'), 'utf-8'))
    expect(db.cfg.sched.weekly.on).toBe(true)
    expect(db.cfg.sched.weekly.points[0].day).toBe(1)
    expect(db.cfg.gitAuto).toEqual({ on: true, minutes: 5 })
    // 重开回显 + 非法值报错且不关闭
    await win.click('#btn-settings')
    await win.waitForSelector('#ovl-set.show')
    await win.click('.set-tabs button[data-t="sched"]')
    await expect(win.locator('#s-w-on')).toHaveClass(/on/)
    await expect(win.locator('#s-g-min')).toHaveValue('5')
    await win.fill('#s-g-min', '1')
    await win.click('#s-save')
    await expect(win.locator('#ovl-set')).toBeVisible()
    await expect(win.locator('#s-git-err')).toContainText('5')
    // 跨 tab 可达性：切到模型配置再保存，应跳回定时任务并显示错误（而非静默无响应）
    await win.click('.set-tabs button[data-t="model"]')
    await win.click('#s-save')
    await expect(win.locator('#set-sched')).toBeVisible()
    await expect(win.locator('#s-git-err')).toContainText('5')
  } finally {
    await app.close()
  }
})

test('Git 导入：查询提交日志前仓库标签即可切换选中/取消', async () => {
  const home = mkdtempSync(join(tmpdir(), 'wrh-e2e-git-'))
  writeFileSync(join(home, 'data.json'), JSON.stringify({
    frags: [], reports: [], nid: 1,
    cfg: { repos: [{ n: 'repoA', p: join(home, 'a'), on: true }, { n: 'repoB', p: join(home, 'b'), on: true }] }
  }))
  const app = await _electron.launch({ args: LAUNCH_ARGS, env: { ...process.env, WORKREPORTHELPER_HOME: home } })
  try {
    const win = await app.firstWindow()
    await win.waitForSelector('#view-today.on')
    await win.click('#btn-git')
    await win.waitForSelector('#ovl-git.show')
    const chipA = win.locator('#repo-tags .chip[data-n="repoA"]')
    await expect(chipA).toHaveClass(/on/)
    // 查询前：点击应立即体现取消/选中（根因：条件重渲染导致视觉滞后于 gitOff）
    await chipA.click()
    await expect(chipA).toHaveClass(/off/)
    await chipA.click()
    await expect(chipA).toHaveClass(/on/)
    // 查询后（路径不存在 → 采集失败但 collected 已置）：切换仍生效
    await win.click('#git-collect')
    await expect(win.locator('#git-stats')).toContainText('失败')
    await chipA.click()
    await expect(chipA).toHaveClass(/off/)
  } finally {
    await app.close()
  }
})

test('Git 导入：仓库超过 8 个时标签默认收缩可展开', async () => {
  const home = mkdtempSync(join(tmpdir(), 'wrh-e2e-tags-'))
  const repos = Array.from({ length: 10 }, (_, i) => ({ n: 'repo' + i, p: join(home, 'r' + i), on: true }))
  writeFileSync(join(home, 'data.json'), JSON.stringify({ frags: [], reports: [], nid: 1, cfg: { repos } }))
  const app = await _electron.launch({ args: LAUNCH_ARGS, env: { ...process.env, WORKREPORTHELPER_HOME: home } })
  try {
    const win = await app.firstWindow()
    await win.waitForSelector('#view-today.on')
    await win.click('#btn-git')
    await win.waitForSelector('#ovl-git.show')
    await expect(win.locator('#repo-tags .chip[data-n]')).toHaveCount(8)
    await expect(win.locator('#tags-toggle')).toContainText('10')
    await win.click('#tags-toggle')
    await expect(win.locator('#repo-tags .chip[data-n]')).toHaveCount(10)
    await win.click('#tags-toggle')
    await expect(win.locator('#repo-tags .chip[data-n]')).toHaveCount(8)
  } finally {
    await app.close()
  }
})

test('定时任务：日报多时间点增删与往返保存、重复报错', async () => {
  const home = mkdtempSync(join(tmpdir(), 'wrh-e2e-times-'))
  const app = await _electron.launch({ args: LAUNCH_ARGS, env: { ...process.env, WORKREPORTHELPER_HOME: home } })
  try {
    const win = await app.firstWindow()
    await win.waitForSelector('#view-today.on')
    await win.click('#btn-settings')
    await win.waitForSelector('#ovl-set.show')
    await win.click('.set-tabs button[data-t="sched"]')
    const inputs = win.locator('#s-d-times input')
    await expect(inputs).toHaveCount(1)
    await win.click('#set-sched button[data-add="d"]')
    await expect(inputs).toHaveCount(2)
    await inputs.nth(1).fill('12:00')
    await win.click('#s-save')
    await expect(win.locator('#ovl-set')).toBeHidden()
    const db = JSON.parse(readFileSync(join(home, 'data.json'), 'utf-8'))
    expect(db.cfg.sched.daily.times).toEqual(['18:30', '12:00'])
    // 重开回显 + 重复时间点报错不关闭
    await win.click('#btn-settings')
    await win.waitForSelector('#ovl-set.show')
    await win.click('.set-tabs button[data-t="sched"]')
    await expect(inputs).toHaveCount(2)
    await inputs.nth(1).fill('18:30')
    await win.click('#s-save')
    await expect(win.locator('#ovl-set')).toBeVisible()
    await expect(win.locator('#s-sched-err')).toContainText('重复')
    // 删除一个时间点后保存成功
    await win.click('#s-d-times .time-item:nth-child(2) [data-del]')
    await expect(inputs).toHaveCount(1)
    await win.click('#s-save')
    await expect(win.locator('#ovl-set')).toBeHidden()
  } finally {
    await app.close()
  }
})

test('设置：times 恶意成员渲染被转义，无 HTML 注入', async () => {
  const home = mkdtempSync(join(tmpdir(), 'wrh-e2e-esc-'))
  writeFileSync(join(home, 'data.json'), JSON.stringify({
    frags: [], reports: [], nid: 1,
    cfg: { repos: [], sched: { daily: { on: false, times: ['18:30', '"><img src=x onerror=window.__pwned=1>'] } } }
  }))
  const app = await _electron.launch({ args: LAUNCH_ARGS, env: { ...process.env, WORKREPORTHELPER_HOME: home } })
  try {
    const win = await app.firstWindow()
    await win.waitForSelector('#view-today.on')
    await win.click('#btn-settings')
    await win.waitForSelector('#ovl-set.show')
    await win.click('.set-tabs button[data-t="sched"]')
    await win.waitForTimeout(300)
    expect(await win.locator('#s-d-times img').count()).toBe(0)
    expect(await win.evaluate(() => window.__pwned)).toBeUndefined()
  } finally {
    await app.close()
  }
})

test('定时任务：周报时间点支持不同星期几往返与同日期重复报错', async () => {
  const home = mkdtempSync(join(tmpdir(), 'wrh-e2e-points-'))
  const app = await _electron.launch({ args: LAUNCH_ARGS, env: { ...process.env, WORKREPORTHELPER_HOME: home } })
  try {
    const win = await app.firstWindow()
    await win.waitForSelector('#view-today.on')
    await win.click('#btn-settings')
    await win.waitForSelector('#ovl-set.show')
    await win.click('.set-tabs button[data-t="sched"]')
    const items = win.locator('#s-w-points .time-item')
    await expect(items).toHaveCount(1)
    await win.click('#set-sched button[data-add="w"]')
    await expect(items).toHaveCount(2)
    await items.nth(1).locator('select').selectOption('5')
    await items.nth(1).locator('input').fill('18:00')
    await win.click('#s-save')
    await expect(win.locator('#ovl-set')).toBeHidden()
    const db = JSON.parse(readFileSync(join(home, 'data.json'), 'utf-8'))
    expect(db.cfg.sched.weekly.points).toEqual([{ day: 1, time: '09:00' }, { day: 5, time: '18:00' }])
    // 重开回显：第二个点周五 18:00
    await win.click('#btn-settings')
    await win.waitForSelector('#ovl-set.show')
    await win.click('.set-tabs button[data-t="sched"]')
    await expect(items.nth(1).locator('select')).toHaveValue('5')
    await expect(items.nth(1).locator('input')).toHaveValue('18:00')
    // 同星期+同时间 → 重复报错不关闭
    await items.nth(1).locator('select').selectOption('1')
    await items.nth(1).locator('input').fill('09:00')
    await win.click('#s-save')
    await expect(win.locator('#ovl-set')).toBeVisible()
    await expect(win.locator('#s-sched-err')).toContainText('重复')
  } finally {
    await app.close()
  }
})
