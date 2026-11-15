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

/** A product made in Insyte ("Nieuw product"): Shopify makes its one variant, which takes the price and SKU next. */
export const PRODUCT_CREATE = `mutation($product: ProductCreateInput!) {
  productCreate(product: $product) {
    product { id variants(first: 1) { nodes { id inventoryItem { id } } } }
    userErrors { field message }
  }
}`
