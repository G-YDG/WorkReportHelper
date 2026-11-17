// tests/mocks/electron.js
// 单测环境替代 electron 的 safeStorage（对称 mock）
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
export const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from('ENC:' + s, 'utf-8'),
  decryptString: (buf) => buf.toString('utf-8').replace(/^ENC:/, '')
}
// 框架边界替身：捕获构造参数供断言「我们传给框架的配置」，其余方法空操作
export class BrowserWindow {
  constructor(options) { this.options = options }
  on() {}
  loadURL() {}
  loadFile() {}
  hide() {}
  show() {}
}
// dev 模式下 getAppPath() 即项目根目录；由模块位置推导，不依赖启动 cwd
const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..')
export const app = { getAppPath: () => ROOT }
export default { safeStorage, BrowserWindow, app }
