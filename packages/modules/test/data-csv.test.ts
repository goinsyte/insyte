import { describe, expect, it } from "vitest"
import { parseCsv, readCsv, separatorOf, textOf } from "../src/data/domain/csv.ts"
import { MAX_IMPORT_CELL_CHARS, MAX_IMPORT_COLUMNS, MAX_IMPORT_ROWS } from "../src/data/domain/Data.ts"
import { cursorOf, keyOf } from "../src/data/use-cases/sources.ts"
import { csvBytes, EXPORT_MAX_ROWS, maxPagesOf, tooManyRows } from "../src/shared/domain/Exports.ts"

/*
 * The Data hub's CSV (M14 step 5): one dialect read (the separator guessed from the first line, quotes, CRLF, a BOM)
 * and one written (`;`, CRLF, a BOM before the header), so a file the hub exports reads back as it was.
 */

const bytes = (text: string) => new TextEncoder().encode(text)
const limits = { maxRows: MAX_IMPORT_ROWS, maxColumns: MAX_IMPORT_COLUMNS, maxCellChars: MAX_IMPORT_CELL_CHARS }
const small = (over: Partial<typeof limits>) => ({ ...limits, ...over })

describe("reading a CSV", () => {
  it("guesses the separator from the first record outside quotes, `;` on a tie", () => {
    expect(separatorOf("a\tb;c\n")).toBe(";")
    expect(separatorOf("a;b,c\n")).toBe(";")
    expect(separatorOf("a,b,c;d\n")).toBe(",")
    expect(separatorOf("one\n")).toBe(",")
    // What is quoted does not count, nor does one tab inside a `;` header.
    expect(separatorOf("naam,\"stad; land\"\n")).toBe(",")
    expect(separatorOf("\"a;b;c\",d,e\n")).toBe(",")
    expect(separatorOf("Naam;Notitie\tmet tab;Bedrag\n")).toBe(";")
    expect(separatorOf("Naam\tAdres\tBedrag\n")).toBe("\t")
  })

  it("reads quoted fields with separators, line ends and doubled quotes, and drops blank lines", () => {
    const parsed = parseCsv(
      bytes("\uFEFFNaam;Notitie\r\n\"Jan\";\"zegt \"\"hoi\"\"; daarna\nklaar\"\r\n\r\nPiet;\r\n"),
      limits
    )
    expect(parsed).toEqual({
      ok: true,
      header: ["Naam", "Notitie"],
      rows: [["Jan", "zegt \"hoi\"; daarna\nklaar"], ["Piet", ""]]
    })
  })

  it("names the line where a quote was opened and never closed", () => {
    expect(parseCsv(bytes("a,b\n1,2\n3,\"open\n4,5\n"), limits)).toEqual({ ok: false, error: "parse_failed", line: 3 })
  })

  it("takes spaces before an opening quote, and keeps them before anything else", () => {
    expect(parseCsv(bytes("a, \"b, c\"\n1,  \"x, y\" \n2, z\n"), limits)).toEqual({
      ok: true,
      header: ["a", "b, c"],
      rows: [["1", "x, y"], ["2", " z"]]
    })
  })

  it("refuses what is not text, a header alone and too many rows", () => {
    expect(textOf(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff]))).toBeUndefined()
    expect(parseCsv(new Uint8Array([0xff, 0xfe, 0x00]), limits)).toEqual({ ok: false, error: "not_csv" })
    expect(parseCsv(bytes("a,b\n\n"), limits)).toEqual({ ok: false, error: "empty" })
    expect(parseCsv(bytes("a\n1\n2\n3\n"), small({ maxRows: 2 }))).toEqual({ ok: false, error: "too_large", line: 4 })
  })

  it("widens the header to the widest row, and refuses a row wider than the column limit", () => {
    expect(parseCsv(bytes("a,b\n1,2,3\n"), limits)).toEqual({
      ok: true,
      header: ["a", "b", ""],
      rows: [["1", "2", "3"]]
    })
    expect(parseCsv(bytes("a,b\n1,2\n1,2,3\n"), small({ maxColumns: 2 }))).toEqual({
      ok: false,
      error: "too_wide",
      line: 3
    })
  })

  it("refuses a cell longer than the cell limit, quoted or not, with its line", () => {
    expect(parseCsv(bytes("a\n12345\n123456\n"), small({ maxCellChars: 5 })))
      .toEqual({ ok: false, error: "cell_too_long", line: 3 })
    expect(parseCsv(bytes("a\n\"12\n3456\"\n"), small({ maxCellChars: 5 })))
      .toEqual({ ok: false, error: "cell_too_long", line: 2 })
    expect(parseCsv(bytes("a\n\"1\"\"345\"\n"), small({ maxCellChars: 5 })))
      .toEqual({ ok: true, header: ["a"], rows: [["1\"345"]] })
  })

  it("reads a file at the limits without holding its cells", () => {
    // 50,000 rows of 100 one-letter cells: 10 MB, the most the hub takes. Read the way the parse step reads it, a
    // batch at a time; the heap grows by about the text, far below the jobs isolate's 128 MB.
    const row = `${Array.from({ length: MAX_IMPORT_COLUMNS }, () => "a").join(",")}\n`
    const file = bytes(row.repeat(MAX_IMPORT_ROWS + 1))
    expect(file.byteLength).toBeLessThanOrEqual(10 * 1024 * 1024)
    const before = process.memoryUsage().heapUsed
    let peak = before
    const read = readCsv(file, limits)
    if (!read.ok) throw new Error(read.error)
    expect(read.rowCount).toBe(MAX_IMPORT_ROWS)
    let n = 0
    let batch: Array<ReadonlyArray<string>> = []
    for (const cells of read.rows()) {
      batch.push(cells)
      if (++n % 2000 === 0) {
        JSON.stringify(batch)
        batch = []
        peak = Math.max(peak, process.memoryUsage().heapUsed)
      }
    }
    expect(n).toBe(MAX_IMPORT_ROWS)
    expect(peak - before).toBeLessThan(64 * 1024 * 1024)

    // One 10 MB quoted cell is refused at its length, without being built.
    const cell = bytes(`a\n"${"x".repeat(10 * 1024 * 1024 - 8)}"\n`)
    const start = process.memoryUsage().heapUsed
    expect(readCsv(cell, limits)).toEqual({ ok: false, error: "cell_too_long", line: 2 })
    expect(process.memoryUsage().heapUsed - start).toBeLessThan(48 * 1024 * 1024)
  }, 60_000)
})

