import { insyte } from "../../fixtures/costs.ts"
import type { FigureError } from "../../fixtures/costs.ts"
import { addr, COLUMNS } from "../../fixtures/sheets.ts"
import type { Fmt, Tab } from "../../fixtures/sheets.ts"

/**
 * The formula engine for Sheets, in the Dutch spreadsheet dialect the original speaks
 * (`@insyte/domain/sheets`): `;` between arguments, a decimal comma, `=SOM(B2:B8)`, `=ALS(B2>0; "winst";
 * "verlies")`, `=ALS.FOUT(B2/C2; 0)`, `=AFRONDEN(B2; 0)`, the operators `+ - * / ^ %`, comparisons, `&`
 * to join text, another tab as `Kanalen!B4`, and `INSYTE("cijfer"; "dag")` for a figure from Kosten and
 * Analyse. The English names work too. An error carries the sentence a person reads under the formula bar.
 */

type Value = number | string | boolean | FigureError
export const isError = (v: unknown): v is FigureError => typeof v === "object" && v !== null && "error" in v

const err = (error: string, why: string): FigureError => ({ error, why })

/** The grid every tab has: A to L, 40 rows. */
export const COLS = 12
export const ROWS = 40

export const colName = (c: number) => COLUMNS[c] ?? "A"
const colIndex = (name: string) => COLUMNS.indexOf(name.toUpperCase())

export function parseAddr(a: string): { readonly c: number; readonly r: number } | null {
  const m = /^\$?([A-Za-z])\$?(\d{1,3})$/.exec(a)
  if (m === null) return null
  return { c: colIndex(m[1] ?? "A"), r: Number(m[2]) - 1 }
}

/** "1.234,50" or "6,95" or "€ 49" or "12%" → a number, or null when it is text. */
function parseNumber(raw: string): number | null {
  const t = raw.trim().replace(/^-?\s*€\s*/, (m) => (m.startsWith("-") ? "-" : ""))
  if (!/^-?[\d.]*,?\d+%?$/.test(t)) return null
  const pct = t.endsWith("%")
  const n = Number(t.replace("%", "").replace(/\./g, "").replace(",", "."))
  if (Number.isNaN(n)) return null
  return pct ? n / 100 : n
}

/** What a typed value is, and the format it suggests: "€ 49" is money, "12%" a percentage. */
export function typedFmt(raw: string): Fmt | undefined {
  const t = raw.trim()
  if (parseNumber(t) === null) return undefined
  if (t.includes("€")) return "money"
  if (t.endsWith("%")) return "percent"
  return undefined
}

/* ── tokens and the parse tree ───────────────────────────────────────────────────────────────── */

type Token =
  | { readonly t: "num"; readonly v: number }
  | { readonly t: "str"; readonly v: string }
  | { readonly t: "ref"; readonly tab?: string; readonly a: string }
  | { readonly t: "range"; readonly tab?: string; readonly a: string; readonly b: string }
  | { readonly t: "id"; readonly v: string }
  | { readonly t: "op"; readonly v: string }

const REF = /^(?:('([^']+)'|[A-Za-zÀ-ÿ][\wÀ-ÿ]*)!)?(\$?[A-Za-z]\$?\d{1,3})(?::(\$?[A-Za-z]\$?\d{1,3}))?/

