import { useMemo } from "react"
import { saveFile } from "./acts.ts"
import { cx } from "./cx.ts"

/*
 * A QR code for a link or a label's code, drawn as one SVG path so it stays sharp at any size and
 * downloads as a file an affiliate can drop into a story or a customer can show at the counter. The current demo uses `qrcode-generator`,
 * which `apps/design` cannot resolve, so this is a small encoder of its own: byte mode, error
 * correction level M, versions 1 to 10 (up to 213 characters, enough for a link with its UTM tags),
 * mask 0. The structure follows the QR specification (ISO/IEC 18004) as Project Nayuki's reference
 * encoder lays it out.
 */

const ECC_PER_BLOCK = [10, 16, 26, 18, 24, 16, 18, 22, 22, 26]
const BLOCKS = [1, 1, 1, 2, 2, 4, 4, 4, 5, 5]

function rawModules(ver: number) {
  let result = (16 * ver + 128) * ver + 64
  if (ver >= 2) {
    const align = Math.floor(ver / 7) + 2
    result -= (25 * align - 10) * align - 55
    if (ver >= 7) result -= 36
  }
  return result
}

const dataCodewords = (ver: number) =>
  Math.floor(rawModules(ver) / 8) - (ECC_PER_BLOCK[ver - 1] ?? 0) * (BLOCKS[ver - 1] ?? 1)

function mul(x: number, y: number) {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z & 0xff
}

function divisor(degree: number) {
  const result = Array.from({ length: degree }, () => 0)
  result[degree - 1] = 1
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = mul(result[j] ?? 0, root)
      if (j + 1 < degree) result[j] = (result[j] ?? 0) ^ (result[j + 1] ?? 0)
    }
    root = mul(root, 0x02)
  }
  return result
}

function remainder(data: ReadonlyArray<number>, div: ReadonlyArray<number>) {
  const result = div.map(() => 0)
  for (const b of data) {
    const factor = b ^ (result.shift() ?? 0)
    result.push(0)
    for (let i = 0; i < div.length; i++) result[i] = (result[i] ?? 0) ^ mul(div[i] ?? 0, factor)
  }
  return result
}

const bit = (v: number, i: number) => ((v >>> i) & 1) !== 0

function alignPositions(ver: number, size: number) {
  if (ver === 1) return []
  const count = Math.floor(ver / 7) + 2
  const step = Math.floor((ver * 8 + count * 3 + 5) / (count * 4 - 4)) * 2
  const result = [6]
  for (let pos = size - 7; result.length < count; pos -= step) result.splice(1, 0, pos)
  return result
}

