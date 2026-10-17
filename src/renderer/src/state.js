// src/renderer/src/state.js — 全局状态与碎片 CRUD（唯一写入口，均即时持久化）
import { keyOf } from '../../../shared/periods'

export const state = { db: null, view: 'today', selDay: null, selRep: null }

export async function initState() {
  state.db = await window.api.store.load()
  state.selDay = keyOf(new Date())
  return state.db
}
export const persist = () => window.api.store.save(state.db).catch((e) => console.error('保存失败', e))
export const fragOfDay = (d) => state.db.frags.filter((f) => f.d === d)
export function addFrag(d, t, x, done, extra = {}) {
  const f = { id: state.db.nid++, d, t, x, done: !!done, ...extra }
  state.db.frags.push(f)
  persist()
  return f
}
export const toggleFrag = (id) => {
  const f = state.db.frags.find((x) => x.id === id)
  f.done = !f.done
  persist()
}
export const editFrag = (id, x) => {
  const f = state.db.frags.find((x2) => x2.id === id)
  f.x = x
  persist()
}
export const delFrag = (id) => {
  state.db.frags = state.db.frags.filter((x) => x.id !== id)
  persist()
}