function tokenize(src: string): Array<Token> | FigureError {
  const out: Array<Token> = []
  let i = 0
  while (i < src.length) {
    const c = src[i] ?? ""
    const rest = src.slice(i)
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (/\d/.test(c)) {
      const m = /^\d+(?:[.,]\d+)?/.exec(rest)?.[0] ?? c
      out.push({ t: "num", v: Number(m.replace(",", ".")) })
      i += m.length
      continue
    }
    if (c === "\"") {
      const end = src.indexOf("\"", i + 1)
      if (end < 0) return err("#WAARDE!", "Een tekst tussen aanhalingstekens wordt niet afgesloten.")
      out.push({ t: "str", v: src.slice(i + 1, end) })
      i = end + 1
      continue
    }
    const r = REF.exec(rest)
    if (r !== null && !/[\wÀ-ÿ(.]/.test(src[i + r[0].length] ?? "")) {
      const tab = r[2] ?? r[1]
      const a = (r[3] ?? "").replace(/\$/g, "").toUpperCase()
      const b = r[4]?.replace(/\$/g, "").toUpperCase()
      const at = tab === undefined ? {} : { tab }
      out.push(b === undefined ? { t: "ref", ...at, a } : { t: "range", ...at, a, b })
      i += r[0].length
      continue
    }
    const id = /^[A-Za-zÀ-ÿ_][\wÀ-ÿ.]*/.exec(rest)
    if (id !== null) {
      out.push({ t: "id", v: id[0].toUpperCase() })
      i += id[0].length
      continue
    }
    const two = src.slice(i, i + 2)
    if (two === "<=" || two === ">=" || two === "<>") {
      out.push({ t: "op", v: two })
      i += 2
      continue
    }
    if ("+-*/^&=<>%();,".includes(c)) {
      out.push({ t: "op", v: c === "," ? ";" : c })
      i++
      continue
    }
    return err("#NAAM?", `Het teken ‘${c}’ kent de formule niet.`)
  }
  return out
}

type Node =
  | { readonly k: "num"; readonly v: number }
  | { readonly k: "str"; readonly v: string }
  | { readonly k: "bool"; readonly v: boolean }
  | { readonly k: "ref"; readonly tab?: string; readonly a: string }
  | { readonly k: "range"; readonly tab?: string; readonly a: string; readonly b: string }
  | { readonly k: "call"; readonly name: string; readonly args: ReadonlyArray<Node> }
  | { readonly k: "un"; readonly x: Node }
  | { readonly k: "pct"; readonly x: Node }
  | { readonly k: "bin"; readonly op: string; readonly l: Node; readonly r: Node }

const COMPARE = new Set(["=", "<>", "<", ">", "<=", ">="])

const fail = (why: string): never => {
  throw err("#WAARDE!", why)
}

function parse(tokens: ReadonlyArray<Token>): Node | FigureError {
  let at = 0
  const peek = () => tokens[at]
  const isOp = (v: string) => {
    const t = peek()
    return t?.t === "op" && t.v === v
  }
  const primary = (): Node => {
    const tok = tokens[at++]
    if (tok === undefined) return fail("De formule houdt te vroeg op.")
    if (tok.t === "num") return { k: "num", v: tok.v }
    if (tok.t === "str") return { k: "str", v: tok.v }
    if (tok.t === "ref") return tok.tab === undefined ? { k: "ref", a: tok.a } : { k: "ref", tab: tok.tab, a: tok.a }
    if (tok.t === "range") {
      return tok.tab === undefined
        ? { k: "range", a: tok.a, b: tok.b }
        : { k: "range", tab: tok.tab, a: tok.a, b: tok.b }
    }
    if (tok.t === "op" && tok.v === "(") {
      const x = compare()
      if (!isOp(")")) fail("Er ontbreekt een sluithaakje.")
      at++
      return x
    }
    if (tok.t === "id") {
      if (isOp("(")) {
        at++
        const args: Array<Node> = []
        if (!isOp(")")) {
          for (;;) {
            args.push(compare())
            if (isOp(";")) {
              at++
              continue
            }
            break
          }
        }
        if (!isOp(")")) fail(`Er ontbreekt een sluithaakje na ${tok.v}(…`)
        at++
        return { k: "call", name: tok.v, args }
      }
      if (tok.v === "WAAR" || tok.v === "TRUE") return { k: "bool", v: true }
      if (tok.v === "ONWAAR" || tok.v === "FALSE") return { k: "bool", v: false }
      throw err("#NAAM?", `‘${tok.v}’ is geen functie of cel die Insyte kent.`)
    }
    return fail(`‘${tok.v}’ staat op een plek waar een getal, een cel of een functie hoort.`)
  }
  const postfix = (): Node => {
    let x = primary()
    while (isOp("%")) {
      at++
      x = { k: "pct", x }
    }
    return x
  }
  const unary = (): Node => {
    if (isOp("-")) {
      at++
      return { k: "un", x: unary() }
    }
    if (isOp("+")) {
      at++
      return unary()
    }
    return postfix()
  }
  const power = (): Node => {
    let l = unary()
    while (isOp("^")) {
      at++
      l = { k: "bin", op: "^", l, r: unary() }
    }
    return l
  }
  const term = (): Node => {
    let l = power()
    while (isOp("*") || isOp("/")) {
      const op = isOp("*") ? "*" : "/"
      at++
      l = { k: "bin", op, l, r: power() }
    }
    return l
  }
  const additive = (): Node => {
    let l = term()
    while (isOp("+") || isOp("-")) {
      const op = isOp("+") ? "+" : "-"
      at++
      l = { k: "bin", op, l, r: term() }
    }
    return l
  }
  const concat = (): Node => {
    let l = additive()
    while (isOp("&")) {
      at++
      l = { k: "bin", op: "&", l, r: additive() }
    }
    return l
  }
  const compare = (): Node => {
    const l = concat()
    const t = peek()
    if (t?.t === "op" && COMPARE.has(t.v)) {
      at++
      return { k: "bin", op: t.v, l, r: concat() }
    }
    return l
  }

  try {
    const n = compare()
    if (at < tokens.length) fail("Na het einde van de formule staat nog iets wat de formule niet begrijpt.")
    return n
  } catch (e) {
    if (typeof e === "object" && e !== null && "error" in e) return e as FigureError
    throw e
  }
}

/* ── evaluation ──────────────────────────────────────────────────────────────────────────────── */

const ALIAS: Readonly<Record<string, string>> = {
  SUM: "SOM",
  AVERAGE: "GEMIDDELDE",
  COUNT: "AANTAL",
  ROUND: "AFRONDEN",
  IF: "ALS",
  IFERROR: "ALS.FOUT"
}

/** The functions the autocomplete offers, with the way each is written. */
export const FUNCTIONS: ReadonlyArray<{ readonly name: string; readonly hint: string }> = [
  { name: "SOM", hint: "=SOM(B2:B8) telt op" },
  { name: "GEMIDDELDE", hint: "=GEMIDDELDE(B2:B8)" },
  { name: "MIN", hint: "=MIN(B2:B8)" },
  { name: "MAX", hint: "=MAX(B2:B8)" },
  { name: "AANTAL", hint: "=AANTAL(B2:B8) telt de getallen" },
  { name: "AFRONDEN", hint: "=AFRONDEN(B2; 0)" },
  { name: "ABS", hint: "=ABS(B2) zonder minteken" },
  { name: "ALS", hint: "=ALS(B2>0; \"winst\"; \"verlies\")" },
  { name: "ALS.FOUT", hint: "=ALS.FOUT(B2/C2; 0)" },
  { name: "INSYTE", hint: "=INSYTE(\"omzet\"; \"week\") leest een cijfer uit Insyte" }
]

type Many = { readonly many: ReadonlyArray<Value> }
const isMany = (v: Value | Many): v is Many => typeof v === "object" && "many" in v

/**
 * Evaluates the cells of one tab on demand, remembering each value, and stops a cell that leads back
 * to itself with #KRING! rather than spinning. Other tabs are read by name.
 */
export function evaluator(tabs: ReadonlyArray<Tab>, tabId: string) {
  const memo = new Map<string, Value>()
  const busy = new Set<string>()
  const here = tabs.find((t) => t.id === tabId) ?? tabs[0]

  const tabOf = (name: string | undefined, from: Tab | undefined) =>
    name === undefined ? from : tabs.find((t) => t.name.toLowerCase() === name.toLowerCase())

  const cellValue = (tab: Tab, a: string): Value => {
    const key = `${tab.id}!${a}`
    const known = memo.get(key)
    if (known !== undefined) return known
    if (busy.has(key)) return err("#KRING!", `${a} verwijst via andere cellen naar zichzelf.`)
    const cell = tab.cells[a]
    const raw = cell?.v ?? ""
    let out: Value
    if (raw.startsWith("=")) {
      busy.add(key)
      const tokens = tokenize(raw.slice(1))
      const tree = Array.isArray(tokens) ? parse(tokens) : tokens
      out = "k" in tree ? one(run(tree, tab)) : tree
      busy.delete(key)
    } else if (cell?.fmt === "text") out = raw
    else {
      const up = raw.trim().toUpperCase()
      out = up === "WAAR" ? true : up === "ONWAAR" ? false : parseNumber(raw) ?? raw
    }
    memo.set(key, out)
    return out
  }

  const one = (v: Value | Many): Value =>
    isMany(v) ? (v.many.length === 1 ? v.many[0] ?? "" : err("#WAARDE!", "Hier hoort één cel, geen bereik.")) : v

  const num = (v: Value): number | FigureError => {
    if (isError(v)) return v
    if (v === "") return 0
    if (typeof v === "number") return v
    if (typeof v === "boolean") return v ? 1 : 0
    return parseNumber(v) ?? err("#WAARDE!", `‘${v}’ is tekst; hier hoort een getal.`)
  }

  /* An aggregate skips text and empty cells in a range, as spreadsheets do, but stops on an error. */
  const numbers = (vs: ReadonlyArray<Value | Many>): Array<number> | FigureError => {
    const out: Array<number> = []
    for (const v of vs.flatMap((x) => (isMany(x) ? x.many : [x]))) {
      if (isError(v)) return v
      if (typeof v === "number") out.push(v)
      else if (typeof v === "boolean") out.push(v ? 1 : 0)
    }
    return out
  }

  const run = (n: Node, tab: Tab): Value | Many => {
    switch (n.k) {
      case "num":
      case "str":
      case "bool":
        return n.v
      case "ref": {
        const t = tabOf(n.tab, tab)
        if (t === undefined) return err("#VERW!", `Er is geen tabblad ‘${n.tab ?? ""}’.`)
        const p = parseAddr(n.a)
        if (p === null || p.c < 0 || p.c >= COLS || p.r >= ROWS) return err("#VERW!", `${n.a} valt buiten het blad.`)
        return cellValue(t, n.a)
      }
      case "range": {
        const t = tabOf(n.tab, tab)
        if (t === undefined) return err("#VERW!", `Er is geen tabblad ‘${n.tab ?? ""}’.`)
        const a = parseAddr(n.a)
        const b = parseAddr(n.b)
        if (a === null || b === null) return err("#VERW!", `${n.a}:${n.b} is geen bereik.`)
        const many: Array<Value> = []
        for (let r = Math.min(a.r, b.r); r <= Math.max(a.r, b.r); r++) {
          for (let c = Math.min(a.c, b.c); c <= Math.max(a.c, b.c); c++) many.push(cellValue(t, addr(c, r)))
        }
        return { many }
      }
      case "pct": {
        const x = num(one(run(n.x, tab)))
        return isError(x) ? x : x / 100
      }
      case "un": {
        const x = num(one(run(n.x, tab)))
        return isError(x) ? x : -x
      }
      case "bin":
        return binary(n.op, one(run(n.l, tab)), one(run(n.r, tab)))
      case "call":
        return call(n.name, n.args, tab)
    }
  }

  const binary = (op: string, l: Value, r: Value): Value => {
    if (isError(l)) return l
    if (isError(r)) return r
    if (op === "&") return `${show(l, undefined)}${show(r, undefined)}`
    if (COMPARE.has(op)) {
      const text = typeof l === "string" && typeof r === "string" &&
        (parseNumber(l) === null || parseNumber(r) === null)
      const a = text ? String(l).toLowerCase() : num(l)
      const b = text ? String(r).toLowerCase() : num(r)
      if (isError(a)) return a
      if (isError(b)) return b
      if (op === "=") return a === b
      if (op === "<>") return a !== b
      if (op === "<") return a < b
      if (op === ">") return a > b
      if (op === "<=") return a <= b
      return a >= b
    }
    const a = num(l)
    const b = num(r)
    if (isError(a)) return a
    if (isError(b)) return b
    if (op === "+") return a + b
    if (op === "-") return a - b
    if (op === "*") return a * b
    if (op === "^") return a ** b
    if (b === 0) return err("#DEEL/0!", "Hier wordt door nul gedeeld. Staat er in de noemer een lege cel of een 0?")
    return a / b
  }

  const call = (name: string, args: ReadonlyArray<Node>, tab: Tab): Value => {
    const all = () => args.map((a) => run(a, tab))
    const fn = ALIAS[name] ?? name
    switch (fn) {
      case "SOM": {
        const xs = numbers(all())
        return isError(xs) ? xs : xs.reduce((s, x) => s + x, 0)
      }
      case "GEMIDDELDE": {
        const xs = numbers(all())
        if (isError(xs)) return xs
        return xs.length === 0
          ? err("#DEEL/0!", "Er staan geen getallen in het bereik om een gemiddelde van te nemen.")
          : xs.reduce((s, x) => s + x, 0) / xs.length
      }
      case "MIN":
      case "MAX": {
        const xs = numbers(all())
        if (isError(xs)) return xs
        return xs.length === 0 ? 0 : fn === "MIN" ? Math.min(...xs) : Math.max(...xs)
      }
      case "AANTAL": {
        const xs = numbers(all())
        return isError(xs) ? xs : xs.length
      }
      case "AFRONDEN": {
        const [x, d] = all().map(one)
        const a = num(x ?? "")
        const b = num(d ?? 0)
        if (isError(a)) return a
        if (isError(b)) return b
        const f = 10 ** Math.trunc(b)
        return Math.round(a * f) / f
      }
      case "ABS": {
        const a = num(one(all()[0] ?? ""))
        return isError(a) ? a : Math.abs(a)
      }
      case "ALS": {
        const [test, yes, no] = args
        if (test === undefined || yes === undefined) {
          return err("#WAARDE!", "ALS wil een voorwaarde en minstens een uitkomst: =ALS(B2>0; \"ja\"; \"nee\").")
        }
        const c = one(run(test, tab))
        if (isError(c)) return c
        const n = num(c)
        const pass = typeof c === "boolean" ? c : !isError(n) && n !== 0
        return pass ? one(run(yes, tab)) : no === undefined ? false : one(run(no, tab))
      }
      case "ALS.FOUT": {
        const [x, instead] = args
        if (x === undefined) {
          return err("#WAARDE!", "ALS.FOUT wil een formule en wat er anders staat: =ALS.FOUT(B2/C2; 0).")
        }
        const v = one(run(x, tab))
        return isError(v) ? (instead === undefined ? "" : one(run(instead, tab))) : v
      }
      case "INSYTE": {
        const [metric, period] = all().map(one)
        if (typeof metric !== "string") {
          return err(
            "#WAARDE!",
            "INSYTE wil eerst de naam van een cijfer, tussen aanhalingstekens: =INSYTE(\"omzet\"; \"week\")."
          )
        }
        if (period !== undefined && isError(period)) return period
        return insyte(metric, period === undefined || period === "" ? undefined : String(period))
      }
      default:
        return err(
          "#NAAM?",
          `De functie ${name} bestaat niet. Probeer SOM, GEMIDDELDE, MIN, MAX, AANTAL, AFRONDEN, ALS, ALS.FOUT of INSYTE.`
        )
    }
  }

  return { value: (a: string): Value => (here === undefined ? "" : cellValue(here, a)) }
}

/** Moves a formula's relative references by columns and rows, for a paste or a fill; `$` holds one in place. */
export function shift(raw: string, dc: number, dr: number): string {
  if (!raw.startsWith("=") || (dc === 0 && dr === 0)) return raw
  return raw.replace(/("[^"]*")|(\$?)([A-Z])(\$?)(\d{1,3})(?![\w(])/g, (m, str, c$, col, r$, row) => {
    if (str !== undefined) return m
    const c = c$ === "$" ? colIndex(String(col)) : colIndex(String(col)) + dc
    const r = r$ === "$" ? Number(row) : Number(row) + dr
    if (c < 0 || c >= COLUMNS.length || r < 1) return "#VERW!"
    return `${String(c$)}${colName(c)}${String(r$)}${r}`
  })
}

