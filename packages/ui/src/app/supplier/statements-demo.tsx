import { getRouteApi, useNavigate } from "@tanstack/react-router"
import { useMemo } from "react"
import { formatCurrency } from "../lib/format"
import { type Statement, statementsFor } from "../lib/supplier-statements"
import { ME_SUPPLIER } from "../lib/supplier-work"
import { StatementPage } from "./statement-screen"
import { SupplierStatements } from "./statements-screen"
import {
  type StatementSource,
  StatementSourceProvider,
  type StatementsSource,
  StatementsSourceProvider,
  type StatementView
} from "./statements-source"

/*
 * The statements pages in the design app: the supplier's own, read from its demo history (`lib/supplier-statements.ts`)
 * in the demo's dollars, with the invoice made in the browser. The console reads the brand's side from the server.
 */

const money = (amount: number) => formatCurrency(amount)

const long = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })

const viewOf = (s: Statement): StatementView => ({
  id: s.id,
  label: s.label,
  shippedLines: s.lines.filter((l) => l.kind === "shipped").length,
  shipped: s.shipped,
  corrections: s.corrections,
  total: s.total,
  status: s.status,
  payDay: s.payDay
})

export function DemoSupplierStatements() {
  const navigate = useNavigate()
  const source = useMemo<StatementsSource>(() => {
    const all = statementsFor(ME_SUPPLIER.id)
    return {
      meta: "Northwind betaalt op de 15e voor de maand ervoor",
      rows: all.map(viewOf),
      paidThisYear: all.filter((s) => s.status === "paid").reduce((n, s) => n + s.total, 0),
      money,
      open: (s) => void navigate({ to: "/supplier/statements/$month", params: { month: s.id } })
    }
  }, [navigate])
  return (
    <StatementsSourceProvider value={source}>
      <SupplierStatements />
    </StatementsSourceProvider>
  )
}

const Route = getRouteApi("/_supplier/supplier/statements/$month")

export function DemoStatementPage() {
  const { s } = Route.useLoaderData()
  const source = useMemo<StatementSource>(() => ({
    statement: viewOf(s),
    lines: s.lines.map((l) => ({ ...l, id: `${l.order}-${l.kind}`, unit: l.unit })),
    crumbs: [{ label: "Afrekeningen", to: "/supplier/statements" }],
    money,
    download: { run: () => downloadInvoice(s) }
  }), [s])
  return (
    <StatementSourceProvider value={source}>
      <StatementPage />
    </StatementSourceProvider>
  )
}

const esc = (x: string) =>
  x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[c] ?? c)
const usd = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "USD" }).format(n)

/** The invoice as a file the supplier keeps: from the supplier to Northwind, with every line. */
function downloadInvoice(s: Statement) {
  const rows = s.lines.map((l) =>
    `<tr><td>${esc(l.order)}</td><td>${esc(l.title)}${
      l.kind === "correction" ? ` (correctie: ${esc(l.reason ?? "")})` : ""
    }</td><td>${l.qty}</td><td>${usd(l.unit)}</td><td>${usd(l.total)}</td></tr>`
  ).join("")
  const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>Factuur ${
    esc(s.label)
  }</title><style>body{font:13px/1.5 system-ui,sans-serif;margin:40px;color:#111}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #ddd}td:nth-child(n+3),th:nth-child(n+3){text-align:right}h1{font-size:20px;margin:0}.tot{font-size:16px;font-weight:600;text-align:right;margin-top:16px}</style></head><body><h1>Factuur · ${
    esc(s.label)
  }</h1><p>Van ${esc(ME_SUPPLIER.name)} aan Northwind Clothing Co.<br>Te betalen op ${
    long.format(new Date(`${s.payDay}T12:00:00Z`))
  }</p><table><thead><tr><th>Bestelling</th><th>Artikel</th><th>Aantal</th><th>Kostprijs</th><th>Bedrag</th></tr></thead><tbody>${rows}</tbody></table><p class="tot">Totaal ${
    usd(s.total)
  }</p></body></html>`
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }))
  const a = document.createElement("a")
  a.href = url
  a.download = `factuur-${s.id}.html`
  a.click()
  URL.revokeObjectURL(url)
}
