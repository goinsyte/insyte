/*
 * The export's file formats (M17 step 5): a table as CSV and as JSON, and the files together as one ZIP. The ZIP is
 * written by hand (PKWARE APPNOTE 6.3: local headers, the central directory, its end record), each entry deflated
 * with the platform's `CompressionStream("deflate-raw")`, which Workers and every current runtime have. No ZIP64: an
 * entry or the archive past 4 GB is refused, which no workspace comes near in one export.
 */

/** A row as `to_jsonb` gives it: column names as the table has them. */
export type Row = Readonly<Record<string, unknown>>

/** Columns that hold a secret or its hash: never exported, whatever the table. */
const SECRET = /(_hash$|sealed|^reply_token$)/

/** The row without its secrets. */
export const withoutSecrets = (row: Row): Row =>
  Object.fromEntries(Object.entries(row).filter(([column]) => !SECRET.test(column)))

const cell = (value: unknown): string => {
  if (value === null || value === undefined) return ""
  const text = typeof value === "object" ? JSON.stringify(value) : String(value)
  return /[",\r\n]/.test(text) || /^\s|\s$/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text
}

/** The rows as CSV (RFC 4180, CRLF), their columns in the order the first row that has each names it. */
export const toCsv = (rows: ReadonlyArray<Row>): string => {
  const columns: Array<string> = []
  const seen = new Set<string>()
  for (const row of rows) {
    for (const column of Object.keys(row)) {
      if (!seen.has(column)) {
        seen.add(column)
        columns.push(column)
      }
    }
  }
  const lines = [columns.map(cell).join(","), ...rows.map((row) => columns.map((c) => cell(row[c])).join(","))]
  return `${lines.join("\r\n")}\r\n`
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

const deflate = async (bytes: Uint8Array): Promise<Uint8Array> => {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream("deflate-raw"))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** MS-DOS time and date, as a ZIP entry carries them. */
const dosTime = (at: Date) => ({
  time: (at.getUTCHours() << 11) | (at.getUTCMinutes() << 5) | Math.floor(at.getUTCSeconds() / 2),
  date: ((at.getUTCFullYear() - 1980) << 9) | ((at.getUTCMonth() + 1) << 5) | at.getUTCDate()
})

export interface ZipEntry {
  readonly name: string
  readonly bytes: Uint8Array
}

const LIMIT = 0xffffffff

/** The entries as one ZIP archive, each deflated, names in UTF-8 (general purpose flag bit 11). */
export const zip = async (entries: ReadonlyArray<ZipEntry>, at: Date = new Date()): Promise<Uint8Array> => {
  const encoder = new TextEncoder()
  const { time, date } = dosTime(at)
  const locals: Array<Uint8Array> = []
  const centrals: Array<Uint8Array> = []
  let offset = 0
  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const packed = await deflate(entry.bytes)
    if (entry.bytes.length >= LIMIT || packed.length >= LIMIT || offset >= LIMIT) {
      throw new Error(`zip: ${entry.name} is past what an archive without ZIP64 holds`)
    }
    const crc = crc32(entry.bytes)
    const local = new Uint8Array(30 + name.length + packed.length)
    const l = new DataView(local.buffer)
    l.setUint32(0, 0x04034b50, true)
    l.setUint16(4, 20, true)
    l.setUint16(6, 0x0800, true)
    l.setUint16(8, 8, true)
    l.setUint16(10, time, true)
    l.setUint16(12, date, true)
    l.setUint32(14, crc, true)
    l.setUint32(18, packed.length, true)
    l.setUint32(22, entry.bytes.length, true)
    l.setUint16(26, name.length, true)
    local.set(name, 30)
    local.set(packed, 30 + name.length)
    const central = new Uint8Array(46 + name.length)
    const c = new DataView(central.buffer)
    c.setUint32(0, 0x02014b50, true)
    c.setUint16(4, 20, true)
    c.setUint16(6, 20, true)
    c.setUint16(8, 0x0800, true)
    c.setUint16(10, 8, true)
    c.setUint16(12, time, true)
    c.setUint16(14, date, true)
    c.setUint32(16, crc, true)
    c.setUint32(20, packed.length, true)
    c.setUint32(24, entry.bytes.length, true)
    c.setUint16(28, name.length, true)
    c.setUint32(42, offset, true)
    central.set(name, 46)
    locals.push(local)
    centrals.push(central)
    offset += local.length
  }
  const directory = centrals.reduce((n, c) => n + c.length, 0)
  const end = new Uint8Array(22)
  const e = new DataView(end.buffer)
  e.setUint32(0, 0x06054b50, true)
  e.setUint16(8, entries.length, true)
  e.setUint16(10, entries.length, true)
  e.setUint32(12, directory, true)
  e.setUint32(16, offset, true)
  const out = new Uint8Array(offset + directory + end.length)
  let at2 = 0
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at2)
    at2 += part.length
  }
  return out
}

/** The entries of a ZIP this module wrote, inflated: for the tests, and to read an archive back. */
export const unzip = async (archive: Uint8Array): Promise<ReadonlyArray<ZipEntry>> => {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength)
  const endAt = archive.length - 22
  if (view.getUint32(endAt, true) !== 0x06054b50) throw new Error("unzip: no end record")
  const count = view.getUint16(endAt + 10, true)
  let at = view.getUint32(endAt + 16, true)
  const decoder = new TextDecoder()
  const entries: Array<ZipEntry> = []
  for (let i = 0; i < count; i++) {
    const packedSize = view.getUint32(at + 20, true)
    const nameLength = view.getUint16(at + 28, true)
    const extra = view.getUint16(at + 30, true)
    const comment = view.getUint16(at + 32, true)
    const offset = view.getUint32(at + 42, true)
    const name = decoder.decode(archive.subarray(at + 46, at + 46 + nameLength))
    const start = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true)
    const packed = archive.subarray(start, start + packedSize)
    const stream = new Blob([packed as Uint8Array<ArrayBuffer>]).stream().pipeThrough(
      new DecompressionStream("deflate-raw")
    )
    entries.push({ name, bytes: new Uint8Array(await new Response(stream).arrayBuffer()) })
    at += 46 + nameLength + extra + comment
  }
  return entries
}
