import { describe, expect, it } from "vitest"
import { parseCsv, separatorOf, textOf } from "../src/data/domain/csv.ts"
import { csvBytes } from "../src/shared/domain/Exports.ts"

/*
 * The Data hub's CSV (M14 step 5): one dialect read (the separator guessed from the first line, quotes, CRLF, a BOM)
 * and one written (`;`, CRLF, a BOM before the header), so a file the hub exports reads back as it was.
 */

const bytes = (text: string) => new TextEncoder().encode(text)
const limits = { maxRows: 50_000, maxColumns: 100 }

describe("reading a CSV", () => {
  it("guesses the separator from the first line, tab first and then `;` on a tie", () => {
    expect(separatorOf("a\tb;c\n")).toBe("\t")
    expect(separatorOf("a;b,c\n")).toBe(";")
    expect(separatorOf("a,b,c;d\n")).toBe(",")
    expect(separatorOf("one\n")).toBe(",")
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

  it("refuses what is not text, a header alone and too many rows", () => {
    expect(textOf(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff]))).toBeUndefined()
    expect(parseCsv(new Uint8Array([0xff, 0xfe, 0x00]), limits)).toEqual({ ok: false, error: "not_csv" })
    expect(parseCsv(bytes("a,b\n\n"), limits)).toEqual({ ok: false, error: "empty" })
    expect(parseCsv(bytes("a\n1\n2\n3\n"), { maxRows: 2, maxColumns: 10 })).toEqual({ ok: false, error: "too_large" })
  })

  it("widens the header to the widest row and cuts at the column limit", () => {
    expect(parseCsv(bytes("a,b\n1,2,3\n"), limits)).toEqual({
      ok: true,
      header: ["a", "b", ""],
      rows: [["1", "2", "3"]]
    })
    expect(parseCsv(bytes("a,b,c\n1,2,3\n"), { maxRows: 10, maxColumns: 2 })).toEqual({
      ok: true,
      header: ["a", "b"],
      rows: [["1", "2"]]
    })
  })
})

describe("writing a CSV", () => {
  it("keeps a cell a spreadsheet would run as a formula as text, and a negative number as it is", () => {
    const text = new TextDecoder().decode(csvBytes([["=HYPERLINK(\"x\")", "+31 6", "@sum", "-12,50", "-x"]]))
    expect(text).toBe("\"'=HYPERLINK(\"\"x\"\")\";'+31 6;'@sum;-12,50;'-x\r\n")
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
