import { getRouteApi } from "@tanstack/react-router"
import type { ColumnDef } from "@tanstack/react-table"
import { useMemo } from "react"
import { Download } from "../../icons"
import { PageHeader } from "../common/page-header"
import { formatCurrency } from "../lib/format"
import { type Statement, STATEMENT_STATUS, type StatementLine } from "../lib/supplier-statements"
import { ME_SUPPLIER } from "../lib/supplier-work"
import { cn } from "../lib/utils"
import { StatusPill } from "../settings/setting-card"
import { DataTable } from "../table/data-table"

const Route = getRouteApi("/_supplier/supplier/statements/$month")

const day = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", timeZone: "UTC" })
const long = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })

/** One month's statement, line by line, and the invoice for it. */
export function StatementPage() {
  const { s } = Route.useLoaderData()
  const columns = useMemo<Array<ColumnDef<StatementLine, unknown>>>(
    () => [
      {
        id: "order",
        accessorKey: "order",
        header: "Bestelling",
        size: 120,
        cell: (c) => <span className="font-medium text-ink tabular-nums">{c.row.original.order}</span>
      },
      {
        id: "day",
        accessorKey: "day",
        header: "Dag",
        size: 90,
        cell: (c) => <span className="tabular-nums">{day.format(new Date(`${c.row.original.day}T12:00:00Z`))}</span>
      },
      {
        id: "title",
        accessorKey: "title",
        header: "Artikel",
        cell: (c) => (
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate">{c.row.original.title}</span>
            {c.row.original.kind === "correction" ?
              (
                <span className="shrink-0 rounded-sm bg-signal-amber-bg px-1.5 py-0.5 font-medium text-signal-amber text-xs">
                  Correctie · {c.row.original.reason}
                </span>
              ) :
              null}
          </span>
        )
      },
      {
        id: "qty",
        accessorKey: "qty",
        header: "Aantal",
        size: 80,
        cell: (c) => <span className="tabular-nums">{c.row.original.qty}</span>
      },
      {
        id: "unit",
        accessorKey: "unit",
        header: "Kostprijs",
        size: 100,
        cell: (c) => <span className="tabular-nums">{formatCurrency(c.row.original.unit)}</span>
      },
      {
        id: "total",
        accessorKey: "total",
        header: "Bedrag",
        size: 110,
        cell: (c) => (
          <span className={cn("font-medium tabular-nums", c.row.original.total < 0 ? "text-signal-red" : "text-ink")}>
            {formatCurrency(c.row.original.total)}
          </span>
        )
      }
    ],
    []
  )

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        title={s.label}
        crumbs={[{ label: "Afrekeningen", to: "/supplier/statements" }]}
        meta={<StatusPill tone={STATEMENT_STATUS[s.status].tone} label={STATEMENT_STATUS[s.status].label} />}
        actions={
          <button
            type="button"
            onClick={() => downloadInvoice(s)}
            className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-abyss px-3 font-medium text-mesh-ink text-sm shadow-primary hover:bg-abyss-2"
          >
            <Download className="size-3.5" strokeWidth={1.75} />
            Factuur downloaden
          </button>
        }
      />
      <div className="flex min-w-0 flex-col gap-6 px-5 pb-10">
        <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
          {[
            ["Verzonden", formatCurrency(s.shipped)],
            ["Correcties", formatCurrency(s.corrections)],
            ["Totaal", formatCurrency(s.total)],
            [s.status === "paid" ? "Betaald op" : "Betaling op", long.format(new Date(`${s.payDay}T12:00:00Z`))]
          ].map(([k, v]) => (
            <div key={k} className="flex flex-col gap-1">
              <dt className="text-ink-3 text-sm">{k}</dt>
              <dd className="figure text-3xl text-ink">{v}</dd>
            </div>
          ))}
        </dl>
        <DataTable
          columns={columns}
          data={s.lines}
          noun={["line", "lines"]}
          label={["regel", "regels"]}
          getRowId={(l) => `${l.order}-${l.kind}`}
          searchPlaceholder="Zoek een bestelling of artikel"
          pageSize={25}
        />
      </div>
    </div>
  )
}

/** The invoice as a file the supplier keeps: from the supplier to Northwind, with every line. */
function downloadInvoice(s: Statement) {
  const esc = (x: string) =>
    x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[c] ?? c)
  const usd = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "USD" }).format(n)
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
