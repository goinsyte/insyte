/*
 * The export's file formats (M17 step 5): a table as CSV and as JSON, and the files together as one ZIP. The ZIP is
 * written by hand (PKWARE APPNOTE 6.3: local headers, the central directory, its end record), each entry deflated
 * with the platform's `CompressionStream("deflate-raw")`, which Workers and every current runtime have. It is written
 * an entry at a time (`zipEntry`, then `zipEnd` over the entries' directory records), so an archive of any number of
 * pages never sits in memory whole. No ZIP64: an entry or the archive past 4 GB is refused, which no workspace comes
 * near in one export.
 */

/** A row as `to_jsonb` gives it: column names as the table has them. */
export type Row = Readonly<Record<string, unknown>>

/** Keys that hold a secret or its hash: never exported, whatever the table and however deep in a jsonb value. */
const SECRET = /(_hash$|^hash$|sealed|^reply_token$|^secret$)/i

const strip = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(strip)
  if (value === null || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([key]) => !SECRET.test(key)).map((
      [key, inner]
    ) => [key, strip(inner)])
  )
}

/**
 * The row without its secrets: a column so named, and a key so named inside a jsonb value (a webhook endpoint's
 * `headers[].sealed`, an invitation's `previous.token_hash`).
 */
export const withoutSecrets = (row: Row): Row => strip(row) as Row

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

/** What the central directory says about an entry already written: small, so a run can carry it between steps. */
export interface ZipRecord {
  readonly name: string
  readonly crc: number
  readonly packed: number
  readonly size: number
  readonly offset: number
}

const LIMIT = 0xffffffff

/** One entry, deflated, as its local header and data, to be written at `offset`; and its directory record. */
export const zipEntry = async (
  entry: ZipEntry,
  offset: number,
  at: Date
): Promise<{ readonly bytes: Uint8Array; readonly record: ZipRecord }> => {
  const name = new TextEncoder().encode(entry.name)
  const packed = await deflate(entry.bytes)
  if (entry.bytes.length >= LIMIT || packed.length >= LIMIT || offset + 30 + name.length + packed.length >= LIMIT) {
    throw new Error(`zip: ${entry.name} is past what an archive without ZIP64 holds`)
  }
  const crc = crc32(entry.bytes)
  const { time, date } = dosTime(at)
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
  return { bytes: local, record: { name: entry.name, crc, packed: packed.length, size: entry.bytes.length, offset } }
}

/** The central directory and its end record, for entries written up to `offset`. */
export const zipEnd = (records: ReadonlyArray<ZipRecord>, offset: number, at: Date): Uint8Array => {
  if (records.length > 0xffff) throw new Error("zip: more entries than an archive without ZIP64 holds")
  const encoder = new TextEncoder()
  const { time, date } = dosTime(at)
  const centrals = records.map((r) => {
    const name = encoder.encode(r.name)
    const central = new Uint8Array(46 + name.length)
    const c = new DataView(central.buffer)
    c.setUint32(0, 0x02014b50, true)
    c.setUint16(4, 20, true)
    c.setUint16(6, 20, true)
    c.setUint16(8, 0x0800, true)
    c.setUint16(10, 8, true)
    c.setUint16(12, time, true)
    c.setUint16(14, date, true)
    c.setUint32(16, r.crc, true)
    c.setUint32(20, r.packed, true)
    c.setUint32(24, r.size, true)
    c.setUint16(28, name.length, true)
    c.setUint32(42, r.offset, true)
    central.set(name, 46)
    return central
  })
  const directory = centrals.reduce((n, c) => n + c.length, 0)
  if (offset + directory >= LIMIT) throw new Error("zip: the archive is past what one without ZIP64 holds")
  const out = new Uint8Array(directory + 22)
  let at2 = 0
  for (const central of centrals) {
    out.set(central, at2)
    at2 += central.length
  }
  const e = new DataView(out.buffer, directory)
  e.setUint32(0, 0x06054b50, true)
  e.setUint16(8, records.length, true)
  e.setUint16(10, records.length, true)
  e.setUint32(12, directory, true)
  e.setUint32(16, offset, true)
  return out
}

const concat = (parts: ReadonlyArray<Uint8Array>): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/** The entries as one ZIP archive in memory: for a small file, and for the tests. */
export const zip = async (entries: ReadonlyArray<ZipEntry>, at: Date = new Date()): Promise<Uint8Array> => {
  const parts: Array<Uint8Array> = []
  const records: Array<ZipRecord> = []
  let offset = 0
  for (const entry of entries) {
    const written = await zipEntry(entry, offset, at)
    parts.push(written.bytes)
    records.push(written.record)
    offset += written.bytes.length
  }
  parts.push(zipEnd(records, offset, at))
  return concat(parts)
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

/** Each part of an archive written in parts, but the last: R2 asks for parts of one size, of at least 5 MiB. */
export const PART_BYTES = 8 * 1024 * 1024

/** What was carried and what is added, cut into whole parts to send now and the rest to carry to the next step. */
export const cut = (carried: Uint8Array, added: ReadonlyArray<Uint8Array>, size: number = PART_BYTES) => {
  const all = concat([carried, ...added])
  const whole = Math.floor(all.length / size)
  return {
    parts: Array.from({ length: whole }, (_, i) => all.subarray(i * size, (i + 1) * size)),
    rest: all.subarray(whole * size)
  }
}
