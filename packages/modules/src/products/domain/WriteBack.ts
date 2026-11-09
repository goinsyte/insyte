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
