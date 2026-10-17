// tests/mocks/electron.js
// 单测环境替代 electron 的 safeStorage（对称 mock）
export const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from('ENC:' + s, 'utf-8'),
  decryptString: (buf) => buf.toString('utf-8').replace(/^ENC:/, '')
}
export default { safeStorage }
