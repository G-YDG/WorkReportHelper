// node: 内置 import 本任务暂未全部用到，任务 4 的 CLI 会使用；提前声明避免任务 4 重复贴 import
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import { PNG } from 'pngjs'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..')

// 尺寸→变体规则（见设计文档「尺寸适配规则」）
export function variantForSize(size) {
  if (size <= 16) return { stroke: '5', keepDot: false }
  if (size <= 32) return { stroke: '4.2', keepDot: true }
  return { stroke: '3.5', keepDot: true }
}

// 按 size 派生变体 SVG：替换 chart 描边宽度，必要时移除 dot circle。
// 纯函数：不修改传入字符串。失配即抛错，防止权威源形态变化后静默产出错误变体。
export function deriveVariant(svg, size) {
  const { stroke, keepDot } = variantForSize(size)
  const chartRe = /(<path[^>]*id="chart"[^>]*stroke-width=")[^"]*"/
  if (!chartRe.test(svg)) {
    throw new Error('权威源缺少 id="chart" 且 stroke-width 在后的 path，无法派生描边')
  }
  let out = svg.replace(chartRe, `$1${stroke}"`)
  if (!keepDot) {
    out = out.replace(/<circle[^>]*id="dot"[^>]*\/>\s*/, '')
    if (out.includes('id="dot"')) {
      throw new Error('权威源 dot circle 非自闭合写法，无法移除')
    }
  }
  return out
}

// 将 PNG 缓冲打包为 ICO 容器（PNG 直嵌格式，Windows Vista+ 支持）。
// entries: [{ size: number, png: Buffer }]
export function buildIco(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(entries.length, 4)

  const dirSize = 16 * entries.length
  let offset = 6 + dirSize
  const dirs = []
  const blobs = []
  for (const { size, png } of entries) {
    const d = Buffer.alloc(16)
    d.writeUInt8(size >= 256 ? 0 : size, 0) // 256 记作 0
    d.writeUInt8(size >= 256 ? 0 : size, 1)
    d.writeUInt8(0, 2) // 调色板色数（PNG 直嵌不用）
    d.writeUInt8(0, 3) // reserved
    d.writeUInt16LE(1, 4) // planes
    d.writeUInt16LE(32, 6) // bpp
    d.writeUInt32LE(png.length, 8)
    d.writeUInt32LE(offset, 12)
    dirs.push(d)
    blobs.push(png)
    offset += png.length
  }
  return Buffer.concat([header, ...dirs, ...blobs])
}

export const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
const PNG_PATH = join(ROOT, 'resources', 'icon.png')
const ICO_PATH = join(ROOT, 'resources', 'icon.ico')
const SVG_PATH = join(ROOT, 'resources', 'icon.svg')

// SVG → 指定宽度的 PNG 缓冲
export function renderPng(svg, size) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } })
  return Buffer.from(resvg.render().asPng())
}

// 校验 PNG 尺寸（IHDR），不匹配则抛错
function assertPngSize(label, png, size) {
  const parsed = PNG.sync.read(png)
  if (parsed.width !== size || parsed.height !== size) {
    throw new Error(
      `${label}: 期望 ${size}x${size}，实际 ${parsed.width}x${parsed.height}`
    )
  }
}

function main() {
  const svg = readFileSync(SVG_PATH, 'utf8')

  // 托盘 / extraResources 用的 256px PNG（完整版）
  const png256 = renderPng(svg, 256)
  assertPngSize('resources/icon.png', png256, 256)

  // 多尺寸 ICO：按尺寸规则派生变体
  const entries = ICO_SIZES.map((size) => {
    const png = renderPng(deriveVariant(svg, size), size)
    assertPngSize(`ico ${size}px`, png, size)
    return { size, png }
  })

  // 全部校验完成后统一写盘，避免中间状态不一致
  writeFileSync(PNG_PATH, png256)
  writeFileSync(ICO_PATH, buildIco(entries))
  console.log(
    `已生成 ${PNG_PATH} (256px) 与 ${ICO_PATH} (${ICO_SIZES.join('/')})`
  )
}

// CLI 入口守卫：仅直接运行（node scripts/generate-icons.mjs / npm run icons）才生成，
// 被测试等导入时不触发写盘副作用
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}