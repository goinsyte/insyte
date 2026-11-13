import type { StatementLine, StatementRow } from "./Statements.ts"

/*
 * A supplier statement as a file (M13 step 6): the design's "Factuur downloaden" (`supplier/statement-screen.tsx`), made
 * once at the close and kept. From the supplier to the brand, every line, the total, the pay day; in the statement's
 * currency, not the demo's dollars. Escaped; no customer data, only order numbers.
 */

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[c] ?? c)

const monthLabel = (month: string) => {
  const label = new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${month}-15T12:00:00Z`))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

const longDay = (day: string) =>
  new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${day}T12:00:00Z`))

const MISSING = { cost: "kostprijs ontbreekt", rate: "wisselkoers ontbreekt" } as const

export const statementHtml = (input: {
  readonly brand: string
  readonly statement: StatementRow
  readonly lines: ReadonlyArray<StatementLine>
}) => {
  const { statement: s } = input
  const money = (minor: number) =>
    new Intl.NumberFormat("nl-NL", { style: "currency", currency: s.currency }).format(minor / 100)
  const rows = input.lines
    .map((l) => {
      const note = l.kind === "correction"
        ? ` (correctie${l.reason === null ? "" : `: ${esc(l.reason)}`})`
        : ""
      const missing = l.missing === null ? "" : ` (${MISSING[l.missing]})`
      return `<tr><td>${esc(l.orderNumber)}</td><td>${esc(l.title)}${note}${missing}</td><td>${l.qty}</td><td>${
        l.unitCostMinor === null ? "—" : money(l.unitCostMinor)
      }</td><td>${money(l.totalMinor)}</td></tr>`
    })
    .join("")
  const label = monthLabel(s.month)
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>Factuur ${
    esc(label)
  }</title><style>body{font:13px/1.5 system-ui,sans-serif;margin:40px;color:#111}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #ddd}td:nth-child(n+3),th:nth-child(n+3){text-align:right}h1{font-size:20px;margin:0}.tot{font-size:16px;font-weight:600;text-align:right;margin-top:16px}.sub{color:#555;text-align:right;margin:4px 0 0}</style></head><body><h1>Factuur · ${
    esc(label)
  }</h1><p>Van ${esc(s.supplierName)} aan ${esc(input.brand)}<br>Te betalen op ${
    longDay(s.payDay)
  }</p><table><thead><tr><th>Bestelling</th><th>Artikel</th><th>Aantal</th><th>Kostprijs</th><th>Bedrag</th></tr></thead><tbody>${rows}</tbody></table><p class="sub">Verzonden ${
    money(s.shippedMinor)
  } · Correcties ${money(s.correctionsMinor)}</p><p class="tot">Totaal ${money(s.totalMinor)}</p></body></html>`
}
