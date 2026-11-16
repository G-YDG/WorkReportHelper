# 设置模块增强（周报/月报定时 + Git 自动导入 + 设置 Tab）实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 subagent-driven-development（推荐）或 executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 定时生成从仅日报扩展为日报/周报/月报各自独立调度；新增每 X 分钟自动导入当天 Git 提交；设置弹窗拆为「AI 配置 / 定时任务 / 通用」三个 tab。

**架构：** 主进程保持「纯函数模块 + 注入依赖」模式：`scheduler.js` 扩展为多类型到点触发；新增 `autoimport.js` 承载间隔导入与通知去重；现有 index.js 内联的日报触发流程抽取为 `reportjob.js`（可单测）。配置新增 `cfg.sched` / `cfg.gitAuto`，`store.js` 负责旧 `cfg.auto/time` 迁移。渲染端仅改设置弹窗（tab + 新字段），保存仍走现有 `db:save` 全量落盘，无需新增 IPC。

**技术栈：** Electron 44 / vanilla JS（ESM）/ vitest（electron 别名 mock 见 `tests/mocks/electron.js`）/ Playwright `_electron` E2E。

**规格：** 2026-11-16 会话确认的需求（用户跳过 brainstorming 提问）；默认决定见「全局约束」，均为实现方默认、用户可否决。

## 全局约束

- 不新增任何依赖；测试只用现有 vitest / Playwright。
- 主进程业务逻辑放纯函数模块，`now` 与外部依赖全部注入，可单测（沿用 `scheduler.js` 现有模式）。
- 通知与 UI 文案中文；报告类型名一律用 `shared/periods.js` 的 `TP`（日报/周报/月报）。
- 新配置 schema（默认值逐字如下）：
  - `cfg.sched.daily = { on: false, time: '18:30' }`
  - `cfg.sched.weekly = { on: false, time: '09:00', weekday: 1 }`（weekday 0–6，1=周一）
  - `cfg.sched.monthly = { on: false, time: '09:00', day: 1 }`（day 1–28，保证短月必触发）
  - `cfg.gitAuto = { on: false, minutes: 30 }`（minutes 整数 5–1440）
- 旧 `cfg.auto / cfg.time` 在 `loadDb` 时迁移为 `sched.daily`，迁移后删除这两个旧字段（单一事实来源）。
- 周报/月报触发时生成**上一个已完结自然周/自然月**（`prevMeta`）；周期内无碎片跳过并通知；同 type+周期 的报告覆盖保存（沿用日报行为）。
- 周报/月报触发前对周期内 ≤ 今天的每一天回填导入 Git 提交（按 hash 去重）；日报保持仅当天。
- Git 自动导入：开启时启动立即执行一次，之后每 minutes 分钟一次；只导入**当天**提交；仅 added>0 通知；失败通知按「失败仓库集合」去重防刷屏。
- 设置弹窗三 tab：AI 配置 / 定时任务 / 通用；底部单一「保存设置」按钮；minutes 非法（非整数或越界）时在字段旁报错且不关闭弹窗。
- 窗口 1080×680 不变；设置内容超出时弹窗内部滚动（沿用现有 `.mbody` overflow）。
- commit 格式：`feat|fix|test|refactor(scope): 中文描述`，结尾附 `Co-Authored-By: Claude Code <noreply@anthropic.com>`。

## 审查重点（Review Focus）

