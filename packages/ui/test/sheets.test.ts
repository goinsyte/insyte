import { describe, expect, it } from "vitest"
import {
  type Book,
  colIndex,
  colName,
  evaluator,
  fromCsv,
  isErr,
  parseTyped,
  shift,
  type Tab,
  toCsv
} from "../src/app/lib/sheets.ts"

const tab = (cells: Record<string, string>, name = "Blad1", id = "t1"): Tab => ({
  id,
  name,
  cells: Object.fromEntries(Object.entries(cells).map(([k, v]) => [k, { v }])),
  widths: {}
})
const book = (tabs: Tab[], figures: Book["figures"] = () => 0): Book => ({ tabs, figures })
const val = (cells: Record<string, string>, a: string, figures?: Book["figures"]) =>
  evaluator(book([tab(cells)], figures), "t1").value(a)

describe("addresses", () => {
  it("round-trips column names", () => {
    for (const i of [0, 1, 25, 26, 27, 51, 701]) expect(colIndex(colName(i))).toBe(i)
    expect(colName(26)).toBe("AA")
  })
})

describe("typed values", () => {
  it("reads Dutch numbers, percentages and money", () => {
    expect(parseTyped("1.234,50").value).toBe(1234.5)
    expect(parseTyped("1.234").value).toBe(1234)
    expect(parseTyped("1234.5").value).toBe(1234.5)
    expect(parseTyped("12%")).toEqual({ value: 0.12, fmt: "percent" })
    expect(parseTyped("€ 49")).toEqual({ value: 49, fmt: "money" })
    expect(parseTyped("-3,5").value).toBe(-3.5)
    expect(parseTyped("SO-12218").value).toBe("SO-12218")
    expect(parseTyped("").value).toBeNull()
  })
})

const figures: Book["figures"] = (
  m,
  month
) => (m === "omzet" && month === "2026-04" ? 1000 : { error: "#N/B", why: "onbekend" })

describe("formulas", () => {
  it("does arithmetic with precedence, percent and powers", () => {
    expect(val({ A1: "=1+2*3" }, "A1")).toBe(7)
    expect(val({ A1: "=(1+2)*3" }, "A1")).toBe(9)
    expect(val({ A1: "=2^3^1" }, "A1")).toBe(8)
    expect(val({ A1: "=50%*200" }, "A1")).toBe(100)
    expect(val({ A1: "=-B1", B1: "4" }, "A1")).toBe(-4)
    expect(val({ A1: "=1,5*2" }, "A1")).toBe(3)
  })

  it("sums ranges in Dutch and English, skipping text", () => {
    const cells = {
      B1: "10",
      B2: "20",
      B3: "label",
      B4: "=B1*2",
      A1: "=SOM(B1:B4)",
      A2: "=SUM(B1;B2)",
      A3: "=GEMIDDELDE(B1:B2)",
      A4: "=AANTAL(B1:B4)"
    }
    expect(val(cells, "A1")).toBe(50)
    expect(val(cells, "A2")).toBe(30)
    expect(val(cells, "A3")).toBe(15)
    expect(val(cells, "A4")).toBe(3)
  })

  it("branches with ALS and compares text without case", () => {
    expect(val({ A1: "=ALS(B1>0; \"winst\"; \"verlies\")", B1: "-1" }, "A1")).toBe("verlies")
    expect(val({ A1: "=B1=\"ja\"", B1: "JA" }, "A1")).toBe(true)
    expect(val({ A1: "=\"Totaal: \"&B1", B1: "3" }, "A1")).toBe("Totaal: 3")
  })

  it("explains its errors", () => {
    const div = val({ A1: "=B1/C1", B1: "4" }, "A1")
    expect(isErr(div) && div.error).toBe("#DEEL/0!")
    const txt = val({ A1: "=B1*2", B1: "abc" }, "A1")
    expect(isErr(txt) && txt.error).toBe("#WAARDE!")
    expect(isErr(txt) && txt.why).toContain("abc")
    const name = val({ A1: "=FOO(1)" }, "A1")
    expect(isErr(name) && name.error).toBe("#NAAM?")
    const circ = val({ A1: "=B1", B1: "=A1" }, "A1")
    expect(isErr(circ) && circ.error).toBe("#CIRC!")
    expect(val({ A1: "=ALS.FOUT(B1/0; 0)", B1: "3" }, "A1")).toBe(0)
  })

  it("reads another tab by name", () => {
    const b = book([tab({ A1: "=Kosten!B2*2" }), tab({ B2: "21" }, "Kosten", "t2")])
    expect(evaluator(b, "t1").value("A1")).toBe(42)
  })

  it("reads Insyte's figures through INSYTE()", () => {
    expect(val({ A1: "=INSYTE(\"omzet\"; \"2026-04\")*2" }, "A1", figures)).toBe(2000)
    const e = evaluator(book([tab({ A1: "=INSYTE(\"omzet\"; \"2026-04\")" })], figures), "t1")
    expect(e.link("A1")).toEqual({ metric: "omzet", month: "2026-04" })
  })
})

describe("shift", () => {
  it("moves relative references and keeps absolute ones", () => {
    expect(shift("=B2*C2", 0, 1)).toBe("=B3*C3")
    expect(shift("=$B$2*C2", 1, 1)).toBe("=$B$2*D3")
    expect(shift("=INSYTE(\"omzet\"; A2)", 0, 1)).toBe("=INSYTE(\"omzet\"; A3)")
  })
})

describe("csv", () => {
  it("round-trips with semicolons and quotes", () => {
    const rows = [["Maand", "Omzet"], ["april", "1234,5"], ["met;punt", "een \"quote\""]]
    expect(fromCsv(toCsv(rows))).toEqual(rows)
    expect(fromCsv("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]])
  })
})
