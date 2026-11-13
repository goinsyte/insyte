import { describe, expect, it } from "vitest"
import { MONTH_ROWS, monthRowsTo, profitTab, templateTabs } from "../src/sheet-templates.ts"
import {
  type Book,
  display,
  evaluator,
  figureKey,
  figureRequests,
  type Figures,
  fromCsv,
  inferFmt,
  isErr,
  isLinked,
  parseTyped,
  resolveMonth,
  shift,
  type Tab,
  tabRows,
  toCsv
} from "../src/sheets.ts"

const tab = (id: string, name: string, cells: Record<string, string>): Tab => ({
  id,
  name,
  cells: Object.fromEntries(Object.entries(cells).map(([a, v]) => [a, { v }])),
  widths: {}
})

const none: Figures = () => ({ error: "#N/B", why: "geen cijfers" })
const value = (cells: Record<string, string>, a: string, figures: Figures = none) =>
  evaluator({ tabs: [tab("t1", "Blad1", cells)], figures }, "t1").value(a)

describe("typed values", () => {
  it("reads Dutch numbers, percentages and money", () => {
    expect(parseTyped("1.234,50")).toEqual({ value: 1234.5 })
    expect(parseTyped("12%")).toEqual({ value: 0.12, fmt: "percent" })
    expect(parseTyped("€ 49")).toEqual({ value: 49, fmt: "money" })
    expect(parseTyped("WAAR")).toEqual({ value: true })
    expect(parseTyped("Fleece")).toEqual({ value: "Fleece" })
    expect(parseTyped("")).toEqual({ value: null })
  })
})

describe("formulas", () => {
  it("adds a range, skipping text and empty cells", () => {
    expect(value({ A1: "1", A2: "2,5", A3: "tekst", A5: "=SOM(A1:A4)" }, "A5")).toBe(3.5)
  })

  it("takes the English names too", () => {
    expect(value({ A1: "4", A2: "6", A3: "=AVERAGE(A1:A2)" }, "A3")).toBe(5)
    expect(value({ A1: "4", A2: "=IF(A1>3; \"ja\"; \"nee\")" }, "A2")).toBe("ja")
  })

  it("follows operator precedence and percentages", () => {
    expect(value({ A1: "=2+3*4^2" }, "A1")).toBe(50)
    expect(value({ A1: "=200*10%" }, "A1")).toBe(20)
    expect(value({ A1: "=\"a\"&\"b\"" }, "A1")).toBe("ab")
  })

  it("says why an error is one", () => {
    const div = value({ A1: "=1/A2" }, "A1")
    expect(isErr(div) && div.error).toBe("#DEEL/0!")
    const circ = value({ A1: "=A2", A2: "=A1" }, "A1")
    expect(isErr(circ) && circ.error).toBe("#CIRC!")
    const name = value({ A1: "=VERZIN(1)" }, "A1")
    expect(isErr(name) && name.error).toBe("#NAAM?")
    const ref = value({ A1: "='Nergens'!A1" }, "A1")
    expect(isErr(ref) && ref.error).toBe("#VERW!")
    const text = value({ A1: "Fleece", A2: "=A1*2" }, "A2")
    expect(isErr(text) && text.error).toBe("#WAARDE!")
    expect(value({ A1: "=ALS.FOUT(1/0; 7)" }, "A1")).toBe(7)
  })

  it("reads another tab by its name", () => {
    const book: Book = {
      tabs: [tab("t1", "Overzicht", { A1: "='Retouren'!B2*2" }), tab("t2", "Retouren", { B2: "21" })],
      figures: none
    }
    expect(evaluator(book, "t1").value("A1")).toBe(42)
  })

  it("asks Insyte for a figure, with the month as written", () => {
    const asked: Array<[string, string | undefined]> = []
    const figures: Figures = (metric, month) => {
      asked.push([metric, month])
      return 1000
    }
    expect(value({ A1: "=INSYTE(\"omzet\"; \"2026-04\")*2" }, "A1", figures)).toBe(2000)
    expect(value({ A1: "april", B1: "=INSYTE(\"omzet\"; $A1)" }, "B1", figures)).toBe(1000)
    expect(asked).toEqual([["omzet", "2026-04"], ["omzet", "april"]])
    const bad = value({ A1: "=INSYTE(12)" }, "A1", figures)
    expect(isErr(bad) && bad.error).toBe("#WAARDE!")
  })

  it("infers a linked cell's format from its metric", () => {
    expect(inferFmt("=INSYTE(\"marge\"; \"2026-04\")")).toBe("percent")
    expect(inferFmt("=SOM(A1:A2)")).toBeUndefined()
  })
})

