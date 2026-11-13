import { getRouteApi, useNavigate } from "@tanstack/react-router"
import type { ColumnDef } from "@tanstack/react-table"
import { useMemo, useState } from "react"
import { AlertTriangle, Check, Download, FileText, Truck } from "../../icons"
import { EmptyState } from "../common/empty-state"
import { PageHeader } from "../common/page-header"
import { counted, exportCsv } from "../lib/bulk"
import { countryFlag, countryName } from "../lib/format-flag"
import { inSupplierView, type SupplierView } from "../lib/supplier-views"
import { STATUS_LABEL } from "../lib/supplier-work"
import { DataTable, type Facet, facetFilter, type RowAction } from "../table/data-table"
import { ProblemDialog } from "./problem-dialog"
import { ShipDialog } from "./ship-dialog"
import { type SupplierOrderRow, useSupplierPortal } from "./source"
import { DueCell, SupplierStatusChip } from "./status"

const Route = getRouteApi("/_supplier/supplier/orders/")

const TITLE: Record<SupplierView, string> = {
  to_accept: "Te accepteren",
  to_ship: "Te verzenden",
  late: "Te laat",
  problem: "Probleem gemeld",
  shipped: "Verzonden",
  all: "Alle bestellingen"
}

const FACETS: ReadonlyArray<Facet> = [
  {
    id: "status",
    label: "Status",
    options: (["to_accept", "to_ship", "problem", "shipped", "closed"] as const).map((s) => ({
      value: s,
      label: STATUS_LABEL[s]
    }))
  }
]

/*
 * The supplier's orders: only its own lines, what the brand pays for them, and where they go. The
 * list is cut by the area panel (to accept, to ship, late, problem, shipped) and worked in bulk:
 * accept, ship with tracking, packing slips, a problem reported. The brand sees every change.
 */