/** The modules of a QR code for `text`, row by row (`true` is dark). */
export function qrModules(text: string): ReadonlyArray<ReadonlyArray<boolean>> {
  const bytes = [...new TextEncoder().encode(text)]
  let ver = 1
  while (ver < 10 && 4 + (ver < 10 ? 8 : 16) + bytes.length * 8 > dataCodewords(ver) * 8) ver++
  const capacity = dataCodewords(ver) * 8
  const bits: Array<number> = []
  const put = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1)
  }
  put(0b0100, 4)
  put(Math.min(bytes.length, 255), ver < 10 ? 8 : 16)
  for (const b of bytes.slice(0, Math.floor((capacity - 20) / 8))) put(b, 8)
  put(0, Math.min(4, capacity - bits.length))
  put(0, (8 - (bits.length % 8)) % 8)
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) put(pad, 8)
  const data: Array<number> = []
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((n, b) => (n << 1) | b, 0))

  // Split into blocks, add each block's error correction, interleave.
  const blocks = BLOCKS[ver - 1] ?? 1
  const ecLen = ECC_PER_BLOCK[ver - 1] ?? 10
  const raw = Math.floor(rawModules(ver) / 8)
  const shortBlocks = blocks - (raw % blocks)
  const shortLen = Math.floor(raw / blocks)
  const div = divisor(ecLen)
  const parts: Array<Array<number>> = []
  for (let i = 0, k = 0; i < blocks; i++) {
    const length = shortLen - ecLen + (i < shortBlocks ? 0 : 1)
    const chunk = data.slice(k, k + length)
    k += length
    const ecc = remainder(chunk, div)
    if (i < shortBlocks) chunk.push(0)
    parts.push([...chunk, ...ecc])
  }
  const codewords: Array<number> = []
  for (let i = 0; i < (parts[0]?.length ?? 0); i++) {
    for (const [j, part] of parts.entries()) {
      if (i !== shortLen - ecLen || j >= shortBlocks) codewords.push(part[i] ?? 0)
    }
  }

  const size = ver * 4 + 17
  const grid = Array.from({ length: size }, () => Array.from({ length: size }, () => false))
  const fixed = Array.from({ length: size }, () => Array.from({ length: size }, () => false))
  const set = (x: number, y: number, dark: boolean) => {
    const row = grid[y]
    const lock = fixed[y]
    if (row === undefined || lock === undefined || x < 0 || x >= size) return
    row[x] = dark
    lock[x] = true
  }
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0)
    set(i, 6, i % 2 === 0)
  }
  for (const [fx, fy] of [[3, 3], [size - 4, 3], [3, size - 4]] as const) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy))
        const x = fx + dx
        const y = fy + dy
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, dist !== 2 && dist !== 4)
      }
    }
  }
  const align = alignPositions(ver, size)
  for (const [i, ax] of align.entries()) {
    for (const [j, ay] of align.entries()) {
      const corner = (i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)
      if (corner) continue
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
      }
    }
  }
  // Format bits: level M (0), mask 0.
  const format = (() => {
    const value = (0 << 3) | 0
    let rem = value
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
    return ((value << 10) | rem) ^ 0x5412
  })()
  for (let i = 0; i <= 5; i++) set(8, i, bit(format, i))
  set(8, 7, bit(format, 6))
  set(8, 8, bit(format, 7))
  set(7, 8, bit(format, 8))
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(format, i))
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(format, i))
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(format, i))
  set(8, size - 8, true)
  if (ver >= 7) {
    let rem = ver
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
    const v = (ver << 12) | rem
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3)
      const b = Math.floor(i / 3)
      set(a, b, bit(v, i))
      set(b, a, bit(v, i))
    }
  }

  // The codewords in the zigzag, then mask 0 over everything that is not a pattern.
  let i = 0
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j
        const upward = ((right + 1) & 2) === 0
        const y = upward ? size - 1 - vert : vert
        const row = grid[y]
        if (row === undefined || fixed[y]?.[x] === true) continue
        if (i < codewords.length * 8) {
          row[x] = bit(codewords[i >>> 3] ?? 0, 7 - (i & 7))
          i++
        }
        if ((x + y) % 2 === 0) row[x] = !row[x]
      }
    }
  }
  return grid
}

function pathOf(grid: ReadonlyArray<ReadonlyArray<boolean>>) {
  let d = ""
  for (const [y, row] of grid.entries()) {
    for (const [x, dark] of row.entries()) if (dark) d += `M${x} ${y}h1v1h-1z`
  }
  return d
}

/** The code on a light tile, in the ink of the page. */
export function QrCode({ text, size = 160, label, className }: {
  readonly text: string
  readonly size?: number
  /** What the code is for, read aloud; by default "QR-code voor" and the text. */
  readonly label?: string
  readonly className?: string
}) {
  const { n, d } = useMemo(() => {
    const grid = qrModules(text)
    return { n: grid.length, d: pathOf(grid) }
  }, [text])
  return (
    <svg
      viewBox={`-2 -2 ${n + 4} ${n + 4}`}
      width={size}
      height={size}
      role="img"
      aria-label={label ?? `QR-code voor ${text}`}
      className={cx("shrink-0 rounded-md bg-canvas text-ink ring-1 ring-line", className)}
      shapeRendering="crispEdges"
    >
      <path d={d} fill="currentColor" />
    </svg>
  )
}

/** The code as a file: black on white, whatever the page's theme, so it prints and scans anywhere. */
export function downloadQr(text: string, name: string) {
  const grid = qrModules(text)
  const n = grid.length
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ${n + 4} ${
    n + 4
  }" width="1024" height="1024" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${n + 4}" height="${
    n + 4
  }" fill="white"/><path d="${pathOf(grid)}" fill="black"/></svg>`
  saveFile(`qr-${name}.svg`, svg, "image/svg+xml")
}