/** Pasted text split into rows and cells, on a tab, a semicolon or a comma, whichever it uses. */
export function fromCsv(text: string): Array<Array<string>> {
  const first = text.split(/\r?\n/)[0] ?? ""
  const sep = first.includes("\t")
    ? "\t"
    : (first.match(/;/g)?.length ?? 0) >= (first.match(/,/g)?.length ?? 0)
    ? ";"
    : ","
  const rows: Array<Array<string>> = []
  let row: Array<string> = []
  let cur = ""
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] ?? ""
    if (quoted) {
      if (ch === "\"" && text[i + 1] === "\"") {
        cur += "\""
        i++
      } else if (ch === "\"") quoted = false
      else cur += ch
    } else if (ch === "\"") quoted = true
    else if (ch === sep) {
      row.push(cur)
      cur = ""
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++
      row.push(cur)
      rows.push(row)
      row = []
      cur = ""
    } else cur += ch
  }
  if (cur !== "" || row.length > 0) {
    row.push(cur)
    rows.push(row)
  }
  return rows
}

/** A value as the cell shows it, in its format. */
export function show(v: Value | undefined, fmt: Fmt | undefined): string {
  if (v === undefined || v === "") return ""
  if (isError(v)) return v.error
  if (typeof v === "boolean") return v ? "WAAR" : "ONWAAR"
  if (typeof v === "string") return v
  switch (fmt) {
    case "money":
      return `€ ${v.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    case "integer":
      return Math.round(v).toLocaleString("nl-NL")
    case "percent":
      return `${(v * 100).toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
    case "number":
      return v.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    default:
      return v.toLocaleString("nl-NL", { maximumFractionDigits: 2 })
  }
}