1. 旧版 `cfg.auto=true` 用户升级后日报定时丢失 → 任务 2 迁移测试钉住。
2. 周报/月报触发时误生成「本周/本月」（空周期）而非上一已完结周期 → 任务 1 `prevMeta` 测试 + 任务 5 reportjob 的 meta 断言钉住。
3. 月报配在 29/30/31 号导致短月永不触发 → day 取值限 1–28（UI select 只生成 1–28）+ 任务 3 二月 28 日触发测试钉住。
4. Git 自动导入在同一间隔内重复 collect / 重复导入通知 → 任务 4 间隔与去重通知测试钉住（hash 去重本身已有 `gitimport.test.js`）。
5. 定时任务 await 期间渲染端 `db:save` 替换 dbCache，报告写进旧对象丢失 → 任务 5 「await 后现取 getDb()」测试钉住。

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `shared/periods.js` | 修改 | 新增 `prevMeta(type, now)`：上一已完结周期元数据 |
| `src/main/services/store.js` | 修改 | `migrateCfg(cfg)` + `DEFAULT_DB` 含新 schema；`loadDb` 应用迁移 |
| `src/main/services/scheduler.js` | 重写 | 多类型到点触发（daily/weekly/monthly），`onTrigger(db, now, type)` |
| `src/main/services/autoimport.js` | 创建 | `clampMinutes` + `createGitAutoImporter`（间隔、首跑、导入、通知去重） |
| `src/main/services/reportjob.js` | 创建 | `runReportJob(deps)`：通知→回填导入→无碎片跳过→生成→覆盖保存 |
| `src/main/index.js` | 修改 | 接线：scheduler onTrigger → runReportJob；gitImporter；60s tick 双调度 |
| `src/renderer/index.html` | 修改 | 设置弹窗 tab 结构 + 定时任务/通用 pane 字段 |
| `src/renderer/src/styles/main.css` | 修改 | `.set-tabs/.set-pane/.schedrow/.sched-ctl` 样式 |
| `src/renderer/src/views/settings.js` | 重写 | tab 切换、新字段读写、minutes 校验、保存 |
| `tests/unit/periods.test.js` | 修改 | prevMeta 测试 |
| `tests/unit/store.test.js` | 修改 | 迁移测试 |
| `tests/unit/scheduler.test.js` | 重写 | 多类型调度测试 |
| `tests/unit/autoimport.test.js` | 创建 | 间隔/首跑/通知去重测试 |
| `tests/unit/reportjob.test.js` | 创建 | 触发流程测试 |
| `e2e/app.e2e.js` | 修改 | 新增设置 tab + 定时配置往返 + 非法 minutes 用例 |

---

### 任务 1：prevMeta（上一已完结周期）

**文件：**
- 修改：`shared/periods.js`（追加导出）
- 测试：`tests/unit/periods.test.js`（追加 describe）

- [ ] **步骤 1：编写失败的测试**

```js
describe('prevMeta', () => {
  it('weekly：周一触发 → 上一自然周（含 name 上周）', () => {
    const m = prevMeta('weekly', new Date(2026, 10, 16, 9, 0)) // 2026-11-16 周一
    expect(m.from).toBe('2026-11-09')
    expect(m.to).toBe('2026-11-15')
    expect(m.d).toBe('W-2026-11-09')
    expect(m.name).toBe('上周')
  })
  it('weekly：跨 DST 的周一凌晨仍取上一周（日历减法而非毫秒减法）', () => {
    const m = prevMeta('weekly', new Date(2026, 2, 9, 0, 30)) // 周一 00:30
    expect(m.from).toBe('2026-03-02')
  })
  it('monthly：1 号触发 → 上一自然月', () => {
    const m = prevMeta('monthly', new Date(2026, 10, 1, 9, 0))
    expect(m.from).toBe('2026-10-01')
    expect(m.to).toBe('2026-10-31')
    expect(m.d).toBe('M-2026-10')
    expect(m.name).toBe('上月')
  })
  it('monthly：跨年 1 月 → 上年 12 月', () => {
    expect(prevMeta('monthly', new Date(2026, 0, 1)).d).toBe('M-2025-12')
  })
  it('daily：等同 genMeta daily', () => {
    const now = new Date(2026, 10, 16, 18, 30)
    expect(prevMeta('daily', now)).toEqual({ ...genMeta('daily', now), name: '今天' })
  })
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run tests/unit/periods.test.js`
预期：FAIL，`prevMeta is not a function` / 导出缺失。

- [ ] **步骤 3：实现 `prevMeta(type, now = new Date())`**

签名：`export const prevMeta = (type, now = new Date()) => meta`。
weekly 用日历减法 `new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)` 后 `isoWeek`；monthly 用 `new Date(now.getFullYear(), now.getMonth() - 1, 1)` 后 `monthOf`；daily 返回 `{ ...genMeta('daily', now), name: '今天' }`；weekly/monthly 的 name 分别为 `'上周'`/`'上月'`。禁止用 `now.getTime() - 7*864e5`（DST 会错周）。

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run tests/unit/periods.test.js`
预期：PASS（含既有用例）。

- [ ] **步骤 5：Commit**

```bash
git add shared/periods.js tests/unit/periods.test.js
git commit -m "feat(periods): 新增 prevMeta 上一已完结周期元数据

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### 任务 2：cfg 新 schema 与旧配置迁移

**文件：**
- 修改：`src/main/services/store.js:6-19`
- 测试：`tests/unit/store.test.js`（追加 describe）

- [ ] **步骤 1：编写失败的测试**

