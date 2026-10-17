// tests/unit/store.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadDb, saveDb, encryptKey, decryptKey } from '../../src/main/services/store'

let dir
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'wrh-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('store', () => {
  it('首次 load 返回空库默认值', () => {
    const db = loadDb(join(dir, 'data.json'))
    expect(db.frags).toEqual([])
    expect(db.reports).toEqual([])
    expect(db.cfg.repos).toEqual([])
    expect(db.nid).toBe(1)
  })
  it('save 后 load 往返一致', () => {
    const p = join(dir, 'data.json')
    saveDb(p, { frags: [{ id: 1 }], reports: [], cfg: {}, nid: 2 })
    expect(loadDb(p).frags[0].id).toBe(1)
  })
  it('主文件损坏时回退 .bak', () => {
    const p = join(dir, 'data.json')
    saveDb(p, { frags: [{ id: 7 }], reports: [], cfg: {}, nid: 8 })
    writeFileSync(p, '{broken json')
    expect(loadDb(p).frags[0].id).toBe(7)
  })
  it('损坏的旧库会被下次 save 修复，且损坏内容先备份为 .corrupt', () => {
    const p = join(dir, 'data.json')
    writeFileSync(p, 'garbage')
    const db = loadDb(p)
    expect(db.frags).toEqual([])
    saveDb(p, db)
    expect(existsSync(p + '.corrupt')).toBe(true)
    expect(loadDb(p).frags).toEqual([])
  })
  it('连续 save 两次后主文件为新内容，.bak 为旧内容且均可解析', () => {
    const p = join(dir, 'data.json')
    saveDb(p, { frags: [{ id: 1 }], reports: [], cfg: {}, nid: 2 })
    saveDb(p, { frags: [{ id: 2 }], reports: [], cfg: {}, nid: 3 })
    expect(JSON.parse(readFileSync(p, 'utf-8')).frags[0].id).toBe(2)
    expect(JSON.parse(readFileSync(p + '.bak', 'utf-8')).frags[0].id).toBe(1)
  })
  it('父目录不存在时自动创建（ENOENT 回归测试）', () => {
    const p = join(dir, 'not-exist', 'sub', 'data.json')
    saveDb(p, { frags: [{ id: 9 }], reports: [], cfg: {}, nid: 10 })
    expect(loadDb(p).frags[0].id).toBe(9)
  })
  it('主文件与 .bak 同时损坏时返回默认值，且两文件内容未被改动', () => {
    const p = join(dir, 'data.json')
    writeFileSync(p, 'corrupted-main')
    writeFileSync(p + '.bak', 'corrupted-bak')
    const db = loadDb(p)
    expect(db.frags).toEqual([])
    expect(db.reports).toEqual([])
    expect(db.cfg.repos).toEqual([])
    expect(db.nid).toBe(1)
    expect(readFileSync(p, 'utf-8')).toBe('corrupted-main')
    expect(readFileSync(p + '.bak', 'utf-8')).toBe('corrupted-bak')
  })
  it('DPAPI 加解密往返（仅 Windows）', () => {
    const enc = encryptKey('sk-test-123')
    expect(enc).not.toBe('sk-test-123')
    expect(decryptKey(enc)).toBe('sk-test-123')
  })
})
