/*
 * The hub's one CSV dialect (domain.md §5 "Imports"; widgets/02 "/data?view=import"): UTF-8 text, with or without a
 * BOM; the separator is whichever of `;`, `,` or tab the first record uses most outside quotes (`;` on a tie, as Dutch
 * Excel writes it, then `,`); fields in double quotes may hold the separator, line ends and doubled quotes, and may
 * have spaces before the opening quote; CRLF or LF; blank lines are dropped; the first line is the header, trimmed.
 * Pure, so the parse is the same in a test as on the jobs Worker.
 *
 * A file is read twice and never held as cells: `readCsv` first walks it to check every limit (rows, columns, a cell's
 * length, a quote that never closes) and refuses at the first one it meets, then `rows()` walks it again, one record
 * at a time, each cell a slice of the text. So a 10 MB file costs about its own text, whatever its shape.
 */

export type CsvError = "not_csv" | "empty" | "too_large" | "too_wide" | "cell_too_long" | "parse_failed"

export interface CsvLimits {
  readonly maxRows: number
  readonly maxColumns: number
  readonly maxCellChars: number
}

export type Read =
  | {
    readonly ok: true
    readonly header: ReadonlyArray<string>
    readonly rowCount: number
    /** The rows after the header, blank lines dropped, one at a time. */
    readonly rows: () => Generator<ReadonlyArray<string>, void, undefined>
  }
  | { readonly ok: false; readonly error: CsvError; readonly line?: number }

export type Parsed =
  | { readonly ok: true; readonly header: ReadonlyArray<string>; readonly rows: ReadonlyArray<ReadonlyArray<string>> }
  | { readonly ok: false; readonly error: CsvError; readonly line?: number }

const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false })

/** The text of the file, or `undefined` when it is not UTF-8 text (a spreadsheet, an image, a zip). */
export const textOf = (bytes: Uint8Array): string | undefined => {
  try {
    const text = decoder.decode(bytes)
    // A NUL is never in a CSV: a binary file that happens to decode.
    return text.includes("\u0000") ? undefined : text.replace(/^﻿/, "")
  } catch {
    return undefined
  }
}

/** How far into the text the separator is looked for: the first record, or this much of it. */
const SNIFF_CHARS = 1 << 20

/** The separator the first record uses most outside quotes: `;` on a tie, then `,`, then tab. */
export const separatorOf = (text: string): "\t" | ";" | "," => {
  let semicolons = 0
  let commas = 0
  let tabs = 0
  let quoted = false
  for (let i = 0; i < Math.min(text.length, SNIFF_CHARS); i++) {
    const ch = text[i]
    if (ch === "\"") quoted = !quoted
    else if (quoted) continue
    else if (ch === "\n" || ch === "\r") break
    else if (ch === ";") semicolons++
    else if (ch === ",") commas++
    else if (ch === "\t") tabs++
  }
  if (semicolons > 0 && semicolons >= commas && semicolons >= tabs) return ";"
  if (tabs > commas) return "\t"
  return ","
}

/** One record: its cells and the line it starts on, from 1. */
interface Line {
  readonly cells: Array<string>
  readonly line: number
}

type Stop = { readonly error: CsvError; readonly line: number }

const isBlank = (cells: ReadonlyArray<string>) => cells.every((c) => c.trim() === "")

/**
 * The records of the text, each cell a slice of it; the generator returns why it stopped early, or nothing at the end.
 * A record wider than `maxColumns` or a cell longer than `maxCellChars` stops it, as does a quote that never closes.
 */
function* records(
  text: string,
  separator: string,
  limits: Pick<CsvLimits, "maxColumns" | "maxCellChars">
): Generator<Line, Stop | undefined, undefined> {
  const n = text.length
  let i = 0
  let line = 1
  // A tab is padding before a quote unless it is the separator.
  const isPad = separator === "\t" ?
    (ch: string | undefined) => ch === " " :
    (ch: string | undefined) => ch === " " || ch === "\t"
  // The end of an unquoted stretch from `from`: the next separator or line end.
  const endOf = (from: number) => {
    let m = from
    while (m < n) {
      const ch = text[m]
      if (ch === separator || ch === "\n" || ch === "\r") break
      m++
    }
    return m
  }
  while (i < n) {
    const start = line
    const cells: Array<string> = []
    for (;;) {
      // Spaces before an opening quote belong to no cell; before anything else they are the cell's own.
      let j = i
      while (j < n && isPad(text[j])) j++
      let value: string
      if (j < n && text[j] === "\"") {
        const opened = line
        let k = j + 1
        let doubled = false
        let close = -1
        while (close === -1) {
          const q = text.indexOf("\"", k)
          if (q === -1) return { error: "parse_failed", line: opened }
          if (text[q + 1] === "\"") {
            doubled = true
            k = q + 2
          } else {
            close = q
          }
        }
        for (let nl = text.indexOf("\n", j); nl !== -1 && nl < close; nl = text.indexOf("\n", nl + 1)) line++
        if (close - j - 1 > limits.maxCellChars * 2) return { error: "cell_too_long", line: start }
        const raw = text.slice(j + 1, close)
        // What follows the closing quote up to the separator is kept, as a spreadsheet keeps it (`"a"b` is `ab`).
        const tail = endOf(close + 1)
        value = (doubled ? raw.replaceAll("\"\"", "\"") : raw) + text.slice(close + 1, tail).trimEnd()
        i = tail
      } else {
        const end = endOf(i)
        value = text.slice(i, end)
        i = end
      }
      if (value.length > limits.maxCellChars) return { error: "cell_too_long", line: start }
      cells.push(value)
      if (cells.length > limits.maxColumns) return { error: "too_wide", line: start }
      if (i < n && text[i] === separator) {
        i++
        continue
      }
      if (text[i] === "\r") i++
      if (text[i] === "\n") i++
      line++
      break
    }
    yield { cells, line: start }
  }
  return undefined
}

/**
 * A whole file checked against the limits, its header and row count back with a way to walk its rows; or why not, with
 * the line where it applies. Nothing but the text is kept between the two walks.
 */
export const readCsv = (bytes: Uint8Array, limits: CsvLimits): Read => {
  const text = textOf(bytes)
  if (text === undefined) return { ok: false, error: "not_csv" }
  const separator = separatorOf(text)
  let header: ReadonlyArray<string> | undefined
  let width = 0
  let rowCount = 0
  const walk = records(text, separator, limits)
  for (let next = walk.next();; next = walk.next()) {
    if (next.done === true) {
      if (next.value !== undefined) return { ok: false, ...next.value }
      break
    }
    const { cells, line } = next.value
    if (isBlank(cells)) continue
    width = Math.max(width, cells.length)
    if (header === undefined) {
      header = cells.map((c) => c.trim())
      continue
    }
    rowCount++
    if (rowCount > limits.maxRows) return { ok: false, error: "too_large", line }
  }
  if (header === undefined || rowCount === 0) return { ok: false, error: "empty" }
  const named = header
  return {
    ok: true,
    header: Array.from({ length: width }, (_, c) => named[c] ?? ""),
    rowCount,
    rows: function*() {
      let first = true
      for (const { cells } of records(text, separator, limits)) {
        if (isBlank(cells)) continue
        if (first) {
          first = false
          continue
        }
        yield cells
      }
    }
  }
}

/** A whole file read into memory: for a test, and for files known to be small. */
export const parseCsv = (bytes: Uint8Array, limits: CsvLimits): Parsed => {
  const read = readCsv(bytes, limits)
  return read.ok ? { ok: true, header: read.header, rows: Array.from(read.rows()) } : read
}