```js
describe('migrateCfg', () => {
  it('旧 auto/time 迁移为 sched.daily 并删除旧字段', () => {
    const cfg = migrateCfg({ repos: [], auto: true, time: '17:00' })
    expect(cfg.sched.daily).toEqual({ on: true, time: '17:00' })
    expect(cfg.auto).toBeUndefined()
    expect(cfg.time).toBeUndefined()
  })
  it('无旧字段也无 sched → 全默认（daily 关）', () => {
    const cfg = migrateCfg({ repos: [] })
    expect(cfg.sched.daily).toEqual({ on: false, time: '18:30' })
    expect(cfg.sched.weekly).toEqual({ on: false, time: '09:00', weekday: 1 })
    expect(cfg.sched.monthly).toEqual({ on: false, time: '09:00', day: 1 })
    expect(cfg.gitAuto).toEqual({ on: false, minutes: 30 })
  })
  it('已有 sched 不被覆盖，缺省类型补默认', () => {
    const cfg = migrateCfg({ sched: { weekly: { on: true, time: '08:00', weekday: 5 } }, gitAuto: { on: true, minutes: 10 } })
    expect(cfg.sched.weekly).toEqual({ on: true, time: '08:00', weekday: 5 })
    expect(cfg.sched.daily.on).toBe(false)
    expect(cfg.gitAuto).toEqual({ on: true, minutes: 10 })
  })
  it('loadDb 读旧版 data.json 自动迁移', () => {
    writeFileSync(join(dir, 'data.json'), JSON.stringify({ frags: [], reports: [], cfg: { repos: [], auto: true, time: '18:30' }, nid: 1 }))
    const db = loadDb(join(dir, 'data.json'))
    expect(db.cfg.sched.daily.on).toBe(true)
    expect(db.cfg.auto).toBeUndefined()
  })
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run tests/unit/store.test.js`
预期：FAIL，`migrateCfg is not a function`。

- [ ] **步骤 3：实现迁移**

签名：`export function migrateCfg(cfg)`。按全局约束的默认值逐类型合并（`{ ...默认, ...已有 }`），解构剔除 `auto/time`，`gitAuto` 同法合并。`DEFAULT_DB()` 的 cfg 改为 `migrateCfg({ repos: [] })`；`loadDb` 的返回改为 `{ ...DEFAULT_DB(), ...db, cfg: migrateCfg({ repos: [], ...db.cfg }) }`。

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run tests/unit/store.test.js`
预期：PASS（含既有用例）。

- [ ] **步骤 5：Commit**

```bash
git add src/main/services/store.js tests/unit/store.test.js
git commit -m "feat(store): cfg 新增 sched/gitAuto 并迁移旧 auto/time

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### 任务 3：scheduler 多类型调度

**文件：**
- 重写：`src/main/services/scheduler.js`
- 重写：`tests/unit/scheduler.test.js`

- [ ] **步骤 1：编写失败的测试**（整文件替换）

```js
import { describe, it, expect } from 'vitest'
import { createScheduler } from '../../src/main/services/scheduler'

const cfg = (over = {}) => ({
  sched: {
    daily: { on: true, time: '18:30' },
    weekly: { on: true, time: '09:00', weekday: 1 },
    monthly: { on: true, time: '09:00', day: 1 },
    ...over
  }
})
const db = (over) => ({ frags: [], reports: [], cfg: cfg(over) })
const MON = new Date(2026, 10, 16, 9, 0) // 周一
const make = (now, calls) => createScheduler({ now: () => now, onTrigger: async (_db, _n, type) => calls.push(type) })

describe('scheduler 多类型', () => {
  it('daily 到点触发一次，同分钟不重复', async () => {
    const calls = []
    const s = make(new Date(2026, 10, 16, 18, 30), calls)
    s.tick(db()); s.tick(db())
    await new Promise((r) => setTimeout(r, 0))
    expect(calls).toEqual(['daily'])
  })
  it('weekly 仅在配置星期几到点触发', async () => {
    const calls = []
    make(MON, calls).tick(db()) // 周一 09:00 → weekly
    make(new Date(2026, 10, 17, 9, 0), calls).tick(db()) // 周二 → 不触发
    await new Promise((r) => setTimeout(r, 0))
    expect(calls).toEqual(['weekly'])
  })
  it('monthly 仅在配置日期到点触发；二月 28 日可触发', async () => {
    const calls = []
    make(new Date(2026, 10, 1, 9, 0), calls).tick(db()) // 11-01 → monthly
    make(new Date(2026, 10, 16, 9, 0), calls).tick(db()) // 16 号 → 不触发
    make(new Date(2027, 1, 28, 9, 0), calls).tick(db({ monthly: { on: true, time: '09:00', day: 28 } }))
    await new Promise((r) => setTimeout(r, 0))
    expect(calls).toEqual(['monthly', 'monthly'])
  })
  it('同一分钟多类型同时到点各自触发', async () => {
    const calls = []
    const s = make(new Date(2027, 1, 1, 9, 0), calls) // 2027-02-01 是周一且 1 号：weekly+monthly
    s.tick(db({ daily: { on: true, time: '09:00' } })) // daily 也改 09:00
    await new Promise((r) => setTimeout(r, 0))
    expect(calls.sort()).toEqual(['daily', 'monthly', 'weekly'])
  })
  it('on=false 的类型不触发；无 sched 不触发', async () => {
    const calls = []
    make(MON, calls).tick(db({ weekly: { on: false, time: '09:00', weekday: 1 } }))
    make(MON, calls).tick({ frags: [], reports: [], cfg: {} })
    await new Promise((r) => setTimeout(r, 0))
    expect(calls).toEqual([])
  })
  it('weekday/day 缺省回退 1', async () => {
    const calls = []
    make(MON, calls).tick(db({ weekly: { on: true, time: '09:00' }, monthly: { on: true, time: '09:00' } }))
    await new Promise((r) => setTimeout(r, 0))
    expect(calls).toEqual(['weekly']) // 16 号非 1 号，monthly 不触发
  })
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run tests/unit/scheduler.test.js`
预期：FAIL（旧实现只认 `cfg.auto/time`，weekly/monthly 用例失败）。

