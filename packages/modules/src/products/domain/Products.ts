import { Schema } from "effect"

/* Producten, read-only (M6.4; domain.md §4.1): the mirror's products with their variants' price range and stock. */

export class ProductRow extends Schema.Class<ProductRow>("products/ProductRow")({
  id: Schema.String,
  storeId: Schema.String,
  shopifyId: Schema.String,
  title: Schema.String,
  handle: Schema.String,
  status: Schema.Literals(["active", "draft", "archived"]),
  vendor: Schema.NullOr(Schema.String),
  productType: Schema.NullOr(Schema.String),
  tags: Schema.Array(Schema.String),
  image: Schema.NullOr(Schema.String),
  variantCount: Schema.Int,
  /** The first variant's SKU, for the list's column and search. */
  sku: Schema.NullOr(Schema.String),
  priceMinMinor: Schema.NullOr(Schema.Int),
  priceMaxMinor: Schema.NullOr(Schema.Int),
  currency: Schema.String,
  /** Units available over every location, as Shopify reports them; `null` until inventory is mirrored. */
  available: Schema.NullOr(Schema.Int),
  updatedAt: Schema.Finite
}) {}

export const Variant = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  sku: Schema.NullOr(Schema.String),
  priceMinor: Schema.Int,
  compareAtMinor: Schema.NullOr(Schema.Int),
  position: Schema.Int,
  available: Schema.NullOr(Schema.Int)
})

export class ProductDetail extends Schema.Class<ProductDetail>("products/ProductDetail")({
  product: ProductRow,
  descriptionHtml: Schema.String,
  variants: Schema.Array(Variant)
}) {}

export class ProductPage extends Schema.Class<ProductPage>("products/ProductPage")({
  rows: Schema.Array(ProductRow),
  nextCursor: Schema.NullOr(Schema.String),
  counts: Schema.Struct({ total: Schema.Int, status: Schema.Record(Schema.String, Schema.Int) })
}) {}
