import { getRouteApi, Link } from "@tanstack/react-router"
import { useEffect, useMemo, useRef, useState } from "react"
import { suppliers } from "../../data-source"
import { Minus, Plus, Upload, X } from "../../icons"
import { AttachmentTile, forget, fromFiles } from "../chats/attachments"
import { PageHeader } from "../common/page-header"
import { useProducts } from "../hooks/use-operator-data"
import { useSupplierOrders } from "../hooks/use-supplier-orders"
import { stockOf, unitsOf } from "../lib/catalog"
import { DEFAULT_LEAD_DAYS, INDICATOR_LABEL } from "../lib/supplier-products"
import { ME_SUPPLIER } from "../lib/supplier-work"
import { undoable } from "../lib/undo"
import { cn } from "../lib/utils"
import { ProductThumb } from "../product/product-thumb"
import { SupplierChecks } from "../quality/supplier-checks"
import { type StockIndicator, useSupplier } from "../stores/supplier-store"
import { useWorkspace } from "../stores/workspace-store"

const Route = getRouteApi("/_supplier/supplier/products/$productId")

const MODES: StockIndicator[] = ["live", "in_stock_out_of_stock", "none"]
const day = new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "short" })

/*
 * One product, from the supplier's side. Stock per variant and the lead time are a draft until
 * saved, and saving is what Northwind sees on its own product page. How stock is reported, and the
 * photos and videos uploaded for the brand, apply at once.
 */