/** One value written as a CSV cell, without the line end. */
const minus = (value: string) => new TextDecoder().decode(csvBytes([[value]])).replace(/\r\n$/, "")

describe("writing a CSV", () => {
  it("keeps a cell a spreadsheet would run as a formula as text, and a negative number as it is", () => {
    const text = new TextDecoder().decode(csvBytes([["=HYPERLINK(\"x\")", "+31 6", "@sum", "-12,50", "-x"]]))
    expect(text).toBe("\"'=HYPERLINK(\"\"x\"\")\";'+31 6;'@sum;-12,50;'-x\r\n")
    // A leading minus is a number only when the whole value is one.
    expect(minus("-1+1+cmd|' /C calc'!A0")).toBe("'-1+1+cmd|' /C calc'!A0")
    expect(minus("-1+HYPERLINK(\"https://x.test\")")).toBe("\"'-1+HYPERLINK(\"\"https://x.test\"\")\"")
    expect(minus("-2,5e3")).toBe("'-2,5e3")
    expect(minus("-")).toBe("'-")
    expect(["-3", "-0.5", "-12,50"].map(minus)).toEqual(["-3", "-0.5", "-12,50"])
    expect(minus("\tx")).toBe("'\tx")
  })

  it("writes `;` and CRLF with a BOM before the header, quoting what needs it, and reads back the same", () => {
    const first = csvBytes([["Jan; de Vries", "12,50"]], { header: ["Naam", "Bedrag"] })
    const next = csvBytes([["zegt \"hoi\"", "0"]])
    expect(new TextDecoder("utf-8", { ignoreBOM: true }).decode(first)).toBe(
      "\uFEFFNaam;Bedrag\r\n\"Jan; de Vries\";12,50\r\n"
    )
    expect(new TextDecoder().decode(next)).toBe("\"zegt \"\"hoi\"\"\";0\r\n")
    expect(parseCsv(new Uint8Array([...first, ...next]), limits)).toEqual({
      ok: true,
      header: ["Naam", "Bedrag"],
      rows: [["Jan; de Vries", "12,50"], ["zegt \"hoi\"", "0"]]
    })
  })
})

describe("the orders export's cursor", () => {
  it("keeps placed_at to the microsecond, as the database wrote it", () => {
    const row = { placedKey: "2026-11-13 10:00:00.123456+00", id: "ord_01abc" }
    expect(keyOf(cursorOf(row))).toEqual({ placedAt: row.placedKey, id: row.id })
    expect(keyOf(null)).toBeUndefined()
  })
})

describe("an export's size", () => {
  it("is refused up front over a million rows, and its pages held to that", () => {
    const plan = { mime: "text/csv", extension: "csv", pageRows: 2000 }
    expect(tooManyRows({ ...plan, total: EXPORT_MAX_ROWS })).toBe(false)
    expect(tooManyRows({ ...plan, total: EXPORT_MAX_ROWS + 1 })).toBe(true)
    expect(tooManyRows({ ...plan, total: null })).toBe(false)
    expect(maxPagesOf({ ...plan, total: null })).toBe(501)
  })
})
