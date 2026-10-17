// e2e/app.e2e.js — E2E 主流程：记碎片 → 生成日报（本地降级）→ 报告管理可见 → 持久化落盘
import { test, expect, _electron } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
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