describe("references move with a fill or a paste", () => {
  it("shifts relative references and keeps absolute ones", () => {
    expect(shift("=B2*C2", 0, 1)).toBe("=B3*C3")
    expect(shift("=INSYTE(\"omzet\"; $A2)", 0, 2)).toBe("=INSYTE(\"omzet\"; $A4)")
    expect(shift("=$B$2+C2", 1, 0)).toBe("=$B$2+D2")
    expect(shift("tekst", 1, 1)).toBe("tekst")
  })
})

describe("CSV", () => {
  it("writes semicolons and quotes what needs it", () => {
    expect(toCsv([["a", "b;c"], ["\"x\"", "1,5"]])).toBe("a;\"b;c\"\n\"\"\"x\"\"\";1,5")
  })

  it("reads whichever separator the file uses", () => {
    expect(fromCsv("a;b\n1;2")).toEqual([["a", "b"], ["1", "2"]])
    expect(fromCsv("a,b\r\n1,2")).toEqual([["a", "b"], ["1", "2"]])
    expect(fromCsv("a\tb\n\"x;y\"\t2")).toEqual([["a", "b"], ["x;y", "2"]])
  })
})

describe("the months a cell names", () => {
  it("resolves a name to its most recent month, and nothing to the month under way", () => {
    expect(resolveMonth("2026-04", "2026-11")).toBe("2026-04")
    expect(resolveMonth("april", "2026-11")).toBe("2026-04")
    expect(resolveMonth("Dec", "2026-11")).toBe("2025-12")
    expect(resolveMonth("nov", "2026-11")).toBe("2026-11")
    expect(resolveMonth(undefined, "2026-11")).toBe("2026-11")
    expect(resolveMonth("2026-13", "2026-11")).toBeUndefined()
    expect(resolveMonth("lente", "2026-11")).toBeUndefined()
  })

  it("keys a figure the same however it was spelled", () => {
    expect(figureKey(" Omzet ", "April")).toBe(figureKey("omzet", "april"))
    expect(figureKey("omzet", undefined)).toBe("omzet|")
  })
})

describe("what a sheet asks for", () => {
  it("collects each figure once, with months read from column A", () => {
    const t = tab("t1", "Blad1", {
      A2: "januari",
      A3: "februari",
      B2: "=INSYTE(\"omzet\"; $A2)",
      B3: "=INSYTE(\"omzet\"; $A3)",
      C2: "=INSYTE(\"omzet\"; \"januari\")",
      D2: "=B2/INSYTE(\"bestellingen\")"
    })
    const keys = figureRequests([t]).map((r) => figureKey(r.metric, r.month)).sort()
    expect(keys).toEqual(["bestellingen|", "omzet|februari", "omzet|januari"])
  })

  it("finds nothing in a sheet without links", () => {
    expect(figureRequests([tab("t1", "Blad1", { A1: "=1+1" })])).toEqual([])
    expect(isLinked([tab("t1", "Blad1", { A1: "=1+1" })])).toBe(false)
  })
})

describe("templates", () => {
  it("builds the five months up to now, across a year", () => {
    expect(monthRowsTo("2026-02")).toEqual([
      ["oktober", "2025-10"],
      ["november", "2025-11"],
      ["december", "2025-12"],
      ["januari", "2026-01"],
      ["februari", "2026-02"]
    ])
  })

  it("computes the profit template from Insyte's figures", () => {
    const figures: Figures = (metric) =>
      metric === "omzet" ? 10_000 : metric === "advertentiekosten" ? 2_000 : metric === "overige_kosten" ? 1_000 : 50
    const t = profitTab("t1")
    const ev = evaluator({ tabs: [t], figures }, "t1")
    // A row per month, then the total: revenue, ROAS, net and margin are formulas over the linked cells.
    expect(ev.value("B2")).toBe(10_000)
    expect(ev.value("E2")).toBe(5)
    expect(ev.value("G2")).toBe(7_000)
    expect(ev.value("H2")).toBeCloseTo(0.7)
    expect(ev.value(`B${MONTH_ROWS.length + 2}`)).toBe(50_000)
    expect(ev.value("B10")).toBe("ja")
    expect(isLinked([t])).toBe(true)
  })

  it("writes a blank sheet as one empty tab", () => {
    expect(templateTabs("blank", (p) => `${p}_1`)).toEqual([{ id: "tab_1", name: "Blad1", cells: {}, widths: {} }])
  })

  it("exports a tab's values as shown", () => {
    const t = tab("t1", "Blad1", { A1: "Product", B1: "Prijs", A2: "Fleece", B2: "=12,5*2" })
    expect(tabRows({ tabs: [t], figures: none }, "t1")).toEqual([["Product", "Prijs"], ["Fleece", "25"]])
  })

  it("formats money in the workspace's currency", () => {
    expect(display(1234.5, "money", "EUR").replace(/\s/g, " ")).toBe("€ 1.234,50")
    expect(display(0.125, "percent", "EUR")).toBe("12,5%")
  })
})