export function SupplierProduct() {
  const { id } = Route.useLoaderData()
  const { data: products } = useProducts()
  const product = products.find((p) => p.id === id)
  const edits = useWorkspace((s) => s.productEdits)
  const editProducts = useWorkspace((s) => s.editProducts)
  const restoreProducts = useWorkspace((s) => s.restoreProducts)
  const media = useWorkspace((s) => s.productMedia[id]) ?? []
  const addMedia = useWorkspace((s) => s.addProductMedia)
  const removeMedia = useWorkspace((s) => s.removeProductMedia)
  const indicator = useSupplier((s) => s.indicators[id]) ??
    suppliers.find((s) => s.id === ME_SUPPLIER.id)?.stock_indicator ?? "live"
  const setIndicator = useSupplier((s) => s.setIndicator)
  const orders = useSupplierOrders()
  const file = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const savedStock = useMemo(
    () => Object.fromEntries((product?.variants ?? []).map((v) => [v.id, v.inventory_level])),
    [product]
  )
  const savedLead = edits[id]?.leadDays ?? DEFAULT_LEAD_DAYS
  const [stock, setStock] = useState<Record<string, number>>(savedStock)
  const [lead, setLead] = useState(savedLead)
  useEffect(() => setStock(savedStock), [savedStock])
  useEffect(() => setLead(savedLead), [savedLead])

  if (!product) return null
  const dirty = lead !== savedLead || product.variants.some((v) => stock[v.id] !== v.inventory_level)
  const waiting = orders.filter((r) =>
    (r.status === "to_accept" || r.status === "to_ship") && r.lines.some((l) => l.product_id === id)
  )

  function save() {
    const before = edits
    editProducts({ [id]: { variantStock: stock, leadDays: lead } })
    undoable(
      `Voorraad van ${product!.title} bijgewerkt`,
      () => restoreProducts(before),
      "Northwind ziet de nieuwe aantallen meteen."
    )
  }

  function upload(files: FileList | File[]) {
    const items = fromFiles(files).filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"))
    if (items.length === 0) return
    addMedia(id, items, "Marco Rossi")
    undoable(`${items.length} ${items.length === 1 ? "bestand" : "bestanden"} gedeeld met Northwind`, () => {
      for (const it of items) removeMedia(id, it.id)
    })
  }

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        title={product.title}
        crumbs={[{ label: "Producten", to: "/supplier/products" }]}
        meta={`${unitsOf(product).toLocaleString("nl-NL")} op voorraad${
          stockOf(product) === "available" ? "" : stockOf(product) === "out" ? " · uitverkocht" : " · lage voorraad"
        }`}
        actions={
          <button
            type="button"
            disabled={!dirty}
            onClick={save}
            className="flex h-8 cursor-pointer items-center rounded-md bg-abyss px-3.5 font-medium text-mesh-ink text-sm shadow-primary hover:bg-abyss-2 disabled:cursor-default disabled:opacity-40"
          >
            Opslaan
          </button>
        }
      />

      <div className="grid gap-10 px-5 pt-2 pb-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-10">
          <SupplierChecks productId={id} />
          {product.images.length > 0 ?
            (
              <section aria-labelledby="photos-title" className="flex flex-col gap-2">
                <h2 id="photos-title" className="font-medium text-ink-3 text-sm">
                  In de winkel van Northwind
                </h2>
                <ul className="flex flex-wrap gap-2">
                  {product.images.map((src, i) => (
                    <li key={src}>
                      <ProductThumb src={src} title={`${product.title}, foto ${i + 1}`} size={96} />
                    </li>
                  ))}
                </ul>
              </section>
            ) :
            null}
          <section aria-labelledby="stock-title" className="flex flex-col gap-2">
            <h2 id="stock-title" className="font-medium text-ink text-lg">
              Voorraad per variant
            </h2>
            <ul className="flex flex-col">
              {product.variants.map((v) => {
                const n = stock[v.id] ?? 0
                const changed = n !== v.inventory_level
                return (
                  <li
                    key={v.id}
                    className="flex items-center gap-4 py-2.5 shadow-[inset_0_-1px_0_color-mix(in_oklch,var(--ink)_7%,transparent)]"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-medium text-base text-ink">{v.title}</span>
                      <span className="text-ink-3 text-sm">{v.sku ?? v.id}</span>
                    </span>
                    {changed ? <span className="text-ink-3 text-xs tabular-nums">was {v.inventory_level}</span> : null}
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={`Eén minder van ${v.title}`}
                        onClick={() => setStock((s) => ({ ...s, [v.id]: Math.max(0, n - 1) }))}
                        className="flex size-8 cursor-pointer items-center justify-center rounded-md text-ink-2 hover:bg-ink/6"
                      >
                        <Minus className="size-3.5" strokeWidth={2} />
                      </button>
                      <input
                        type="number"
                        min={0}
                        value={n}
                        onChange={(e) => setStock((s) => ({ ...s, [v.id]: Math.max(0, Number(e.target.value) || 0) }))}
                        aria-label={`Voorraad van ${v.title}`}
                        className={cn(
                          "field h-8 w-20 rounded-md px-2 text-right text-base tabular-nums outline-none focus-visible:bg-paper",
                          changed ? "text-arc-ink" : "text-ink"
                        )}
                      />
                      <button
                        type="button"
                        aria-label={`Eén meer van ${v.title}`}
                        onClick={() => setStock((s) => ({ ...s, [v.id]: n + 1 }))}
                        className="flex size-8 cursor-pointer items-center justify-center rounded-md text-ink-2 hover:bg-ink/6"
                      >
                        <Plus className="size-3.5" strokeWidth={2} />
                      </button>
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>

          <section aria-labelledby="media-title" className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <h2 id="media-title" className="font-medium text-ink text-lg">
                Foto's en video's voor Northwind
              </h2>
              <p className="text-ink-3 text-sm">
                Northwind ziet ze bij het product en kan ze in de winkel en in advertenties gebruiken.
              </p>
            </div>
            <button
              type="button"
              onClick={() => file.current?.click()}
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                upload(e.dataTransfer.files)
              }}
              className={cn(
                "flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl bg-mist text-ink-2 text-sm transition-colors hover:bg-ink/6",
                dragging && "bg-arc-tint text-arc-ink ring-2 ring-arc"
              )}
            >
              <Upload className="size-4" strokeWidth={1.75} />
              {dragging ? "Loslaten om te delen" : "Sleep foto's of video's hierheen, of kies ze"}
            </button>
            <input
              ref={file}
              type="file"
              multiple
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) upload(e.target.files)
                e.target.value = ""
              }}
            />
            {media.length > 0 ?
              (
                <ul className="flex flex-wrap gap-3">
                  {media.map((m) => (
                    <li key={m.id} className="group relative">
                      <AttachmentTile a={m} />
                      <button
                        type="button"
                        aria-label={`${m.name} verwijderen`}
                        onClick={() => {
                          removeMedia(id, m.id)
                          forget(m.id)
                        }}
                        className="absolute top-1.5 right-1.5 flex size-6 cursor-pointer items-center justify-center rounded-md bg-paper/90 text-ink-2 opacity-0 shadow-sm transition-opacity hover:text-ink group-hover:opacity-100 focus-visible:opacity-100"
                      >
                        <X className="size-3.5" strokeWidth={2} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) :
              null}
          </section>
        </div>

        <aside className="flex flex-col gap-8">
          <section aria-labelledby="lead-title" className="flex flex-col gap-2">
            <h2 id="lead-title" className="font-medium text-ink-3 text-sm">
              Levertijd
            </h2>
            <label className="flex items-center gap-2 text-base text-ink">
              <input
                type="number"
                min={0}
                max={30}
                value={lead}
                onChange={(e) => setLead(Math.max(0, Math.min(30, Number(e.target.value) || 0)))}
                className="field h-9 w-16 rounded-md px-2 text-right tabular-nums outline-none focus-visible:bg-paper"
              />
              {lead === 1 ? "dag" : "dagen"} van bestelling tot overdracht
            </label>
            <p className="text-ink-3 text-xs">Northwind rekent de leverdatum aan de klant hiermee uit.</p>
          </section>

          <section aria-labelledby="mode-title" className="flex flex-col gap-2">
            <h2 id="mode-title" className="font-medium text-ink-3 text-sm">
              Hoe je voorraad meldt
            </h2>
            <div role="radiogroup" aria-labelledby="mode-title" className="flex flex-col gap-1">
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={indicator === m}
                  onClick={() => setIndicator(id, m)}
                  className={cn(
                    "flex cursor-pointer flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left transition-colors",
                    indicator === m ? "bg-arc-tint" : "hover:bg-ink/4"
                  )}
                >
                  <span className={cn("font-medium text-sm", indicator === m ? "text-arc-ink" : "text-ink")}>
                    {INDICATOR_LABEL[m].label}
                  </span>
                  <span className="text-ink-3 text-xs">{INDICATOR_LABEL[m].detail}</span>
                </button>
              ))}
            </div>
          </section>

          <section aria-labelledby="waiting-title" className="flex flex-col gap-2">
            <h2 id="waiting-title" className="font-medium text-ink-3 text-sm">
              Wacht op jou
            </h2>
            {waiting.length === 0 ?
              <p className="text-ink-3 text-sm">Geen open bestellingen met dit product.</p> :
              (
                <ul className="flex flex-col">
                  {waiting.slice(0, 6).map((r) => (
                    <li key={r.id}>
                      <Link
                        to="/supplier/orders/$orderId"
                        params={{ orderId: r.id }}
                        className="flex items-center justify-between gap-3 py-1.5 text-sm hover:text-arc-ink"
                      >
                        <span className="font-medium text-ink tabular-nums">{r.number}</span>
                        <span className="text-ink-3 tabular-nums">
                          {r.lines.filter((l) => l.product_id === id).reduce((n, l) => n + l.quantity, 0)}× ·{" "}
                          {day.format(r.handoff)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
          </section>
        </aside>
      </div>
    </div>
  )
}
