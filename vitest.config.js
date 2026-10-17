import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: { include: ['tests/unit/**/*.test.js'] },
  resolve: {
    alias: [
      {
        find: /^electron$/,
        replacement: fileURLToPath(new URL('./tests/mocks/electron.js', import.meta.url))
      }
    ]
  }
})
