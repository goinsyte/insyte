import type { ProductPage, ProductRow as ServerRow } from "@insyte/modules/products/domain/Products"
import { copyLines, counted, exportCsv } from "@insyte/ui/app/lib/bulk-io"
import { marginOf } from "@insyte/ui/app/lib/catalog"
import type { Currency, Product } from "@insyte/ui/app/lib/types/domain"
import type { ProductRow, ProductsSource } from "@insyte/ui/app/products/source"
import { Archive, BadgePercent, Check, Copy, Download, Edit3 } from "@insyte/ui/icons"
import { useMemo } from "react"
import { useProductCommands } from "./product-writes.ts"

/*
 * The products list's source in the console: `Products.list`'s rows as the design's products (M6.4), with Insyte's own
 * cost price and the margin over it once one is entered, and the commands on a selection (M7.3): "Marges
 * herberekenen", and the status, each with one Undo. What the server does not hold yet is hidden, not made up: stock
 * (inventory per location), the supplier and delivery time (M8), the rating (no reviews source); the margin until any
 * product has a cost. The category is Shopify's product type. "Nieuw product" waits for suppliers (M8).
 */

const HIDDEN = ["stock", "supplier", "delivery", "feedback"] as const

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
  variants: [],
  status: p.status,
  tags: [...p.tags],
  created_at: new Date(p.updatedAt).toISOString()
})

const actionsOf = (commands: ReturnType<typeof useProductCommands>): ProductsSource["actions"] => (openMargins) => [
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

/** `open` is the route's: it navigates to the product over the list. */
export function useConsoleProductsSource(page: ProductPage, open: (product: Product) => void): ProductsSource {
  const products = useMemo(() => page.rows.map(productOf), [page.rows])
  const server = useMemo(() => new Map(page.rows.map((p) => [p.id, p])), [page.rows])
  const commands = useProductCommands()
  const costed = page.rows.some((p) => p.costMinor !== null)
  return {
    products,
    loading: false,
    rowOf: (p): ProductRow => {
      const row = server.get(p.id)
      return {
        ...p,
        stock: "available",
        category: row?.productType ?? "Overig",
        margin: marginOf(p.price, p.cost),
        supplierName: "—",
        avgDelivery: "—",
        feedback: "—",
        sku: row?.sku ?? "—"
      }
    },
    standing: (
      rows
    ) => (rows.length === 0 ? undefined : `${rows.length} ${rows.length === 1 ? "product" : "producten"}`),
    attentionOf: () => QUIET,
    facets: [],
    hidden: costed ? HIDDEN : [...HIDDEN, "margin"],
    actions: actionsOf(commands),
    canCreate: { ok: false, reason: "Producten toevoegen kan hier nog niet" },
    currencyOf: (p) => p.currency,
    categories: false,
    open
  }
}
