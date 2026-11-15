/*
 * What Shopify is asked when a product changed in Insyte (M7.3; Admin GraphQL 2026-10): the product's own fields in
 * one `productUpdate`, its variants' price in one `productVariantsBulkUpdate`. Each answers its `userErrors`.
 */

export const PRODUCT_UPDATE = `mutation($product: ProductUpdateInput!) {
  productUpdate(product: $product) { product { id } userErrors { field message } }
}`

export const VARIANTS_UPDATE = `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { field message } }
}`

/** Shopify's `ProductStatus`. */
export const STATUS: Record<string, string> = { active: "ACTIVE", draft: "DRAFT", archived: "ARCHIVED" }

/**
 * A product made in Insyte ("Nieuw product"): `productSet` makes it with its one variant's price and SKU in the same
 * call, so it is never in Shopify (on sale, or echoed back) without them.
 */
export const PRODUCT_SET = `mutation($input: ProductSetInput!, $synchronous: Boolean!) {
  productSet(input: $input, synchronous: $synchronous) {
    product { id variants(first: 1) { nodes { id inventoryItem { id } } } }
    userErrors { field message }
  }
}`

/** A product made by a create tried before, by the handle Insyte gave it. */
export const PRODUCT_FIND = `query($handle: String!) {
  productByIdentifier(identifier: { handle: $handle }) {
    id variants(first: 1) { nodes { id inventoryItem { id } } }
  }
}`

/** A product Shopify made for one Insyte no longer holds. */
export const PRODUCT_DELETE = `mutation($input: ProductDeleteInput!) {
  productDelete(input: $input) { deletedProductId userErrors { field message } }
}`

/** `productSet`'s input for a product of one variant: the option Shopify gives such a product, its price and SKU. */
export const productSetInput = (p: {
  readonly title: string
  readonly handle: string
  readonly descriptionHtml: string
  readonly status: string
  readonly price: string
  readonly sku: string | null
}) => ({
  title: p.title,
  handle: p.handle,
  descriptionHtml: p.descriptionHtml,
  status: STATUS[p.status] ?? "DRAFT",
  productOptions: [{ name: "Title", values: [{ name: "Default Title" }] }],
  variants: [{
    optionValues: [{ optionName: "Title", name: "Default Title" }],
    price: p.price,
    ...(p.sku === null ? {} : { inventoryItem: { sku: p.sku } })
  }]
})
