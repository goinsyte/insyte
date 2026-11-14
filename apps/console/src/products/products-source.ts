import { useAtomValue } from "@effect/atom-react"
import type { ProductPage, ProductRow as ServerRow } from "@insyte/modules/products/domain/Products"
import type { QualityStats } from "@insyte/modules/quality/domain/Quality"
import { copyLines, counted, exportCsv } from "@insyte/ui/app/lib/bulk-io"
import { marginOf } from "@insyte/ui/app/lib/catalog"
import { formatCurrency } from "@insyte/ui/app/lib/format"
import type { Currency, Product } from "@insyte/ui/app/lib/types/domain"
import type { ProductRow, ProductsSource } from "@insyte/ui/app/products/source"
import type { Facet } from "@insyte/ui/app/table/data-table"
import { Archive, BadgePercent, Check, Copy, Download, Edit3, Truck } from "@insyte/ui/icons"
import { Option } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { useCallback, useMemo } from "react"
import { productStatsAtom } from "../data/quality.ts"
import { useGate } from "../frame/refusals.ts"
import { useProductCommands } from "./product-writes.ts"
import { useRestock } from "./restock.ts"

/*
 * The products list's source in the console: `Products.list`'s rows as the design's products (M6.4), with Insyte's own
 * cost price and the margin over it once one is entered, and the commands on a selection (M7.3): "Marges
 * herberekenen", and the status, each with one Undo. Stock is Shopify's over every location, its level against the
 * low-stock threshold (the Voorraad facet cuts by it); the route adds the low-stock advice (`low-stock.tsx`).
 * The supplier is the primary one (M8.1), the delivery time the average over the product's delivered orders (M8.4).
 * What the server does not hold yet is hidden, not made up: stock until Shopify reported any, the supplier until one
 * is assigned, the delivery time until an order arrived, the rating (no reviews source), the margin until any product
 * has a cost. The category is Shopify's product type. "Nieuw product" waits for `Products.create`.
 * The Aandacht cuts read `Quality.stats` over the last 90 days: more than a tenth of the units sold came back, a
 * complaint in the last 30 days, a check still running. "Bijbestelling aanvragen" files a restock ticket per product
 * that runs low (`restock.ts`) where the role may open tickets.
 */

const STOCK_FACET: Facet = {
  id: "stock",
  label: "Voorraad",
  options: [
    { value: "available", label: "Op voorraad" },
    { value: "low", label: "Lage voorraad" },
    { value: "out", label: "Uitverkocht" }
  ]
}

/** "4,5 d", as the design writes a delivery time. */
const daysOf = (days: number) =>
  `${days.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} d`

export const productOf = (p: ServerRow): Product => ({
  id: p.id,
  store_id: p.storeId,
  shopify_id: p.shopifyId,
  title: p.title,
  images: p.image === null ? [] : [p.image],
  description: "",
  price: (p.priceMinMinor ?? 0) / 100,
  ...(p.costMinor === null ? {} : { cost: p.costMinor / 100 }),
  currency: p.currency as Currency,
  ...(p.supplierId === null ? {} : { supplier_id: p.supplierId }),
  variants: [],
  status: p.status,
  tags: [...p.tags],
  created_at: new Date(p.updatedAt).toISOString()
})

const actionsOf = (
  commands: ReturnType<typeof useProductCommands>,
  restock: ReturnType<typeof useRestock>
): ProductsSource["actions"] =>
(openMargins) => [
  ...(restock === undefined ? [] : [{
    id: "restock",
    needs: { perm: "support" as const, arg: 2 as const },
    label: "Bijbestelling aanvragen",
    icon: Truck,
    group: "Leveranciers",
    shortcut: "r",
    bar: true,
    applies: (p: ProductRow) => p.stock === "low" || p.stock === "out",
    run: (rows: ReadonlyArray<ProductRow>) =>
      void restock(rows.map((p) => ({
        productId: p.id,
        title: p.title,
        supplierName: p.supplierName === "—" ? null : p.supplierName,
        units: null,
        out: p.stock === "out"
      })))
  }]),
  {
    id: "margins",
    needs: { perm: "products", arg: 2 },
    label: "Marges herberekenen",
    icon: BadgePercent,
    group: "Prijzen",
    shortcut: "p",
    bar: true,
    run: (rows) => openMargins([...rows])
  },
  {
    id: "active",
    needs: { perm: "products", arg: 2 },
    label: "Op actief zetten",
    icon: Check,
    group: "Status",
    applies: (p) => p.status !== "active",
    run: (rows) =>
      void commands.setStatus(rows, "active", `${counted(rows.length, "product", "producten")} op actief gezet`)
  },
  {
    id: "draft",
    needs: { perm: "products", arg: 2 },
    label: "Op concept zetten",
    icon: Edit3,
    group: "Status",
    applies: (p) => p.status !== "draft",
    run: (rows) =>
      void commands.setStatus(rows, "draft", `${counted(rows.length, "product", "producten")} op concept gezet`)
  },
  {
    id: "archive",
    needs: { perm: "products", arg: 3 },
    label: "Archiveren",
    icon: Archive,
    group: "Status",
    applies: (p) => p.status !== "archived",
    destructive: true,
    run: (rows) =>
      void commands.setStatus(rows, "archived", `${counted(rows.length, "product", "producten")} gearchiveerd`)
  },
  {
    id: "copy",
    label: "SKU's kopiëren",
    icon: Copy,
    group: "Exporteren",
    shortcut: "c",
    bar: true,
    run: (rows) => copyLines(rows.map((p) => p.sku), counted(rows.length, "SKU", "SKU's"))
  },
  {
    id: "csv",
    needs: { perm: "data.export" },
    label: "Exporteren als CSV",
    icon: Download,
    group: "Exporteren",
    run: (rows) =>
      exportCsv(
        "producten",
        ["Product", "SKU", "Categorie", "Prijs", "Status"],
        rows.map((p) => [p.title, p.sku, p.category, p.price, p.status])
      )
  }
]

