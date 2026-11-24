import { insyte } from "../../fixtures/costs.ts"
import type { FigureError } from "../../fixtures/costs.ts"
import { COLUMNS } from "../../fixtures/sheets.ts"
import type { Cell, Fmt } from "../../fixtures/sheets.ts"

/**
 * A small formula engine for Sheets, in the Dutch spreadsheet dialect the original used: `;` between
 * arguments, a decimal comma, `SOM`, `GEMIDDELDE`, `MIN`, `MAX`, `AANTAL`, and `INSYTE("cijfer"; "dag")`
 * for a figure from Kosten and Analyse. Errors carry the reason a person reads under the formula bar.
 */

export type Value = number | string | FigureError
export const isError = (v: Value): v is FigureError => typeof v === "object"

const err = (error: string, why: string): FigureError => ({ error, why })

/** "1.234,50" or "6,95" or "240" → a number, or null when it is text. */
function parseNumber(raw: string): number | null {
  const t = raw.trim().replace(/^€\s*/, "")
  if (!/^-?[\d.]*,?\d+%?$/.test(t)) return null
  const pct = t.endsWith("%")
  const n = Number(t.replace("%", "").replace(/\./g, "").replace(",", "."))
  if (Number.isNaN(n)) return null
  return pct ? n / 100 : n
}

type Token = { readonly t: "num" | "str" | "ref" | "range" | "name" | "op"; readonly v: string }

function tokenize(src: string): Array<Token> | FigureError {
  const out: Array<Token> = []
  let i = 0
  while (i < src.length) {
    const c = src[i] ?? ""
    if (c === " ") {
      i++
      continue
    }
    if (c === "\"") {
      const end = src.indexOf("\"", i + 1)
      if (end < 0) return err("#WAARDE!", "Een tekst tussen aanhalingstekens wordt niet afgesloten.")
      out.push({ t: "str", v: src.slice(i + 1, end) })
      i = end + 1
      continue
    }
    const range = /^([A-Z]+\d+):([A-Z]+\d+)/.exec(src.slice(i))
    if (range !== null) {
      out.push({ t: "range", v: range[0] })
      i += range[0].length
      continue
    }
    const ref = /^[A-Z]+\d+/.exec(src.slice(i))
    if (ref !== null) {
      out.push({ t: "ref", v: ref[0] })
      i += ref[0].length
      continue
    }
    const name = /^[A-Z]+(?=\()/i.exec(src.slice(i))
    if (name !== null) {
      out.push({ t: "name", v: name[0].toUpperCase() })
      i += name[0].length
      continue
    }
    const num = /^\d+(,\d+)?/.exec(src.slice(i))
    if (num !== null) {
      out.push({ t: "num", v: num[0].replace(",", ".") })
      i += num[0].length
      continue
    }
    if ("+-*/();".includes(c)) {
      out.push({ t: "op", v: c })
      i++
      continue
    }
    return err("#NAAM?", `Het teken ‘${c}’ kent de formule niet.`)
  }
  return out
}

/** Every cell address in a range, row by row. */
function cellsIn(range: string): ReadonlyArray<string> {
  const [a, b] = range.split(":")
  const pa = /^([A-Z]+)(\d+)$/.exec(a ?? "")
  const pb = /^([A-Z]+)(\d+)$/.exec(b ?? "")
  if (pa === null || pb === null) return []
  const c1 = COLUMNS.indexOf(pa[1] ?? "A")
  const c2 = COLUMNS.indexOf(pb[1] ?? "A")
  const r1 = Number(pa[2])
  const r2 = Number(pb[2])
  const out: Array<string> = []
  for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
    for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) out.push(`${COLUMNS[c] ?? "A"}${r}`)
  }
  return out
}

type Arg = Value | ReadonlyArray<Value>

