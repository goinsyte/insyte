import { getRouteApi, Link } from "@tanstack/react-router"
import { useEffect, useMemo, useState } from "react"
import { Minus, Plus } from "../../icons"
import { PageHeader } from "../common/page-header"
import { INDICATOR_LABEL } from "../lib/supplier-products"
import { cn } from "../lib/utils"
import { ProductThumb } from "../product/product-thumb"
import type { StockIndicator } from "../stores/supplier-store"
import { useSupplierPortal } from "./source"

const Route = getRouteApi("/_supplier/supplier/products/$productId")

const MODES: Array<StockIndicator> = ["live", "in_stock_out_of_stock", "none"]
const day = new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "short" })

/*
 * One product, from the supplier's side. Stock per variant and the lead time are a draft until
 * saved, and saving is what the brand sees on its own product page. How stock is reported, and the
 * photos and videos uploaded for the brand, apply at once.
 */
export function SupplierProduct() {
  const { id } = Route.useLoaderData()
  const { brand, useProduct, saveStock, setMode, modeOff, parts } = useSupplierPortal()
  const product = useProduct(id)

  const savedStock = useMemo(
    () => Object.fromEntries((product?.variants ?? []).map((v) => [v.id, v.stock])),
    [product]
  )
  const savedLead = product?.row.lead ?? 0
  const [stock, setStock] = useState<Record<string, number>>(savedStock)
  const [lead, setLead] = useState(savedLead)
  useEffect(() => setStock(savedStock), [savedStock])
  useEffect(() => setLead(savedLead), [savedLead])

  if (!product) return null
  const { row } = product
  const indicator = row.mode
  const dirty = lead !== savedLead || product.variants.some((v) => stock[v.id] !== v.stock)
  const waiting = product.waiting

  function save() {
    saveStock(product!, stock, lead, {
      message: `Voorraad van ${row.title} bijgewerkt`,
      description: `${brand} ziet de nieuwe aantallen meteen.`
    })
  }

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        title={row.title}
        crumbs={[{ label: "Producten", to: "/supplier/products" }]}
        meta={`${row.units.toLocaleString("nl-NL")} op voorraad${
          row.stock === "available" ? "" : row.stock === "out" ? " · uitverkocht" : " · lage voorraad"
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
          {parts.Checks ? <parts.Checks productId={id} /> : null}
          {product.images.length > 0 ?
            (
              <section aria-labelledby="photos-title" className="flex flex-col gap-2">
                <h2 id="photos-title" className="font-medium text-ink-3 text-sm">
                  In de winkel van {brand}
                </h2>
                <ul className="flex flex-wrap gap-2">
                  {product.images.map((src, i) => (
                    <li key={src}>
                      <ProductThumb src={src} title={`${row.title}, foto ${i + 1}`} size={96} />
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
                const changed = n !== v.stock
                return (
                  <li
                    key={v.id}
                    className="flex items-center gap-4 py-2.5 shadow-[inset_0_-1px_0_color-mix(in_oklch,var(--ink)_7%,transparent)]"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-medium text-base text-ink">{v.title}</span>
                      <span className="text-ink-3 text-sm">{v.sku}</span>
                    </span>
                    {changed ? <span className="text-ink-3 text-xs tabular-nums">was {v.stock}</span> : null}
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

          {parts.Media ? <parts.Media productId={id} /> : null}
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
            <p className="text-ink-3 text-xs">{brand} rekent de leverdatum aan de klant hiermee uit.</p>
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
                  disabled={modeOff(m) !== null}
                  title={modeOff(m) ?? undefined}
                  onClick={() => indicator === m || setMode(row, m)}
                  className={cn(
                    "flex cursor-pointer flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left transition-colors disabled:cursor-default disabled:opacity-50",
                    indicator === m ? "bg-arc-tint" : "hover:bg-ink/4"
                  )}
                >
                  <span className={cn("font-medium text-sm", indicator === m ? "text-arc-ink" : "text-ink")}>
                    {INDICATOR_LABEL[m].label}
                  </span>
                  <span className="text-ink-3 text-xs">{INDICATOR_LABEL[m].detail.replace("Northwind", brand)}</span>
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
                          {r.quantity}× · {day.format(r.handoff)}
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