const QUIET = { returnHigh: false, complaints: 0, checkRunning: false }
type Attention = typeof QUIET
const NO_STATS = Atom.make(AsyncResult.initial<QualityStats, never>())

/** What the returns and the quality checks say of each product (the panel's Aandacht cuts), where the role reads them. */
function useAttention(): (product: Product) => Attention {
  const stats = Option.getOrUndefined(
    AsyncResult.value(useAtomValue(useGate("products", 1).ok ? productStatsAtom : NO_STATS))
  )
  const byId = useMemo(
    () =>
      new Map((stats?.rows ?? []).map((r): [string, Attention] => [r.id, {
        returnHigh: r.sold > 0 && r.returned / r.sold > 0.1,
        complaints: r.recentComplaints,
        checkRunning: r.running > 0
      }])),
    [stats]
  )
  return useCallback((p: Product) => byId.get(p.id) ?? QUIET, [byId])
}

/**
 * The line beside the title, as the design writes it, with what the server holds: how many need restocking once stock
 * is known, the average margin once a cost is, and what the stock on hand cost to buy once both are.
 */
const standingOf =
  (stocked: boolean, costed: boolean, unitsOf: (id: string) => number) => (rows: ReadonlyArray<ProductRow>) => {
    if (rows.length === 0) return undefined
    const parts = [`${rows.length} ${rows.length === 1 ? "product" : "producten"}`]
    if (stocked) {
      parts.push(`${rows.filter((p) => p.stock === "low" || p.stock === "out").length} moeten worden bijbesteld`)
    }
    if (costed) {
      parts.push(`${Math.round((rows.reduce((s, p) => s + p.margin, 0) / rows.length) * 100)}% gemiddelde marge`)
    }
    if (stocked && costed) {
      const value = rows.reduce((s, p) => s + (p.cost ?? 0) * unitsOf(p.id), 0)
      parts.push(`${formatCurrency(value, rows[0]?.currency)} op de plank`)
    }
    return parts.join(" · ")
  }

/** `open` is the route's: it navigates to the product over the list. */
export function useConsoleProductsSource(page: ProductPage, open: (product: Product) => void): ProductsSource {
  const products = useMemo(() => page.rows.map(productOf), [page.rows])
  const server = useMemo(() => new Map(page.rows.map((p) => [p.id, p])), [page.rows])
  const commands = useProductCommands()
  const restock = useRestock()
  const attentionOf = useAttention()
  const costed = page.rows.some((p) => p.costMinor !== null)
  const supplied = page.rows.some((p) => p.supplierId !== null)
  const stocked = page.rows.some((p) => p.stock !== null)
  const delivered = page.rows.some((p) => p.avgDeliveryDays !== null)
  const hidden = [
    ...(stocked ? [] : ["stock"]),
    ...(supplied ? [] : ["supplier"]),
    ...(delivered ? [] : ["delivery"]),
    "feedback",
    ...(costed ? [] : ["margin"])
  ]
  const suppliers = [...new Set(page.rows.flatMap((p) => p.supplierName === null ? [] : [p.supplierName]))]
    .toSorted((a, b) => a.localeCompare(b, "nl"))
  const facets: Array<Facet> = [
    ...(stocked ? [STOCK_FACET] : []),
    ...(supplied
      ? [{ id: "supplier", label: "Leverancier", options: suppliers.map((name) => ({ value: name, label: name })) }]
      : [])
  ]
  return {
    products,
    loading: false,
    rowOf: (p): ProductRow => {
      const row = server.get(p.id)
      return {
        ...p,
        stock: row?.stock ?? null,
        category: row?.productType ?? "Overig",
        margin: marginOf(p.price, p.cost),
        supplierName: row?.supplierName ?? "—",
        avgDelivery: row?.avgDeliveryDays == null ? "—" : daysOf(row.avgDeliveryDays),
        feedback: "—",
        sku: row?.sku ?? "—"
      }
    },
    standing: standingOf(stocked, costed, (id) => Math.max(0, server.get(id)?.available ?? 0)),
    attentionOf,
    facets,
    hidden,
    actions: actionsOf(commands, restock),
    canCreate: { ok: false, reason: "Producten toevoegen kan hier nog niet" },
    currencyOf: (p) => p.currency,
    categories: false,
    open
  }
}
