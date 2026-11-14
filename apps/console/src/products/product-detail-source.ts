import { useAtomValue } from "@effect/atom-react"
import type { ProductDetail, ProductRow } from "@insyte/modules/products/domain/Products"
import type { Currency, Product } from "@insyte/ui/app/lib/types/domain"
import type { ProductDetailSource } from "@insyte/ui/app/products/detail-source"
import { Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useMemo } from "react"
import { suppliersAtom } from "../data/suppliers.ts"
import { useGate } from "../frame/refusals.ts"
import { supplierOf } from "../suppliers/supplier-of.ts"
import { useSupplierCommands } from "../suppliers/supplier-writes.ts"
import { useProductCommands } from "./product-writes.ts"
import { productOf } from "./products-source.ts"

/*
 * One product's source in the console: `Products.get` as the design's page (M6.4), edited and saved with its commands
 * behind Producten · Bewerken (M7.3), cost price and margin included, and its supplier (M8.1: the select, where the role
 * may edit suppliers, saves through `Suppliers.assignProducts`) with its delivery time. Stock is Shopify's over every
 * location, how long it lasts at the last 30 days' pace and its level; a variant's units say per location where there
 * are more than one, and what its supplier reports (M16). What the server does not hold is left out, as on the list:
 * the supplier's files (M16), stock until Shopify reported any (a variant shows a dash), the quality checks. The
 * category is Shopify's product type, the description Shopify's HTML as text.
 */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", "#39": "'", nbsp: " " }

/** Shopify's description as the page's plain text: blocks and breaks as new lines, tags dropped, entities read. */
const textOf = (html: string) =>
  html
    .replaceAll(/<br\s*\/?>/gi, "\n")
    .replaceAll(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replaceAll(/<[^>]*>/g, "")
    .replaceAll(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e: string) => ENTITIES[e] ?? "")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim()

/** The product in its store's Shopify admin. */
const adminUrl = (shopDomain: string | undefined, shopifyId: string) =>
  shopDomain === undefined
    ? `https://admin.shopify.com/products/${shopifyId}`
    : `https://admin.shopify.com/store/${shopDomain.replace(/\.myshopify\.com$/, "")}/products/${shopifyId}`

type Levels = ProductDetail["variants"][number]["levels"]

/** A variant's units per place, where there is more than one: "2 locaties: 30 en 8 · leverancier meldt 12". */
const levelsLine = (levels: Levels): string | undefined => {
  const shop = levels.filter((l) => l.source === "shopify").map((l) => l.available.toLocaleString("nl-NL"))
  const supplier = levels.find((l) => l.source === "supplier")
  const parts = [
    ...(shop.length > 1 ? [`${shop.length} locaties: ${shop.slice(0, -1).join(", ")} en ${shop.at(-1)}`] : []),
    ...(supplier === undefined ? [] : [`leverancier meldt ${supplier.available.toLocaleString("nl-NL")}`])
  ]
  return parts.length === 0 ? undefined : parts.join(" · ")
}

/** Units over every variant, how long they last at the last 30 days' pace, and the level; none before a count. */
const stockOf = (d: ProductDetail): ProductDetailSource["stock"] => {
  const { available, stock } = d.product
  if (available === null || stock === null) return undefined
  const perDay = d.soldLast30 / 30
  return { units: available, daysLeft: perDay === 0 ? null : Math.max(0, available) / perDay, level: stock }
}

const pageOf = (row: ProductRow, shopDomain: string | undefined, product: Product): ProductDetailSource => ({
  product,
  currency: row.currency as Currency,
  categoryOf: () => row.productType ?? "Overig",
  variantStock: () => undefined,
  shopifyUrl: adminUrl(shopDomain, row.shopifyId)
})

export function consoleProductDetail(d: ProductDetail, shopDomain: string | undefined): ProductDetailSource {
  const product: Product = {
    ...productOf(d.product),
    images: [...d.images],
    description: textOf(d.descriptionHtml),
    variants: d.variants.map((v) => ({
      id: v.id,
      product_id: d.product.id,
      sku: v.sku ?? "",
      title: v.title,
      price: v.priceMinor / 100,
      ...(v.compareAtMinor === null ? {} : { compare_at_price: v.compareAtMinor / 100 }),
      inventory_level: v.available ?? 0
    }))
  }
  const known = new Map(d.variants.map((v) => [v.id, v]))
  const stock = stockOf(d)
  return {
    ...pageOf(d.product, shopDomain, product),
    ...(stock === undefined ? {} : { stock }),
    variantStock: (v) => known.get(v.id)?.available ?? undefined,
    variantLevels: (v) => levelsLine(known.get(v.id)?.levels ?? []),
    arriving: false
  }
}

/** The page while `Products.get` is still out: the list's row draws the header, the record's skeleton the body. */
export function arrivingProductDetail(row: ProductRow, shopDomain: string | undefined): ProductDetailSource {
  return { ...pageOf(row, shopDomain, productOf(row)), arriving: true }
}

const NONE: ReadonlyArray<never> = []

/** The page with what may be done to it: the draft saved, the product read again from Shopify, its quality. */
export function useConsoleProductDetail(
  d: ProductDetail,
  shopDomain: string | undefined,
  quality?: ProductDetailSource["quality"]
): ProductDetailSource {
  const source = { ...consoleProductDetail(d, shopDomain), quality }
  const commands = useProductCommands()
  const supplierCommands = useSupplierCommands()
  const gate = useGate("products", 2)
  const assign = useGate("suppliers", 2)
  const list = Option.getOrUndefined(AsyncResult.value(useAtomValue(suppliersAtom)))
  const suppliers = useMemo(() => (assign.ok ? list?.rows.map(supplierOf) ?? NONE : NONE), [assign.ok, list])
  const { product } = source
  return gate.ok
    ? {
      ...source,
      edit: {
        save: (draft) => {
          void commands.save(product, draft)
          const to = suppliers.find((s) => s.id === draft.supplier_id)
          if (to !== undefined && draft.supplier_id !== product.supplier_id) {
            void supplierCommands.assign(to.id, product.id, `${to.name} levert nu ${draft.title}`)
          }
        },
        sync: () => commands.sync(product),
        suppliers,
        ...(d.product.leadDays === null ? {} : { leadDays: d.product.leadDays }),
        media: NONE,
        adsPaused: false,
        resumeAds: () => undefined
      }
    }
    : source
}
