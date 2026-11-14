import { useAtomValue } from "@effect/atom-react"
import type { ProductPage, ProductRow as ServerRow, ProductSummary } from "@insyte/modules/products/domain/Products"
import { copyLines, counted, exportCsv } from "@insyte/ui/app/lib/bulk-io"
import { marginOf } from "@insyte/ui/app/lib/catalog"
import { formatCurrency } from "@insyte/ui/app/lib/format"
import { firstQuery, type ServerList } from "@insyte/ui/app/lib/server-query"
import type { Currency, Product } from "@insyte/ui/app/lib/types/domain"
import type { ProductRow, ProductsSource } from "@insyte/ui/app/products/source"
import { type Facet, PAGE_ROWS } from "@insyte/ui/app/table/data-table"
import { Archive, BadgePercent, Check, Copy, Download, Edit3, Truck } from "@insyte/ui/icons"
import { Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useMemo } from "react"
import { firstInput, usePaged } from "../data/paged.ts"
import { productsPageAtom } from "../data/products.ts"
import { suppliersAtom } from "../data/suppliers.ts"
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
 * The Aandacht flags are the server's (`Products.list`'s `attention`), drawn as the panel's badges count them and as a
 * cut pages them (`products/use-cases/attention.ts`). "Bijbestelling aanvragen" files a restock ticket per product
 * that runs low (`restock.ts`) where the role may open tickets.
 *
 * The list pages on the server (W3.1): the table's filter (the Aandacht cuts too, as the flags' `yes`/`no`), search,
 * order and page as `Products.list`'s input (`PRODUCTS_LIST`). Which columns have figures, and the line beside the title,
 * are the catalogue's as a whole (the first page's `summary`); "Gem. levertijd" and "Beoordeling" are not filtered or
 * sorted on the server.
 */

const FLAG = { values: { ja: "yes", nee: "no" } } as const

/** The products table's columns as `Products.list` filters and sorts them (`PRODUCT_FIELDS`, `PRODUCT_SORTS`). */
const PRODUCTS_LIST: ServerList = {
  fields: {
    status: "status",
    returnHigh: { field: "return_high", ...FLAG },
    complaints: { field: "open_complaints", ...FLAG },
    checkRunning: { field: "check_running", ...FLAG },
    product: "product",
    category: { field: "product_type", blank: "Overig" },
    cogs: "cost",
    price: "price",
    margin: "margin",
    stock: "stock",
    supplier: { field: "supplier_name", blank: "—" }
  },
  sorts: {
    product: "title",
    category: "product_type",
    cogs: "cost",
    price: "price",
    margin: "margin",
    stock: "stock",
    supplier: "supplier_name"
  }
}

/** The first page, by title as the screen's table first asks for it: what the route reads ahead. */
export const FIRST_PRODUCTS = firstInput(firstQuery(null, PAGE_ROWS), PRODUCTS_LIST)

const FILTERABLE: ReadonlySet<string> = new Set(Object.keys(PRODUCTS_LIST.fields))
const SORTABLE: ReadonlySet<string> = new Set(Object.keys(PRODUCTS_LIST.sorts))
const NO_SUMMARY: ProductSummary = {
  products: 0,
  restock: 0,
  margin: 0,
  shelfMinor: 0,
  currency: "EUR",
  stocked: false,
  costed: false,
  supplied: false,
  delivered: false
}

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
    run: (rows: ReadonlyArray<ProductRow>) => void restock(rows.map((p) => p.id))
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

/**
 * The line beside the title, as the design writes it, with what the server holds over the whole catalogue: how many
 * need restocking once stock is known, the average margin once a cost is, and what the stock on hand cost to buy once
 * both are.
 */
const standingOf = (summary: ProductSummary) => () => {
  if (summary.products === 0) return undefined
  const parts = [`${summary.products} ${summary.products === 1 ? "product" : "producten"}`]
  if (summary.stocked) parts.push(`${summary.restock} moeten worden bijbesteld`)
  if (summary.costed) parts.push(`${Math.round(summary.margin * 100)}% gemiddelde marge`)
  if (summary.stocked && summary.costed) {
    parts.push(`${formatCurrency(summary.shelfMinor / 100, summary.currency as Currency)} op de plank`)
  }
  return parts.join(" · ")
}

/** `first` is the route's first page (`FIRST_PRODUCTS`); `open` navigates to the product over the list. */
export function useConsoleProductsSource(first: ProductPage, open: (product: Product) => void): ProductsSource {
  const { page, fetching, onQuery } = usePaged(productsPageAtom, { input: FIRST_PRODUCTS, page: first }, PRODUCTS_LIST)
  const products = useMemo(() => page.rows.map(productOf), [page.rows])
  const server = useMemo(() => new Map(page.rows.map((p) => [p.id, p])), [page.rows])
  const commands = useProductCommands()
  const restock = useRestock()
  const summary = first.summary ?? NO_SUMMARY
  const { costed, supplied, stocked, delivered } = summary
  const hidden = [
    ...(stocked ? [] : ["stock"]),
    ...(supplied ? [] : ["supplier"]),
    ...(delivered ? [] : ["delivery"]),
    "feedback",
    ...(costed ? [] : ["margin"])
  ]
  // Every supplier where the role may see them, else the ones on this page.
  const known = Option.getOrUndefined(AsyncResult.value(useAtomValue(suppliersAtom)))
  const suppliers = [
    ...new Set([
      ...(known?.rows ?? []).map((s) => s.name),
      ...page.rows.flatMap((p) => p.supplierName === null ? [] : [p.supplierName])
    ])
  ].toSorted((a, b) => a.localeCompare(b, "nl"))
  const facets: Array<Facet> = [
    ...(stocked ? [STOCK_FACET] : []),
    ...(supplied
      ? [{ id: "supplier", label: "Leverancier", options: suppliers.map((name) => ({ value: name, label: name })) }]
      : [])
  ]
  const status = page.counts.status
  const paging = useMemo(() => ({
    total: page.counts.total,
    all: summary.products,
    next: page.nextCursor,
    fetching,
    filterable: FILTERABLE,
    sortable: SORTABLE,
    counts: (field: string) => (field === "status" ? new Map(Object.entries(status)) : undefined),
    onQuery
  }), [page.counts.total, summary.products, page.nextCursor, fetching, status, onQuery])
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
    standing: standingOf(summary),
    attentionOf: (p) => server.get(p.id)?.attention ?? QUIET,
    facets,
    hidden,
    actions: actionsOf(commands, restock),
    canCreate: { ok: false, reason: "Producten toevoegen kan hier nog niet" },
    currencyOf: (p) => p.currency,
    categories: false,
    open,
    paging
  }
}
