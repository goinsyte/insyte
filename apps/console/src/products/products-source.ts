import type { ProductPage, ProductRow as ServerRow } from "@insyte/modules/products/domain/Products"
import { copyLines, counted, exportCsv } from "@insyte/ui/app/lib/bulk-io"
import type { Currency, Product } from "@insyte/ui/app/lib/types/domain"
import type { ProductRow, ProductsSource } from "@insyte/ui/app/products/source"
import { Copy, Download } from "@insyte/ui/icons"
import { useMemo } from "react"

/*
 * The products list's source in the console (M6.4): `Products.list`'s rows as the design's products. What the server
 * does not hold yet is hidden, not made up: cost and margin (Insyte's own, M7), stock (inventory per location, with
 * the reconcile's next pass), the supplier and delivery time (M8), the rating (no reviews source). The category is
 * Shopify's product type. Copying and exporting only, until the commands (M7).
 */

const HIDDEN = ["cogs", "margin", "stock", "supplier", "delivery", "feedback"] as const

export const productOf = (p: ServerRow): Product => ({
  id: p.id,
  store_id: p.storeId,
  shopify_id: p.shopifyId,
  title: p.title,
  images: p.image === null ? [] : [p.image],
  description: "",
  price: (p.priceMinMinor ?? 0) / 100,
  currency: p.currency as Currency,
  variants: [],
  status: p.status,
  tags: [...p.tags],
  created_at: new Date(p.updatedAt).toISOString()
})

const ACTIONS: ProductsSource["actions"] = () => [
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
  return {
    products,
    loading: false,
    rowOf: (p): ProductRow => {
      const row = server.get(p.id)
      return {
        ...p,
        stock: "available",
        category: row?.productType ?? "Overig",
        margin: 0,
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
    hidden: HIDDEN,
    actions: ACTIONS,
    canCreate: { ok: false, reason: "Producten toevoegen kan hier nog niet" },
    currencyOf: (p) => p.currency,
    categories: false,
    open
  }
}
