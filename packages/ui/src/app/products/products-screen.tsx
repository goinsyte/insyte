import { useNavigate, useRouterState } from "@tanstack/react-router"
import type { ColumnDef } from "@tanstack/react-table"
import { type ReactElement, useCallback, useMemo, useState } from "react"
import { Plus, Sparkles, Star } from "../../icons"
import { Blocked } from "../access/blocked"
import { AreaEmpty } from "../common/area-empty"
import { EmptyState } from "../common/empty-state"
import { PageHeader } from "../common/page-header"
import { useSearchCut } from "../filters/use-search-cut"
import type { Stock } from "../lib/catalog"
import { formatCurrency } from "../lib/format"
import type { Product } from "../lib/types/domain"
import { ProductThumb } from "../product/product-thumb"
import { useAskInsyte } from "../shell/ask-insyte-context"
import { useOnCreate } from "../stores/create-intent"
import { useViews } from "../stores/views-store"
import { DataTable, facetFilter } from "../table/data-table"
import { CategoriesView } from "./categories-view"
import { type ProductRow as Row, type TeamGate, useProductsSource } from "./source"

/** A control the role may not use: disabled, with what is missing, from the host's answer. */
function GateBy({ gate, children }: { gate: TeamGate; children: ReactElement }) {
  return gate.ok ? children : <Blocked reason={gate.reason}>{children}</Blocked>
}

