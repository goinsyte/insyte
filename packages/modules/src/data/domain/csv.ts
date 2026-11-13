/*
 * The hub's one CSV dialect (domain.md §5 "Imports"; widgets/02 "/data?view=import"): UTF-8 text, with or without a
 * BOM; the separator is whichever of tab, `;` or `,` the first line uses most (tab first, then `;` on a tie, as Dutch
 * Excel writes it); fields in double quotes may hold the separator, line ends and doubled quotes; CRLF or LF; blank
 * lines are dropped; the first line is the header, trimmed. Pure, so the parse is the same in a test as on the jobs
 * Worker.
 */

export type Parsed =
  | { readonly ok: true; readonly header: ReadonlyArray<string>; readonly rows: ReadonlyArray<ReadonlyArray<string>> }
  | { readonly ok: false; readonly error: "not_csv" | "empty" | "too_large" | "parse_failed"; readonly line?: number }

const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false })

/** The text of the file, or `undefined` when it is not UTF-8 text (a spreadsheet, an image, a zip). */
export const textOf = (bytes: Uint8Array): string | undefined => {
  try {
    const text = decoder.decode(bytes)
    // A NUL is never in a CSV: a binary file that happens to decode.
    return text.includes("\u0000") ? undefined : text.replace(/^\uFEFF/, "")
  } catch {
    return undefined
  }
}

const count = (line: string, ch: string) => line.split(ch).length - 1

/** The separator the first line uses. */
export const separatorOf = (text: string): "\t" | ";" | "," => {
  const first = text.split(/\r?\n/, 1)[0] ?? ""
  if (first.includes("\t")) return "\t"
  return count(first, ";") >= count(first, ",") && count(first, ";") > 0 ? ";" : ","
}

/** Splits CSV text into rows, or says the line where a quote was opened and never closed. */
export const splitRows = (
  text: string,
  separator: string
): { readonly rows: Array<Array<string>> } | { readonly brokenAt: number } => {
  const rows: Array<Array<string>> = []
  let row: Array<string> = []
  let cell = ""
  let quoted = false
  let line = 1
  let quoteLine = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (quoted) {
      if (ch === "\"" && text[i + 1] === "\"") {
        cell += "\""
        i++
      } else if (ch === "\"") {
        quoted = false
      } else {
        if (ch === "\n") line++
        cell += ch
      }
    } else if (ch === "\"" && cell === "") {
      quoted = true
      quoteLine = line
    } else if (ch === separator) {
      row.push(cell)
      cell = ""
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
      line++
    } else {
      cell += ch
    }
  }
  if (quoted) return { brokenAt: quoteLine }
  if (cell !== "" || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return { rows }
}

/** A whole file read: the header and its rows within the limits, or why not. */
export const parseCsv = (
  bytes: Uint8Array,
  limits: { readonly maxRows: number; readonly maxColumns: number }
): Parsed => {
  const text = textOf(bytes)
  if (text === undefined) return { ok: false, error: "not_csv" }
  const split = splitRows(text, separatorOf(text))
  if ("brokenAt" in split) return { ok: false, error: "parse_failed", line: split.brokenAt }
  const lines = split.rows.filter((r) => r.some((c) => c.trim() !== ""))
  const [header, ...rows] = lines
  if (header === undefined || rows.length === 0) return { ok: false, error: "empty" }
  if (rows.length > limits.maxRows) return { ok: false, error: "too_large" }
  const width = Math.min(limits.maxColumns, rows.reduce((w, r) => Math.max(w, r.length), header.length))
  return {
    ok: true,
    header: Array.from({ length: width }, (_, i) => (header[i] ?? "").trim()),
    rows: rows.map((r) => r.slice(0, width))
  }
}