- [ ] **步骤 3：重写 scheduler**

保持签名 `createScheduler({ now = () => new Date(), onTrigger })` 返回 `{ tick(db) }`。内部 `lastFired = { daily: '', weekly: '', monthly: '' }`；tick 内对三类型循环：`s = db.cfg?.sched?.[type]`；跳过条件 `!s?.on || s.time !== hm || lastFired[type] === stamp`；weekly 追加 `n.getDay() !== (s.weekday ?? 1)` 跳过；monthly 追加 `n.getDate() !== (s.day ?? 1)` 跳过；命中则记 stamp 并 `void onTrigger(db, n, type)`。hm/stamp 算法沿用旧实现。

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run tests/unit/scheduler.test.js`
预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/main/services/scheduler.js tests/unit/scheduler.test.js
git commit -m "feat(scheduler): 支持日报/周报/月报独立定时触发

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### 任务 4：autoimport（间隔导入 + 通知去重）

**文件：**
- 创建：`src/main/services/autoimport.js`
- 创建：`tests/unit/autoimport.test.js`

- [ ] **步骤 1：编写失败的测试**

```js
import { describe, it, expect, vi } from 'vitest'
import { clampMinutes, createGitAutoImporter } from '../../src/main/services/autoimport'
import { importCommits } from '../../shared/gitimport'

const deps = (over = {}) => {
  const state = { db: { frags: [], reports: [], nid: 1, cfg: { repos: [{ n: 'r', p: 'D:\\r', on: true }], gitAuto: { on: true, minutes: 30 } } } }
  const notify = vi.fn()
  const collect = vi.fn(async () => [{ h: 'a1', t: '10:00', m: 'feat: x', r: 'r' }])
  return {
    state, notify, collect, importCommits,
    getDb: () => state.db,
    setDb: (db) => { state.db = db },
    updated: vi.fn(),
    ...over
  }
}