export function SupplierOrders() {
  const navigate = useNavigate()
  const view: SupplierView = Route.useSearch().view ?? "to_ship"
  const { brand, money, useOrders, accept, packingSlips } = useSupplierPortal()
  const all = useOrders()
  const rows = useMemo(() => all.filter((r) => inSupplierView(r, view)), [all, view])
  const [shipping, setShipping] = useState<ReadonlyArray<SupplierOrderRow> | null>(null)
  const [problem, setProblem] = useState<SupplierOrderRow | null>(null)

  const standing = useMemo(() => {
    const n = (v: SupplierView) => all.filter((r) => inSupplierView(r, v)).length
    return `${n("to_accept")} te accepteren · ${n("to_ship")} te verzenden · ${n("late")} te laat`
  }, [all])

  const columns = useMemo<Array<ColumnDef<SupplierOrderRow, unknown>>>(
    () => [
      {
        id: "number",
        accessorKey: "number",
        header: "Bestelling",
        size: 110,
        enableHiding: false,
        cell: (c) => <span className="font-medium text-ink tabular-nums">{c.row.original.number}</span>
      },
      {
        id: "handoff",
        accessorFn: (r) => r.handoff.toISOString(),
        header: "Overdragen vóór",
        size: 170,
        cell: (c) => <DueCell row={c.row.original} />
      },
      {
        id: "lines",
        accessorFn: (r) => r.lines.map((l) => l.title).join(" "),
        header: "Jouw artikelen",
        cell: (c) => {
          const [first, ...more] = c.row.original.lines
          return (
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-ink-2">
                {first?.quantity}× {first?.title}
                {first?.variantTitle ? ` · ${first.variantTitle}` : ""}
              </span>
              {more.length > 0
                ? <span className="shrink-0 rounded-sm bg-ink/6 px-1 text-ink-3 text-xs">+{more.length}</span>
                : null}
            </span>
          )
        }
      },
      {
        id: "to",
        accessorFn: (r) => `${r.city} ${countryName(r.country)}`,
        header: "Naar",
        size: 170,
        cell: (c) => (
          <span className="truncate text-ink-2">
            {countryFlag(c.row.original.country)} {c.row.original.city}
          </span>
        )
      },
      {
        id: "status",
        accessorKey: "status",
        header: "Status",
        size: 150,
        filterFn: facetFilter,
        cell: (c) => <SupplierStatusChip status={c.row.original.status} />
      },
      {
        id: "amount",
        accessorKey: "amount",
        header: "Jouw bedrag",
        size: 110,
        cell: (c) => (
          <span className="tabular-nums">
            {c.row.original.costMissing && c.row.original.amount === 0 ? "—" : money(c.row.original.amount)}
          </span>
        )
      }
    ],
    [money]
  )

  const actions = useMemo<ReadonlyArray<RowAction<SupplierOrderRow>>>(
    () => [
      {
        id: "accept",
        label: "Accepteren",
        icon: Check,
        bar: true,
        shortcut: "a",
        applies: (r) => r.status === "to_accept",
        run: (rs) => {
          accept(rs, { message: `${counted(rs.length, "bestelling", "bestellingen")} geaccepteerd` })
        }
      },
      {
        id: "ship",
        label: "Markeren als verzonden",
        icon: Truck,
        bar: true,
        shortcut: "v",
        applies: (r) => r.status === "to_ship" || r.status === "to_accept" || r.status === "problem",
        run: (rs) => setShipping(rs)
      },
      {
        id: "slips",
        label: "Pakbonnen downloaden",
        icon: FileText,
        bar: true,
        shortcut: "p",
        applies: (r) => r.status !== "closed",
        run: (rs) => packingSlips(rs)
      },
      {
        id: "problem",
        label: "Probleem melden",
        icon: AlertTriangle,
        group: "Bestelling",
        applies: (r) => r.status === "to_accept" || r.status === "to_ship",
        run: (rs) => setProblem(rs[0] ?? null)
      },
      {
        id: "export",
        label: "Exporteren als CSV",
        icon: Download,
        group: "Exporteren",
        run: (rs) =>
          exportCsv(
            "bestellingen",
            ["bestelling", "overdragen_voor", "artikel", "aantal", "variant", "plaats", "land", "status"],
            rs.flatMap((r) =>
              r.lines.map((
                l
              ) => [
                r.number,
                r.handoff.toISOString().slice(0, 10),
                l.title,
                String(l.quantity),
                l.variantTitle ?? "",
                r.city,
                r.country,
                STATUS_LABEL[r.status]
              ])
            )
          )
      }
    ],
    [accept, packingSlips]
  )

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        title={TITLE[view]}
        crumbs={view === "to_ship" ? [] : [{ label: "Bestellingen", to: "/supplier/orders" }]}
        meta={standing}
      />
      <div className="min-w-0 px-5 pb-6">
        <DataTable
          columns={columns}
          data={rows}
          facets={view === "all" ? FACETS : []}
          actions={actions}
          selectable
          noun={["order", "orders"]}
          getRowId={(r) => r.id}
          searchPlaceholder="Zoek op bestelling, artikel of plaats"
          initialSorting={[{ id: "handoff", desc: false }]}
          onRowClick={(r) => navigate({ to: "/supplier/orders/$orderId", params: { orderId: r.id } })}
          empty={
            <EmptyState
              kind="orders"
              title={view === "to_accept"
                ? "Niets te accepteren."
                : view === "late"
                ? "Niets te laat."
                : view === "problem"
                ? "Geen problemen gemeld."
                : "Hier staat niets."}
              body={view === "to_accept"
                ? `Nieuwe bestellingen van ${brand} verschijnen hier zodra ze betaald zijn.`
                : `Alles wat ${brand} je stuurt, staat onder Alle bestellingen.`}
            />
          }
        />
      </div>
      <ShipDialog rows={shipping ?? []} open={shipping !== null} onOpenChange={(v) => !v && setShipping(null)} />
      <ProblemDialog row={problem} open={problem !== null} onOpenChange={(v) => !v && setProblem(null)} />
    </div>
  )
}
