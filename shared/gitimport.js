// shared/gitimport.js — Git 提交导入碎片的纯逻辑（渲染端与主进程定时任务共用）
// 不可变：返回新 db，不修改入参

export const importedHashes = (db) => new Set(db.frags.filter((f) => f.h).map((f) => f.h))

// 导入提交为「已完成」碎片（按 commit hash 去重）；返回 { db, added }
export function importCommits(db, commits, d) {
  const imp = importedHashes(db)
  const fresh = (commits || []).filter((c) => c.h && !imp.has(c.h))
  let nid = db.nid
  const newFrags = fresh.map((c) => ({ id: nid++, d, t: c.t, x: c.m, done: true, h: c.h, r: c.r }))
  return { db: { ...db, nid, frags: [...db.frags, ...newFrags] }, added: newFrags.length }
}
