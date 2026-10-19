import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..', '..')

describe('resources/icon.svg（权威源）', () => {
  const svg = () => readFileSync(join(ROOT, 'resources', 'icon.svg'), 'utf8')

  it('包含对勾与标题带的派生标记', () => {
    const s = svg()
    expect(s).toContain('id="check"')
    expect(s).toContain('id="band"')
  })

  it('包含定稿几何参数', () => {
    const s = svg()
    expect(s).toContain('viewBox="0 0 48 48"')
    expect(s).toContain('#5B7BE8')
    expect(s).toContain('#8A6FE8')
    expect(s).toContain('#DDE3FA')
    expect(s).toContain('d="M15.5 27l7.5 7.5L37 18"')
  })

  it('对勾描边宽度可被派生正则命中（id 在 stroke-width 之前）', () => {
    const s = svg()
    expect(s).toMatch(/<path[^>]*id="check"[^>]*stroke-width="[^"]*"/)
  })
})

import { variantForSize, deriveVariant } from '../../scripts/generate-icons.mjs'

describe('variantForSize（尺寸→变体规则）', () => {
  it('16px 及以下：描边 6、去标题带', () => {
    expect(variantForSize(16)).toEqual({ stroke: '6', keepBand: false })
  })
  it('17–32px：描边 5.2、保留标题带', () => {
    expect(variantForSize(24)).toEqual({ stroke: '5.2', keepBand: true })
    expect(variantForSize(32)).toEqual({ stroke: '5.2', keepBand: true })
  })
  it('33px 以上：描边 4.6、保留标题带', () => {
    expect(variantForSize(48)).toEqual({ stroke: '4.6', keepBand: true })
    expect(variantForSize(256)).toEqual({ stroke: '4.6', keepBand: true })
  })
})

describe('deriveVariant（从权威源派生小尺寸 SVG）', () => {
  const base = readFileSync(join(ROOT, 'resources', 'icon.svg'), 'utf8')

  it('256px 原样返回（描边 4.6、含 band）', () => {
    const out = deriveVariant(base, 256)
    expect(out).toContain('stroke-width="4.6"')
    expect(out).toContain('id="band"')
  })
  it('32px 加粗描边到 5.2，保留 band', () => {
    const out = deriveVariant(base, 32)
    expect(out).toContain('stroke-width="5.2"')
    expect(out).toContain('id="band"')
    expect(out).not.toContain('stroke-width="4.6"')
  })
  it('16px 描边 6 且移除整个 band rect', () => {
    const out = deriveVariant(base, 16)
    expect(out).toContain('stroke-width="6"')
    expect(out).not.toContain('id="band"')
    expect(out).not.toMatch(/<rect[^>]*DDE3FA/)
  })
  it('不修改传入的源字符串（不可变）', () => {
    const before = base
    deriveVariant(base, 16)
    expect(base).toBe(before)
  })
})

import { buildIco } from '../../scripts/generate-icons.mjs'

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
