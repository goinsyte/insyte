import type { ColumnDef } from "@tanstack/react-table"
import { useMemo } from "react"
import { Check, Download } from "../../icons"
import { PageHeader } from "../common/page-header"
import { cn } from "../lib/utils"
import { StatusPill } from "../settings/setting-card"
import { DataTable } from "../table/data-table"
import { STATEMENT_STATUS, type StatementLineView, useStatementSource } from "./statements-source"

const day = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", timeZone: "UTC" })
const long = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })

const MISSING = { cost: "Kostprijs ontbreekt", rate: "Koers ontbreekt" } as const

/**
 * One month's statement, line by line, and the invoice for it; where the host pays it (the brand), "Als betaald
 * markeren". Read from the host's source (`statements-source.tsx`).
 */
export function StatementPage() {
  const { statement: s, lines, crumbs, money, download, pay } = useStatementSource()
  const columns = useMemo<Array<ColumnDef<StatementLineView, unknown>>>(
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
            {c.row.original.missing ?
              (
                <span className="shrink-0 rounded-sm bg-signal-amber-bg px-1.5 py-0.5 font-medium text-signal-amber text-xs">
                  {MISSING[c.row.original.missing]}
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
        cell: (c) => (
          <span className="tabular-nums">{c.row.original.unit === null ? "—" : money(c.row.original.unit)}</span>
        )
      },
      {
        id: "total",
        accessorKey: "total",
        header: "Bedrag",
        size: 110,
        cell: (c) => (
          <span className={cn("font-medium tabular-nums", c.row.original.total < 0 ? "text-signal-red" : "text-ink")}>
            {money(c.row.original.total)}
          </span>
        )
      }
    ],
    [money]
  )

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        title={s.label}
        crumbs={crumbs}
        meta={<StatusPill tone={STATEMENT_STATUS[s.status].tone} label={STATEMENT_STATUS[s.status].label} />}
        actions={
          <span className="flex items-center gap-2">
            {pay && s.status === "processing" ?
              (
                <button
                  type="button"
                  disabled={!pay.ok || pay.busy}
                  title={pay.ok ? undefined : pay.reason}
                  onClick={pay.run}
                  className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-3 font-medium text-ink-2 text-sm transition-colors hover:bg-ink/6 hover:text-ink disabled:cursor-not-allowed disabled:text-ink-4 disabled:hover:bg-transparent"
                >
                  <Check className="size-3.5" strokeWidth={1.75} />
                  {pay.busy ? "Bezig…" : "Als betaald markeren"}
                </button>
              ) :
              null}
            <button
              type="button"
              disabled={!("run" in download)}
              title={"run" in download ? undefined : download.reason}
              onClick={"run" in download ? download.run : undefined}
              className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-abyss px-3 font-medium text-mesh-ink text-sm shadow-primary hover:bg-abyss-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-abyss"
            >
              <Download className="size-3.5" strokeWidth={1.75} />
              Factuur downloaden
            </button>
          </span>
        }
      />
      <div className="flex min-w-0 flex-col gap-6 px-5 pb-10">
        <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
          {[
            ["Verzonden", money(s.shipped)],
            ["Correcties", money(s.corrections)],
            ["Totaal", money(s.total)],
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
          data={lines}
          noun={["line", "lines"]}
          label={["regel", "regels"]}
          getRowId={(l) => l.id}
          searchPlaceholder="Zoek een bestelling of artikel"
          pageSize={25}
        />
      </div>
    </div>
  )
}
