import { describe, it, expect } from 'vitest'
import { readFileSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { variantForSize, deriveVariant, buildIco } from '../../scripts/generate-icons.mjs'

const ROOT = join(__dirname, '..', '..')

describe('resources/icon.svg（权威源）', () => {
  const svg = () => readFileSync(join(ROOT, 'resources', 'icon.svg'), 'utf8')

  it('包含折线与数据点的派生标记', () => {
    const s = svg()
    expect(s).toContain('id="chart"')
    expect(s).toContain('id="dot"')
  })

  it('包含定稿几何与配色参数', () => {
    const s = svg()
    expect(s).toContain('viewBox="0 0 48 48"')
    expect(s).toContain('#4D9BF5')
    expect(s).toContain('#3D6DE8')
    expect(s).toContain('d="M16 31l6-7 5 4 7-9"')
  })

  it('折线描边宽度可被派生正则命中（id 在 stroke-width 之前）', () => {
    const s = svg()
    expect(s).toMatch(/<path[^>]*id="chart"[^>]*stroke-width="[^"]*"/)
  })
})

describe('variantForSize（尺寸→变体规则）', () => {
  it('16px 及以下：描边 5、去数据点', () => {
    expect(variantForSize(16)).toEqual({ stroke: '5', keepDot: false })
  })
  it('17–32px：描边 4.2、保留数据点', () => {
    expect(variantForSize(17)).toEqual({ stroke: '4.2', keepDot: true })
    expect(variantForSize(24)).toEqual({ stroke: '4.2', keepDot: true })
    expect(variantForSize(32)).toEqual({ stroke: '4.2', keepDot: true })
  })
  it('33px 以上：描边 3.5、保留数据点', () => {
    expect(variantForSize(33)).toEqual({ stroke: '3.5', keepDot: true })
    expect(variantForSize(48)).toEqual({ stroke: '3.5', keepDot: true })
    expect(variantForSize(256)).toEqual({ stroke: '3.5', keepDot: true })
  })
})

describe('deriveVariant（从权威源派生小尺寸 SVG）', () => {
  const base = readFileSync(join(ROOT, 'resources', 'icon.svg'), 'utf8')

  it('256px 原样返回（权威源即完整版）', () => {
    expect(deriveVariant(base, 256)).toBe(base)
  })
  it('32px 加粗描边到 4.2，保留数据点', () => {
    const out = deriveVariant(base, 32)
    expect(out).toContain('stroke-width="4.2"')
    expect(out).toContain('id="dot"')
    expect(out).not.toContain('stroke-width="3.5"')
  })
  it('16px 描边 5 且移除整个数据点 circle', () => {
    const out = deriveVariant(base, 16)
    expect(out).toContain('stroke-width="5"')
    expect(out).not.toContain('id="dot"')
    expect(out).not.toMatch(/<circle/)
  })
  it('16px 派生结果与权威源不同（派生真实发生）', () => {
    expect(deriveVariant(base, 16)).not.toBe(base)
  })
})

describe('deriveVariant 失配保护（防静默退化）', () => {
  it('chart 属性顺序被重排时抛错', () => {
    const reordered = '<svg><path stroke-width="3.5" id="chart" d="M16 31"/></svg>'
    expect(() => deriveVariant(reordered, 32)).toThrow(/chart/)
  })
  it('dot 非自闭合写法导致移除失败时抛错', () => {
    const paired = '<svg><path id="chart" stroke-width="3.5"/><circle id="dot" cx="34"></circle></svg>'
    expect(() => deriveVariant(paired, 16)).toThrow(/dot/)
  })
})

describe('CLI 入口守卫', () => {
  it('导入模块不触发生成写盘（仅 CLI 直跑才写）', () => {
    const target = join(ROOT, 'resources', 'icon.png')
    const before = statSync(target).mtimeMs
    const modUrl = pathToFileURL(join(ROOT, 'scripts', 'generate-icons.mjs')).href
    execFileSync(
      process.execPath,
      ['--input-type=module', '-e', `await import(${JSON.stringify(modUrl)})`],
      { cwd: ROOT }
    )
    expect(statSync(target).mtimeMs).toBe(before)
  })
})

describe('buildIco（PNG 直嵌 ICO 容器）', () => {
  const pngOf = (size, byte) => Buffer.alloc(size, byte) // 用 size 字节的假 PNG 代表真 PNG

  it('头部：reserved=0、type=1、条目数=3', () => {
    const buf = buildIco([
      { size: 16, png: pngOf(10, 1) },
      { size: 32, png: pngOf(20, 2) },
      { size: 256, png: pngOf(30, 3) }
    ])
    expect(buf.readUInt16LE(0)).toBe(0)
    expect(buf.readUInt16LE(2)).toBe(1)
    expect(buf.readUInt16LE(4)).toBe(3)
  })

  it('目录条目：宽高、位深、数据长度与偏移依次排列', () => {
    const buf = buildIco([
      { size: 16, png: pngOf(10, 1) },
      { size: 256, png: pngOf(30, 3) }
    ])
    const e0 = 6
    expect(buf.readUInt8(e0)).toBe(16)            // width
    expect(buf.readUInt8(e0 + 1)).toBe(16)        // height
    expect(buf.readUInt16LE(e0 + 4)).toBe(1)      // planes
    expect(buf.readUInt16LE(e0 + 6)).toBe(32)     // bpp
    expect(buf.readUInt32LE(e0 + 8)).toBe(10)     // 数据长度
    expect(buf.readUInt32LE(e0 + 12)).toBe(6 + 16 * 2) // 第一条数据偏移

    const e1 = e0 + 16
    expect(buf.readUInt8(e1)).toBe(0)             // 256 记作 0
    expect(buf.readUInt8(e1 + 1)).toBe(0)
    expect(buf.readUInt32LE(e1 + 8)).toBe(30)
    expect(buf.readUInt32LE(e1 + 12)).toBe(6 + 16 * 2 + 10)
  })

  it('总长度 = 6 + 16n + Σpng，且 PNG 数据原样拼接', () => {
    const a = pngOf(10, 1); const b = pngOf(20, 2)
    const buf = buildIco([{ size: 16, png: a }, { size: 32, png: b }])
    expect(buf.length).toBe(6 + 16 * 2 + 10 + 20)
    expect(buf.subarray(6 + 32, 6 + 32 + 10)).toEqual(a)
  })
})