import { getRouteApi, useNavigate } from "@tanstack/react-router"
import type { ColumnDef } from "@tanstack/react-table"
import { useMemo } from "react"
import { Download } from "../../icons"
import { EmptyState } from "../common/empty-state"
import { PageHeader } from "../common/page-header"
import { exportCsv } from "../lib/bulk-io"
import { INDICATOR_LABEL } from "../lib/supplier-products"
import { cn } from "../lib/utils"
import { ProductThumb } from "../product/product-thumb"
import { DataTable, type RowAction } from "../table/data-table"
import type { VIEWS } from "./products-search"
import { type SupplierProductRow as Row, useSupplierPortal } from "./source"

const Route = getRouteApi("/_supplier/supplier/products/")
type View = (typeof VIEWS)[number]

const TITLE: Record<View, string> = { all: "Producten", low: "Lage voorraad", out: "Uitverkocht" }
const STOCK: Record<Row["stock"], { label: string; tone: string }> = {
  available: { label: "Op voorraad", tone: "bg-ink/6 text-ink-2" },
  low: { label: "Lage voorraad", tone: "bg-signal-amber-bg text-signal-amber" },
  out: { label: "Uitverkocht", tone: "bg-signal-red-bg text-signal-red" }
}

/*
 * What the supplier makes for the brand: stock per product, the lead time it promises, how it
 * reports stock and what it uploaded. No shelf prices — those are the brand's.
 */
export function SupplierProducts() {
  const navigate = useNavigate()
  const view: View = Route.useSearch().view ?? "all"
  const { brand, useProducts } = useSupplierPortal()
  const all = useProducts()
  const rows = useMemo(
    () => all.filter((r) => (view === "low" ? r.stock === "low" : view === "out" ? r.stock === "out" : true)),
    [all, view]
  )

  const columns = useMemo<Array<ColumnDef<Row, unknown>>>(
    () => [
      {
        id: "title",
        accessorKey: "title",
        header: "Product",
        enableHiding: false,
        cell: (c) => (
          <span className="flex items-center gap-2.5">
            <ProductThumb src={c.row.original.image} title={c.row.original.title} size={32} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium text-ink">{c.row.original.title}</span>
              <span className="truncate text-ink-3 text-xs">
                {c.row.original.variants} {c.row.original.variants === 1 ? "variant" : "varianten"}
                {c.row.original.media > 0
                  ? ` · ${c.row.original.media} ${c.row.original.media === 1 ? "bestand" : "bestanden"}`
                  : ""}
              </span>
            </span>
          </span>
        )
      },
      {
        id: "units",
        accessorKey: "units",
        header: "Voorraad",
        size: 180,
        cell: (c) => (
          <span className="flex items-center gap-2">
            <span className="w-10 text-right font-medium text-ink tabular-nums">
              {c.row.original.units.toLocaleString("nl-NL")}
            </span>
            <span className={cn("rounded-full px-2 py-0.5 font-medium text-xs", STOCK[c.row.original.stock].tone)}>
              {STOCK[c.row.original.stock].label}
            </span>
          </span>
        )
      },
      {
        id: "open",
        accessorKey: "open",
        header: "In open bestellingen",
        size: 150,
        cell: (c) => <span className="tabular-nums">{c.row.original.open}</span>
      },
      {
        id: "lead",
        accessorKey: "lead",
        header: "Levertijd",
        size: 110,
        cell: (c) => (
          <span className="tabular-nums">{c.row.original.lead} {c.row.original.lead === 1 ? "dag" : "dagen"}</span>
        )
      },
      { id: "mode", accessorFn: (r) => INDICATOR_LABEL[r.mode].label, header: "Voorraad melden", size: 170 }
    ],
    []
  )

  const actions = useMemo<ReadonlyArray<RowAction<Row>>>(
    () => [
      {
        id: "export",
        label: "Voorraad exporteren",
        icon: Download,
        bar: true,
        run: (rs) =>
          exportCsv("voorraad", ["product", "voorraad", "levertijd_dagen"], rs.map((r) => [r.title, r.units, r.lead]))
      }
    ],
    []
  )

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        title={TITLE[view]}
        crumbs={view === "all" ? [] : [{ label: "Producten", to: "/supplier/products" }]}
        meta={`${rows.length} ${rows.length === 1 ? "product" : "producten"} voor ${brand}`}
      />
      <div className="min-w-0 px-5 pb-6">
        <DataTable
          columns={columns}
          data={rows}
          actions={actions}
          selectable
          noun={["product", "products"]}
          getRowId={(r) => r.id}
          searchPlaceholder="Zoek een product"
          initialSorting={[{ id: "units", desc: false }]}
          onRowClick={(r) => navigate({ to: "/supplier/products/$productId", params: { productId: r.id } })}
          empty={
            <EmptyState
              kind="products"
              title={view === "all" ? "Nog geen producten." : "Niets in deze lijst."}
              body={view === "all"
                ? `${brand} wijst je producten toe; ze verschijnen hier zodra dat gebeurt.`
                : "Van alles wat je levert is genoeg op voorraad."}
            />
          }
        />
      </div>
    </div>
  )
}