describe('clampMinutes', () => {
  it('越界收敛 / 非法回退 30', () => {
    expect(clampMinutes(1)).toBe(5)
    expect(clampMinutes(99999)).toBe(1440)
    expect(clampMinutes('abc')).toBe(30)
    expect(clampMinutes(30.4)).toBe(30)
  })
})
describe('createGitAutoImporter', () => {
  it('开启时首 tick 立即导入并通知 added', async () => {
    const d = deps()
    let t = new Date(2026, 10, 16, 10, 0)
    const imp = createGitAutoImporter({ now: () => t, ...d })
    imp.tick(d.state.db)
    await vi.waitFor(() => expect(d.notify).toHaveBeenCalledWith('工作报告助手', '自动导入 1 条 Git 提交'))
    expect(d.state.db.frags).toHaveLength(1)
    expect(d.updated).toHaveBeenCalled()
  })
  it('间隔内重复 tick 不再 collect；到间隔后再次 collect 但无新增不通知', async () => {
    const d = deps()
    let t = new Date(2026, 10, 16, 10, 0)
    const imp = createGitAutoImporter({ now: () => t, ...d })
    imp.tick(d.state.db)
    await vi.waitFor(() => expect(d.collect).toHaveBeenCalledTimes(1))
    t = new Date(2026, 10, 16, 10, 29)
    imp.tick(d.state.db)
    expect(d.collect).toHaveBeenCalledTimes(1)
    t = new Date(2026, 10, 16, 10, 30)
    imp.tick(d.state.db)
    await vi.waitFor(() => expect(d.collect).toHaveBeenCalledTimes(2))
    expect(d.notify).toHaveBeenCalledTimes(1) // 第二次 added=0 → 不通知
  })
  it('关闭不 collect；失败通知按仓库集合去重', async () => {
    const d = deps({ collect: vi.fn(async (_date, _repos, onProgress) => { onProgress('r', false, 'boom'); return [] }) })
    let t = new Date(2026, 10, 16, 10, 0)
    const imp = createGitAutoImporter({ now: () => t, ...d })
    d.state.db.cfg.gitAuto.on = false
    imp.tick(d.state.db)
    expect(d.collect).not.toHaveBeenCalled()
    d.state.db.cfg.gitAuto.on = true
    imp.tick(d.state.db)
    await vi.waitFor(() => expect(d.notify).toHaveBeenCalledTimes(1))
    t = new Date(2026, 10, 16, 10, 30)
    imp.tick(d.state.db)
    await vi.waitFor(() => expect(d.collect).toHaveBeenCalledTimes(2))
    expect(d.notify).toHaveBeenCalledTimes(1) // 相同失败集合不重复通知
  })
  it('无启用仓库时不 collect 不通知', async () => {
    const d = deps()
    d.state.db.cfg.repos = []
    const imp = createGitAutoImporter({ now: () => new Date(2026, 10, 16, 10, 0), ...d })
    imp.tick(d.state.db)
    await new Promise((r) => setTimeout(r, 0))
    expect(d.collect).not.toHaveBeenCalled()
    expect(d.notify).not.toHaveBeenCalled()
  })
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run tests/unit/autoimport.test.js`
预期：FAIL，模块不存在。

- [ ] **步骤 3：实现 autoimport.js**

导出：
- `clampMinutes(v)`：`Math.round(Number(v))`，有限则 `Math.min(1440, Math.max(5, n))`，否则 30。
- `createGitAutoImporter({ now = () => new Date(), getDb, setDb, updated, notify, collect, importCommits })` 返回 `{ tick(db) }`。
  tick：`g = db.cfg?.gitAuto`；`!g?.on || running` 返回；`lastRun && t - lastRun < clampMinutes(g.minutes)*60000` 返回；置 `lastRun = t; running = true`；`void job().finally(() => running = false)`。
  job（内部 async）：`today = keyOf(now())`；repos 过滤 `on !== false && r.p`；空则 return；`failed = []`；`commits = await collect(today, repos, (repo, ok) => { if (!ok) failed.push(repo) })`；`{ db: next, added } = importCommits(getDb(), commits, today)`（**现取 getDb()**）；added>0 → `setDb(next); updated(); notify('工作报告助手', '自动导入 ' + added + ' 条 Git 提交')`；`key = [...new Set(failed)].sort().join(',')`；key 非空且 `key !== lastFailKey` → `notify('工作报告助手', 'Git 自动导入失败：' + key)`；更新 `lastFailKey = key`。

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run tests/unit/autoimport.test.js`
预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add src/main/services/autoimport.js tests/unit/autoimport.test.js
git commit -m "feat(autoimport): Git 提交按间隔自动导入与通知去重

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### 任务 5：reportjob 抽取 + 主进程接线

**文件：**
- 创建：`src/main/services/reportjob.js`
- 创建：`tests/unit/reportjob.test.js`
- 修改：`src/main/index.js:37-89`（替换内联 onTrigger、新增 gitImporter、tick 双调度）

- [ ] **步骤 1：编写失败的测试**

```js
import { describe, it, expect, vi } from 'vitest'
import { runReportJob } from '../../src/main/services/reportjob'
import { importCommits } from '../../shared/gitimport'

const setup = (over = {}) => {
  const s = {
    db: { frags: [], reports: [], nid: 1, cfg: { repos: [{ n: 'r', p: 'D:\\r', on: true }] } },
    notify: vi.fn(), updated: vi.fn(), persist: vi.fn(),
    collect: vi.fn(async () => []),
    generate: vi.fn(async () => '报告正文'),
    ...over
  }
  s.getDb = () => s.db
  s.setDb = (db) => { s.db = db }
  s.run = (type, now) => runReportJob({ type, now, getDb: s.getDb, setDb: s.setDb, persist: s.persist, notify: s.notify, updated: s.updated, collect: s.collect, importCommits, generate: s.generate })
  return s
}
const MON = new Date(2026, 10, 16, 9, 0)

describe('runReportJob', () => {
  it('daily：导入当天提交后生成并覆盖保存', async () => {
    const s = setup({ collect: vi.fn(async () => [{ h: 'a1', t: '10:00', m: 'feat: x', r: 'r' }]) })
    await s.run('daily', MON)
    expect(s.collect).toHaveBeenCalledWith('2026-11-16', expect.any(Array), expect.any(Function))
    expect(s.generate).toHaveBeenCalledWith(s.db.cfg, 'daily', expect.objectContaining({ d: '2026-11-16' }), expect.any(Array))
    expect(s.db.reports).toEqual([expect.objectContaining({ type: 'daily', d: '2026-11-16', text: '报告正文' })])
    expect(s.persist).toHaveBeenCalled()
  })
  it('weekly：meta 为上一周；对周期内 ≤ 今天逐日回填 collect', async () => {
    const s = setup()
    s.db.frags = [{ id: 1, d: '2026-11-10', done: true, x: '上周事' }]
    await s.run('weekly', MON)
    expect(s.generate).toHaveBeenCalledWith(expect.any(Object), 'weekly', expect.objectContaining({ from: '2026-11-09', to: '2026-11-15', d: 'W-2026-11-09' }), expect.any(Array))
    const days = s.collect.mock.calls.map((c) => c[0])
    expect(days).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'])
  })
  it('monthly：周期含未来日期时只回填 ≤ 今天', async () => {
    const s = setup()
    s.db.frags = [{ id: 1, d: '2026-10-05', done: true, x: '上月事' }]
    await s.run('monthly', new Date(2026, 10, 1, 9, 0))
    const days = s.collect.mock.calls.map((c) => c[0])
    expect(days).toHaveLength(31) // 10-01..10-31 全 ≤ 今天
    expect(days[days.length - 1]).toBe('2026-10-31')
  })
  it('周期内无碎片 → 跳过通知，不 generate 不写报告', async () => {
    const s = setup()
    await s.run('weekly', MON)
    expect(s.generate).not.toHaveBeenCalled()
    expect(s.db.reports).toEqual([])
    expect(s.notify).toHaveBeenCalledWith('工作报告助手', expect.stringContaining('跳过周报生成'))
  })
  it('同 type+周期 已存在 → 覆盖 text/when 不新增', async () => {
    const s = setup()
    s.db.frags = [{ id: 1, d: '2026-11-16', done: true, x: '事' }]
    s.db.reports = [{ type: 'daily', d: '2026-11-16', when: 'old', text: '旧' }]
    await s.run('daily', MON)
    expect(s.db.reports).toHaveLength(1)
    expect(s.db.reports[0].text).toBe('报告正文')
  })
  it('await 期间 db 被替换 → 报告写进最新 db（不丢）', async () => {
    const s = setup()
    s.db.frags = [{ id: 1, d: '2026-11-16', done: true, x: '事' }]
    s.collect = vi.fn(async () => {
      s.db = { ...s.db, frags: [...s.db.frags, { id: 2, d: '2026-11-16', done: false, x: '并发新增' }] } // 模拟渲染端保存替换
      return []
    })
    await s.run('daily', MON)
    expect(s.db.frags).toHaveLength(2)
    expect(s.db.reports).toHaveLength(1)
  })
  it('generate 抛错 → 失败通知，不写报告', async () => {
    const s = setup({ generate: vi.fn(async () => { throw new Error('ai down') }) })
    s.db.frags = [{ id: 1, d: '2026-11-16', done: true, x: '事' }]
    await s.run('daily', MON)
    expect(s.db.reports).toEqual([])
    expect(s.notify).toHaveBeenCalledWith('工作报告助手', expect.stringContaining('执行失败'))
  })
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx vitest run tests/unit/reportjob.test.js`
预期：FAIL，模块不存在。

- [ ] **步骤 3：实现 reportjob.js**

签名：`export async function runReportJob({ type, now, getDb, setDb, persist, notify, updated, collect, importCommits, generate })`。
流程（通知文案逐字）：
1. `notify('工作报告助手', '定时' + TP[type] + '开始执行')`
2. `meta = type === 'daily' ? genMeta('daily', now) : prevMeta(type, now)`
3. `cur = getDb()`；repos 过滤同 autoimport；`days`：daily → `[keyOf(now)]`；否则从 `meta.from` 逐日（日历 +1）到 `min(meta.to, keyOf(now))`（含端点；若 from > 今天则空数组）
4. repos 非空时：`notify('工作报告助手', '正在收集 Git 提交…')`；逐日 `commits = await collect(day, repos, (repo, ok) => { if (!ok) failed.push(repo) })`；`{ db: next, added } = importCommits(cur, commits, day)`；added>0 → `setDb(next); cur = getDb(); updated()`
5. `frags = cur.frags.filter(f => f.d >= meta.from && f.d <= meta.to)`；空 → `notify('工作报告助手', meta.name + '无工作碎片，已跳过' + TP[type] + '生成')` 并 return
6. `notify('工作报告助手', '正在生成' + TP[type] + '…')`；`text = await generate(cfg, type, meta, frags)`（cfg 取步骤 3 的 cur.cfg）
7. `when = keyOf(now) + ' ' + HH:MM(now)`；`latest = getDb()`；同 type+d 覆盖否则 push；`persist(); updated()`
8. `notify('工作报告助手', meta.name + TP[type] + '已生成' + suffix)`，suffix = 去重失败仓库数 ? `'（' + n + ' 个仓库采集失败）'` : `''`
整体 try/catch：catch → `notify('工作报告助手', '定时' + TP[type] + '执行失败：' + String(e.message || e).slice(0, 100))`。

- [ ] **步骤 4：运行测试验证通过**

运行：`npx vitest run tests/unit/reportjob.test.js`
预期：PASS。

- [ ] **步骤 5：index.js 接线**

删除 37-88 行内联 onTrigger  body，替换为：
- `createScheduler({ onTrigger: (db, now, type) => runReportJob({ type, now, getDb, setDb, persist, notify: showNotification, updated: () => win?.webContents.send('db:updated'), collect: collectCommits, importCommits, generate: async (cfg, t, meta, frags) => { try { return cfg.url && cfg.keyEnc ? await streamReport(cfg, t, meta, frags, () => {}) : localReport(t, frags) } catch { return localReport(t, frags) } } }) })`
- `const gitImporter = createGitAutoImporter({ getDb, setDb, updated: () => win?.webContents.send('db:updated'), notify: showNotification, collect: collectCommits, importCommits })`
- `setInterval(() => { const db = getDb(); scheduler.tick(db); gitImporter.tick(db) }, 60_000)`
- 清理不再使用的 import（`genMeta` 若仅旧 body 用则移除）。

- [ ] **步骤 6：全量单测 + 构建 + 既有 E2E 验证接线未破坏**

运行：`npm test && npm run build && npm run test:e2e`
预期：67+ 新增单测全 PASS；构建无 error；3 个既有 E2E PASS。

- [ ] **步骤 7：Commit**

```bash
git add src/main/services/reportjob.js tests/unit/reportjob.test.js src/main/index.js
git commit -m "feat(scheduler): 抽取 reportjob 并接线周报/月报与 Git 自动导入

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### 任务 6：设置弹窗 tab 拆分 + 新字段 + E2E

**文件：**
- 修改：`src/renderer/index.html`（设置弹窗 `#ovl-set` 区块）
- 修改：`src/renderer/src/styles/main.css`（追加设置 tab 样式）
- 重写：`src/renderer/src/views/settings.js`
- 修改：`e2e/app.e2e.js`（追加用例）

- [ ] **步骤 1：编写失败的 E2E 测试**

（文件头 `node:fs` 的 import 补充 `readFileSync`；其余沿用现有 import。）

```js
test('设置 tab：定时配置往返保存 + 非法间隔报错不关闭', async () => {
  const home = mkdtempSync(join(tmpdir(), 'wrh-e2e-set-'))
  const app = await _electron.launch({ args: LAUNCH_ARGS, env: { ...process.env, WORKREPORTHELPER_HOME: home } })
  try {
    const win = await app.firstWindow()
    await win.waitForSelector('#view-today.on')
    await win.click('#btn-settings')
    await win.waitForSelector('#ovl-set.show')
    // tab 切换：默认 AI 配置 pane 可见，定时任务 pane 隐藏
    await expect(win.locator('#set-ai')).toBeVisible()
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
    expect(db.cfg.sched.weekly.weekday).toBe(1)
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
  } finally {
    await app.close()
  }
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm run build && npx playwright test -g "设置 tab"`
预期：FAIL（`.set-tabs` 不存在）。

- [ ] **步骤 3：HTML 结构**

`#ovl-set` 内 mhead 之后插入：
`<div class="set-tabs seg" role="group" aria-label="设置分类"><button class="on" data-t="ai" aria-pressed="true">AI 配置</button><button data-t="sched" aria-pressed="false">定时任务</button><button data-t="general" aria-pressed="false">通用</button></div>`
mbody 改 class `mbody set`，内含三个 pane：
- `#set-ai.set-pane.on`：现有 url / key(row2+eye) / model / btnrow 测试连接 原样迁入
- `#set-sched.set-pane`：三行 `.schedrow`（switch `#s-d-on/#s-w-on/#s-m-on` role=switch aria-checked + `.lbl.sched-name` 日报/周报/月报 + 周报 `select#s-w-day.sched-ctl`（选项 value 1..6,0 文案周一..周日）+ 月报 `select#s-m-day.sched-ctl`（空，JS 生成 1–28）+ `input[type=time]#s-d-time/#s-w-time/#s-m-time.sched-ctl`）；`p.tip` 说明「周报/月报在触发点生成上一已完结自然周/自然月的报告；周期内无碎片跳过并通知。」；`.gline`；Git 行 `.schedrow`（switch `#s-g-on` + `.lbl.sched-name` Git 自动导入 + `input[type=number]#s-g-min.sched-ctl.num min=5 max=1440 step=5 value=30` + `.lbl` 分钟）；`p.testmsg.err#s-git-err role=alert`；`p.tip` 说明「按间隔收集启用仓库的当天提交并导入（按 hash 去重）；仅有新导入时通知。」
- `#set-general.set-pane`：数据路径 field+pathrow、hkrow 热键、boot toggle 原样迁入
所有 label 补 `for`；switch 均 `type="button"`。

- [ ] **步骤 4：CSS 追加**

```css
.set-tabs{margin:12px 18px 0}
.mbody.set{display:block}
.set-pane{display:none;flex-direction:column;gap:16px}
.set-pane.on{display:flex}
.schedrow{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.sched-name{width:76px;flex:none;font-size:13px;color:var(--text)}
.sched-ctl{height:34px;padding:0 10px;border-radius:9px;border:1px solid var(--stroke2);background:var(--ink);color:var(--text);outline:none;color-scheme:dark;font-size:13px;transition:border-color var(--dur),box-shadow var(--dur)}
.sched-ctl:focus{border-color:var(--ac);box-shadow:var(--ring)}
.sched-ctl.num{width:84px}
```

- [ ] **步骤 5：重写 settings.js**

保留：openSet 的 AI 字段/eye 逻辑、s-test、s-save 的 key/dataPath/boot 逻辑、setSwitch/flipSwitch。
新增/替换：
- 模块级 `let setTab = 'ai'`；bindSettings 内 tab 按钮 onclick：切换 `.set-tabs` 的 `.on`+`aria-pressed` 与 `.set-pane` 的 `.on`。
- `#s-m-day` 选项 1–28 在 bindSettings 生成一次。
- 五个 switch onclick = flipSwitch。
- openSet：`const sc = c.sched`（store 已迁移保证存在）；setSwitch 三开关 + gitAuto；time 值回填（`sc.daily.time` 等）；`#s-w-day.value = String(sc.weekly.weekday)`；`#s-m-day.value = String(sc.monthly.day)`；`#s-g-min.value = String(c.gitAuto.minutes)`；`#s-git-err.textContent = ''`；应用 setTab。
- s-save：先校验 `const n = Number($('s-g-min').value)`；`!Number.isInteger(n) || n < 5 || n > 1440` → `#s-git-err.textContent = '间隔需为 5–1440 之间的整数分钟'` 并 return（不关闭）。通过后写 `c.sched = { daily: { on: sw('s-d-on'), time: $('s-d-time').value || '18:30' }, weekly: { on: sw('s-w-on'), weekday: +$('s-w-day').value, time: $('s-w-time').value || '09:00' }, monthly: { on: sw('s-m-on'), day: +$('s-m-day').value, time: $('s-m-time').value || '09:00' } }`、`c.gitAuto = { on: sw('s-g-on'), minutes: n }`；删除旧 `c.auto/c.time` 读写；其余沿用。
- `sw = (id) => $(id).classList.contains('on')` 小 helper。

- [ ] **步骤 6：运行验证**

运行：`npm run build && npx playwright test -g "设置 tab" && npm test && npm run test:e2e`
预期：新用例 PASS；全部单测 PASS；4 个 E2E PASS。
另：启动应用截图设置三 tab 目视检查（临时脚本，用完删除）。

- [ ] **步骤 7：Commit**

```bash
git add src/renderer/index.html src/renderer/src/styles/main.css src/renderer/src/views/settings.js e2e/app.e2e.js
git commit -m "feat(settings): 设置拆分三 tab 并支持周报/月报定时与 Git 自动导入配置

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```
