import type { ColumnDef } from "@tanstack/react-table"
import { useMemo } from "react"
import { PageHeader } from "../common/page-header"
import { StatusPill } from "../settings/setting-card"
import { DataTable } from "../table/data-table"
import { STATEMENT_STATUS, type StatementView, useStatementsSource } from "./statements-source"

const day = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", timeZone: "UTC" })

/*
 * What the brand owes the supplier, per month: shipped lines at cost, less the returns that were
 * the supplier's fault. The month being processed leads; the rest is the record. Read from the host's
 * source (`statements-source.tsx`): the supplier's demo history in the design app, the server in the console.
 */
export function SupplierStatements() {
  const { rows: all, meta, crumbs, paidThisYear: year, money, open, empty } = useStatementsSource()
  const current = all.find((s) => s.status === "processing")

  const columns = useMemo<Array<ColumnDef<StatementView, unknown>>>(
    () => [
      {
        id: "label",
        accessorKey: "label",
        header: "Maand",
        cell: (c) => <span className="font-medium text-ink">{c.row.original.label}</span>
      },
      {
        id: "lines",
        accessorKey: "shippedLines",
        header: "Verzonden regels",
        size: 140,
        cell: (c) => <span className="tabular-nums">{Number(c.getValue()).toLocaleString("nl-NL")}</span>
      },
      {
        id: "shipped",
        accessorKey: "shipped",
        header: "Verzonden",
        size: 130,
        cell: (c) => <span className="tabular-nums">{money(c.row.original.shipped)}</span>
      },
      {
        id: "corrections",
        accessorKey: "corrections",
        header: "Correcties",
        size: 120,
        cell: (c) => <span className="text-ink-2 tabular-nums">{money(c.row.original.corrections)}</span>
      },
      {
        id: "total",
        accessorKey: "total",
        header: "Totaal",
        size: 130,
        cell: (c) => <span className="font-medium text-ink tabular-nums">{money(c.row.original.total)}</span>
      },
      {
        id: "status",
        accessorKey: "status",
        header: "Status",
        size: 200,
        cell: (c) => (
          <span className="flex items-center gap-2">
            <StatusPill
              tone={STATEMENT_STATUS[c.row.original.status].tone}
              label={STATEMENT_STATUS[c.row.original.status].label}
            />
            <span className="text-ink-3 text-sm">{day.format(new Date(`${c.row.original.payDay}T12:00:00Z`))}</span>
          </span>
        )
      }
    ],
    [money]
  )

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader title="Afrekeningen" crumbs={crumbs} meta={meta} />
      <div className="flex min-w-0 flex-col gap-8 px-5 pb-10">
        {current ?
          (
            <section
              aria-labelledby="current-title"
              className="grid gap-6 rounded-xl bg-mist px-6 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
            >
              <div className="flex flex-col gap-1.5">
                <h2 id="current-title" className="text-ink-2 text-sm">
                  {current.label} · wordt verwerkt
                </h2>
                <p className="figure text-5xl text-ink">{money(current.total)}</p>
                <p className="text-ink-3 text-sm">
                  {current.shippedLines.toLocaleString("nl-NL")} verzonden regels,{" "}
                  {money(Math.abs(current.corrections))} aan correcties. Betaling op{" "}
                  {day.format(new Date(`${current.payDay}T12:00:00Z`))}.
                </p>
              </div>
              <dl className="flex gap-8 text-sm">
                <div className="flex flex-col gap-0.5">
                  <dt className="text-ink-3">Betaald dit jaar</dt>
                  <dd className="font-medium text-base text-ink tabular-nums">{money(year)}</dd>
                </div>
              </dl>
            </section>
          ) :
          null}
        <DataTable
          columns={columns}
          data={all}
          noun={["statement", "statements"]}
          label={["afrekening", "afrekeningen"]}
          getRowId={(s) => s.id}
          searchPlaceholder="Zoek een maand"
          empty={empty}
          onRowClick={open}
        />
      </div>
    </div>
  )
}
