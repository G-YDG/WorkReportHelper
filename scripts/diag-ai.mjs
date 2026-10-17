// 一次性诊断脚本：走真实链路（渲染端 → IPC → 主进程 streamReport）打一次网关，
// 采集主进程 [ai] 诊断输出与返回值。不落库、不打印 Key 明文。
// 用法：node scripts/diag-ai.mjs
import { _electron } from 'playwright'
import { join } from 'node:path'

// 数据指向真实目录；userData 被主进程隔离逻辑指到其下 userData/，不会与 dev 实例撞锁
const home = join(process.env.APPDATA, 'WorkReportHelper')
const app = await _electron.launch({
  args: ['out/main/index.js'],
  env: { ...process.env, WORKREPORTHELPER_HOME: home }
})
app.process().stdout.on('data', (d) => process.stdout.write('[main] ' + d))
app.process().stderr.on('data', (d) => process.stdout.write('[main-err] ' + d))

const win = await app.firstWindow()
try {
  const r = await win.evaluate(async () => {
    const keyOf = (d) =>
      d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
    const db = await window.api.store.load()
    const cfg = db.cfg
    const k = keyOf(new Date())
    const meta = { d: k, from: k, to: k, name: '今天' }
    const frags = db.frags.filter((f) => f.d === k)
    const info = { url: cfg.url, model: cfg.model, hasKeyEnc: !!cfg.keyEnc, todayFrags: frags.length }
    try {
      const text = await window.api.ai.generate(cfg, 'daily', meta, frags)
      return { ...info, ok: true, textLength: (text || '').length, textHead: (text || '').slice(0, 120) }
    } catch (e) {
      return { ...info, ok: false, error: String(e && e.message ? e.message : e) }
    }
  })
  console.log('[diag] 结果:', JSON.stringify(r, null, 2))
} finally {
  await app.close()
}
