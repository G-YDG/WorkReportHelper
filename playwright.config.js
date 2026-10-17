// playwright.config.js — E2E 配置：Electron 主流程（_electron 不需要浏览器二进制）
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.js', // 默认只匹配 *.spec.* / *.test.*，这里放行 *.e2e.js
  timeout: 60000,
  use: { trace: 'off' }
})
