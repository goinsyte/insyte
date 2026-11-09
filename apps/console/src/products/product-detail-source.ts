import type { ProductDetail, ProductRow } from "@insyte/modules/products/domain/Products"
import type { Currency, Product } from "@insyte/ui/app/lib/types/domain"
import type { ProductDetailSource } from "@insyte/ui/app/products/detail-source"
import { productOf } from "./products-source.ts"

/*
 * One product's source in the console (M6.4): `Products.get` as the design's page, read-only until the commands (M7).
 * What the server does not hold is left out, as on the list: cost and margin (M7), the supplier (M8), stock (until
 * inventory per location is mirrored; a variant shows a dash), the quality checks. The category is Shopify's product
 * type, the description Shopify's HTML as text.
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
  const known = new Map(d.variants.map((v) => [v.id, v.available]))
  return {
    ...pageOf(d.product, shopDomain, product),
    variantStock: (v) => known.get(v.id) ?? undefined,
    arriving: false
  }
}

/** The page while `Products.get` is still out: the list's row draws the header, the record's skeleton the body. */
export function arrivingProductDetail(row: ProductRow, shopDomain: string | undefined): ProductDetailSource {
  return { ...pageOf(row, shopDomain, productOf(row)), arriving: true }
}