export function ProductsPage() {
  const navigate = useNavigate()
  const ask = useAskInsyte()
  const source = useProductsSource()
  const { products, loading, NewProduct, Margin, LowStock, Closing } = source
  const [newOpen, setNewOpen] = useState(false)
  useOnCreate("product", useCallback(() => setNewOpen(true), []))
  // Adding a product, where the host can: the button and the empty states offer it then.
  const create = NewProduct === undefined ? undefined : { label: "Product toevoegen", onClick: () => setNewOpen(true) }
  useSearchCut("products", "status", {
    active: { field: "status", values: ["active"] },
    draft: { field: "status", values: ["draft"] },
    archived: { field: "status", values: ["archived"] },
    attention_returns: { field: "returnHigh", values: ["ja"] },
    attention_complaints: { field: "complaints", values: ["ja"] },
    attention_checks: { field: "checkRunning", values: ["ja"] }
  })
  // Aandacht (PLAN 26): what the returns queue and the quality checks say about each product, as the host knows it.
  const attention = useMemo(() => new Map(products.map((p) => [p.id, source.attentionOf(p)])), [
    products,
    source.attentionOf
  ])

  const view = useRouterState({ select: (s) => (s.location.search as { view?: string }).view })
  const setDraft = useViews((s) => s.setDraft)
  const [margining, setMargining] = useState<Row[] | null>(null)
  const actions = useMemo(() => source.actions(setMargining), [source.actions])

  /* Stock, SKU, margin and category come from the product itself — its variants, its cost — so
	   the list, the product page and the low-stock advice say the same thing (the host's `rowOf`). */
  const rows = useMemo<Array<Row>>(() => products.map((p, i) => source.rowOf(p, i)), [products, source.rowOf])
  const standing = useMemo(() => source.standing(rows), [rows, source.standing])

  const columns = useMemo<Array<ColumnDef<Row, unknown>>>(
    () => [
      // Hidden by default: it is there so the area panel's Active / Draft / Archived can cut by it.
      { id: "status", accessorKey: "status", header: "Status" },
      {
        id: "returnHigh",
        accessorFn: (p) => (attention.get(p.id)?.returnHigh ? "ja" : "nee"),
        header: "Retour boven 10%"
      },
      {
        id: "complaints",
        accessorFn: (p) => ((attention.get(p.id)?.complaints ?? 0) > 0 ? "ja" : "nee"),
        header: "Open klachten"
      },
      {
        id: "checkRunning",
        accessorFn: (p) => (attention.get(p.id)?.checkRunning ? "ja" : "nee"),
        header: "Controle loopt"
      },
      {
        id: "product",
        accessorFn: (p) => `${p.title} ${p.sku}`,
        header: "Product",
        size: 300,
        enableHiding: false,
        cell: (ctx) => {
          const p = ctx.row.original
          return (
            <div className="flex items-center gap-2.5">
              <ProductThumb src={p.images[0]} title={p.title} size={32} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium text-ink">{p.title}</span>
                <span className="truncate font-medium text-2xs text-ink-3">
                  {p.sku}
                </span>
              </span>
            </div>
          )
        }
      },
      {
        id: "category",
        accessorKey: "category",
        header: "Categorie",
        size: 150
      },
      {
        id: "cogs",
        accessorKey: "cost",
        header: "Inkoop",
        size: 84,
        cell: (ctx) => (
          <span className="tabular-nums">
            {ctx.row.original.cost === undefined
              ? "—"
              : formatCurrency(ctx.row.original.cost, source.currencyOf?.(ctx.row.original))}
          </span>
        )
      },
      {
        id: "price",
        accessorKey: "price",
        header: "Prijs",
        size: 84,
        cell: (ctx) => (
          <span className="font-medium text-ink tabular-nums">
            {formatCurrency(ctx.row.original.price, source.currencyOf?.(ctx.row.original))}
          </span>
        )
      },
      {
        id: "margin",
        accessorKey: "margin",
        header: "Marge",
        size: 132,
        cell: (ctx) => {
          const pct = Math.round(ctx.row.original.margin * 100)
          return (
            <span className="flex items-center gap-2">
              <span className="relative block h-1 w-14 overflow-hidden rounded-full bg-ink/10">
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-arc"
                  style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                />
              </span>
              <span className="tabular-nums">{pct}%</span>
            </span>
          )
        }
      },
      {
        id: "stock",
        accessorKey: "stock",
        header: "Voorraad",
        size: 116,
        filterFn: facetFilter,
        cell: (ctx) => <StockBadge stock={ctx.row.original.stock} />
      },
      {
        id: "supplier",
        accessorKey: "supplierName",
        header: "Leverancier",
        filterFn: facetFilter
      },
      {
        id: "delivery",
        accessorKey: "avgDelivery",
        header: "Gem. levertijd",
        size: 104,
        cell: (ctx) => <span className="tabular-nums">{ctx.row.original.avgDelivery}</span>
      },
      {
        id: "feedback",
        accessorKey: "feedback",
        header: "Beoordeling",
        size: 100,
        cell: (ctx) => (
          <span className="flex items-center gap-1.5">
            <Star
              className="size-3 fill-signal-amber text-signal-amber"
              strokeWidth={1.5}
            />
            <span className="tabular-nums">{ctx.row.original.feedback}</span>
          </span>
        )
      }
    ],
    [attention, source.currencyOf]
  )

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        title="Producten"
        meta={standing}
        actions={
          <>
            <GateBy gate={source.canCreate}>
              <button
                type="button"
                onClick={() => setNewOpen(true)}
                className="flex h-8 items-center gap-1.5 rounded-md bg-abyss px-3 font-medium text-xs text-mesh-ink shadow-primary transition-colors hover:bg-abyss-2 disabled:pointer-events-none disabled:opacity-45"
              >
                <Plus className="size-3.5" strokeWidth={2} />
                Nieuw product
              </button>
            </GateBy>
          </>
        }
      />

      <div className="min-w-0 px-5 pb-6">
        {view === "categories" && source.categories ?
          (
            <CategoriesView
              products={products}
              onOpen={(category) => {
                setDraft("products", {
                  kind: "group",
                  id: "root",
                  join: "and",
                  children: [{ kind: "rule", id: `cat-${category}`, field: "category", op: "any", value: [category] }]
                })
                navigate({ to: "/products" })
              }}
            />
          ) :
          (
            <>
              {LowStock ? <LowStock products={products as Product[]} /> : null}
              {!loading && products.length === 0 ?
                <AreaEmpty area="products" action={create} starts={source.starts} /> :
                (
                  <DataTable
                    columns={columns}
                    data={rows}
                    loading={loading}
                    facets={source.facets}
                    actions={actions}
                    noun={["product", "products"]}
                    initialVisibility={{
                      status: false,
                      returnHigh: false,
                      complaints: false,
                      checkRunning: false,
                      ...Object.fromEntries(source.hidden.map((id) => [id, false]))
                    }}
                    getRowId={(r) => r.id}
                    searchPlaceholder="Producten zoeken"
                    onRowClick={source.open}
                    toolbarEnd={
                      <button
                        type="button"
                        onClick={() => ask.open()}
                        className="flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-xs text-arc-ink transition-colors hover:bg-arc-tint"
                      >
                        <Sparkles className="size-3.5" strokeWidth={1.75} />
                        Vraag Insyte
                      </button>
                    }
                    empty={
                      <EmptyState
                        kind="products"
                        title="Geen producten voor deze filters."
                        body="Pas de filters aan of wis ze."
                        action={create && { ...create, label: "Nieuw product" }}
                      />
                    }
                  />
                )}
            </>
          )}
      </div>
      {Closing ? <Closing empty={products.length === 0} /> : null}

      {Margin
        ? <Margin open={margining !== null} onOpenChange={(v) => !v && setMargining(null)} picked={margining ?? []} />
        : null}

      {NewProduct ? <NewProduct open={newOpen} onOpenChange={setNewOpen} /> : null}
    </div>
  )
}

function StockBadge({ stock }: { stock: Stock | null }) {
  if (stock === null) return <span className="text-ink-3">—</span>
  const map = {
    available: {
      label: "Op voorraad",
      bg: "var(--signal-green-bg)",
      fg: "var(--signal-green)"
    },
    low: {
      label: "Lage voorraad",
      bg: "var(--signal-amber-bg)",
      fg: "var(--signal-amber)"
    },
    out: {
      label: "Uitverkocht",
      bg: "var(--signal-red-bg)",
      fg: "var(--signal-red)"
    }
  }[stock]
  return (
    <span
      className="inline-flex h-[18px] items-center justify-center rounded-full px-2 font-medium text-sm leading-none"
      style={{ backgroundColor: map.bg, color: map.fg }}
    >
      {map.label}
    </span>
  )
}