/** Evaluates one tab: every cell's value, formulas resolved in order, cycles caught. */
export function evaluate(cells: Readonly<Record<string, Cell>>): Readonly<Record<string, Value>> {
  const done: Record<string, Value> = {}
  const busy = new Set<string>()

  const valueOf = (key: string): Value => {
    if (key in done) return done[key] ?? ""
    const cell = cells[key]
    if (cell === undefined || cell.v === "") return ""
    if (busy.has(key)) return err("#KRING!", `${key} verwijst via andere cellen naar zichzelf.`)
    busy.add(key)
    const out = cell.v.startsWith("=") ? formula(cell.v.slice(1)) : parseNumber(cell.v) ?? cell.v
    busy.delete(key)
    done[key] = out
    return out
  }

  const formula = (src: string): Value => {
    const tokens = tokenize(src)
    if (!Array.isArray(tokens)) return tokens
    let at = 0
    const peek = () => tokens[at]
    const take = () => tokens[at++]

    const num = (v: Value): number | FigureError => {
      if (isError(v)) return v
      if (typeof v === "number") return v
      if (v === "") return 0
      return err("#WAARDE!", `‘${v}’ is tekst, geen getal.`)
    }

    const primary = (): Arg => {
      const tok = take()
      if (tok === undefined) return err("#WAARDE!", "De formule houdt te vroeg op.")
      if (tok.t === "num") return Number(tok.v)
      if (tok.t === "str") return tok.v
      if (tok.t === "ref") return valueOf(tok.v)
      if (tok.t === "range") return cellsIn(tok.v).map(valueOf)
      if (tok.t === "op" && tok.v === "-") {
        const v = primary()
        if (Array.isArray(v)) return err("#WAARDE!", "Een bereik kan niet negatief zijn.")
        const n = num(v as Value)
        return isError(n) ? n : -n
      }
      if (tok.t === "op" && tok.v === "(") {
        const v = expr()
        if (take()?.v !== ")") return err("#WAARDE!", "Er ontbreekt een sluithaakje.")
        return v
      }
      if (tok.t === "name") {
        take() // (
        const args: Array<Arg> = []
        while (peek() !== undefined && peek()?.v !== ")") {
          args.push(expr())
          if (peek()?.v === ";") take()
          else break
        }
        if (take()?.v !== ")") return err("#WAARDE!", `Er ontbreekt een sluithaakje na ${tok.v}.`)
        return call(tok.v, args)
      }
      return err("#WAARDE!", `‘${tok.v}’ staat op een plek waar een getal hoort.`)
    }

    const term = (): Arg => {
      let left = primary()
      while (peek()?.v === "*" || peek()?.v === "/") {
        const op = take()?.v
        const right = primary()
        if (Array.isArray(left) || Array.isArray(right)) {
          return err("#WAARDE!", "Een bereik hoort in een functie, zoals SOM.")
        }
        const a = num(left as Value)
        const b = num(right as Value)
        if (isError(a)) return a
        if (isError(b)) return b
        if (op === "/" && b === 0) return err("#DEEL/0!", "Er wordt gedeeld door nul of door een lege cel.")
        left = op === "*" ? a * b : a / b
      }
      return left
    }

    const expr = (): Arg => {
      let left = term()
      while (peek()?.v === "+" || peek()?.v === "-") {
        const op = take()?.v
        const right = term()
        if (Array.isArray(left) || Array.isArray(right)) {
          return err("#WAARDE!", "Een bereik hoort in een functie, zoals SOM.")
        }
        const a = num(left as Value)
        const b = num(right as Value)
        if (isError(a)) return a
        if (isError(b)) return b
        left = op === "+" ? a + b : a - b
      }
      return left
    }

    const result = expr()
    if (at < tokens.length) {
      return err("#WAARDE!", `Na ‘${tokens[at - 1]?.v ?? ""}’ komt nog iets wat de formule niet begrijpt.`)
    }
    if (Array.isArray(result)) return err("#WAARDE!", "Een bereik hoort in een functie, zoals SOM.")
    return result as Value
  }

  const numbers = (args: ReadonlyArray<Arg>): Array<number> | FigureError => {
    const out: Array<number> = []
    for (const a of args.flatMap((x) => (Array.isArray(x) ? x : [x])) as ReadonlyArray<Value>) {
      if (isError(a)) return a
      if (typeof a === "number") out.push(a)
    }
    return out
  }

  const call = (name: string, args: ReadonlyArray<Arg>): Value => {
    if (name === "INSYTE") {
      const [metric, period] = args
      if (typeof metric !== "string") {
        return err("#WAARDE!", "INSYTE wil een cijfer tussen aanhalingstekens, zoals \"omzet\".")
      }
      return insyte(metric, typeof period === "string" ? period : undefined)
    }
    const ns = numbers(args)
    if (!Array.isArray(ns)) return ns
    switch (name) {
      case "SOM":
        return ns.reduce((a, b) => a + b, 0)
      case "GEMIDDELDE":
        return ns.length === 0
          ? err("#DEEL/0!", "Er zijn geen getallen om het gemiddelde van te nemen.")
          : ns.reduce((a, b) => a + b, 0) / ns.length
      case "MIN":
        return ns.length === 0 ? 0 : Math.min(...ns)
      case "MAX":
        return ns.length === 0 ? 0 : Math.max(...ns)
      case "AANTAL":
        return ns.length
      default:
        return err("#NAAM?", `De functie ${name} bestaat niet. Probeer SOM, GEMIDDELDE, MIN, MAX, AANTAL of INSYTE.`)
    }
  }

  for (const key of Object.keys(cells)) valueOf(key)
  return done
}

/** A value as the cell shows it, in its format. */
export function show(v: Value | undefined, fmt: Fmt | undefined): string {
  if (v === undefined || v === "") return ""
  if (isError(v)) return v.error
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
