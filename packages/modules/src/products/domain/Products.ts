import { Schema } from "effect"

/*
 * Producten (M6.4; domain.md §4.1): the mirror's products with their variants' price range and stock, and Insyte's own
 * cost price (M7.3). The commands are `Commands.ts`.
 */

/** At or under this many units, a variant is running low (widgets/02 `stock`): the workspace's default. */
export const LOW_STOCK = 12

/**
 * A product's stock as the list colours it, over the variants Shopify tracks and reported a count for: sold out when
 * they are all at nothing, low where one is at or under the threshold, else in stock. `null` without such a variant.
 */
export const StockLevel = Schema.Literals(["available", "low", "out"])
export type StockLevel = typeof StockLevel.Type

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
  /** What the product costs the store (M7.3): Insyte's own figure, never Shopify's; `null` until someone enters it. */
  costMinor: Schema.NullOr(Schema.Int),
  currency: Schema.String,
  /** Units over its tracked variants and every location, as Shopify reports them; `null` without a counted variant. */
  available: Schema.NullOr(Schema.Int),
  /** `available` against the low-stock threshold, by its lowest variant. */
  stock: Schema.NullOr(StockLevel),
  /** Days from order to doorstep, on average over its last delivered orders; `null` before one arrived. */
  avgDeliveryDays: Schema.NullOr(Schema.Finite),
  /** Who supplies it (M8.1): its primary `product_supply`, made from the Shopify vendor or assigned by hand. */
  supplierId: Schema.NullOr(Schema.String),
  supplierName: Schema.NullOr(Schema.String),
  /** The primary supplier's delivery time for it, in days (`product_supply.lead_days`). */
  leadDays: Schema.NullOr(Schema.Int),
  updatedAt: Schema.Finite
}) {}

/** One location's count of a variant: Shopify's location id, or `supplier` for a supplier's own report (M16). */
export const Level = Schema.Struct({
  locationId: Schema.String,
  source: Schema.Literals(["shopify", "supplier"]),
  available: Schema.Int,
  reportedAt: Schema.Finite
})

export const Variant = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  sku: Schema.NullOr(Schema.String),
  priceMinor: Schema.Int,
  compareAtMinor: Schema.NullOr(Schema.Int),
  position: Schema.Int,
  /** Whether Shopify counts its stock; an untracked variant has no units. */
  tracked: Schema.Boolean,
  /** Over Shopify's locations, each at nothing or more; `null` untracked or until one reported. */
  available: Schema.NullOr(Schema.Int),
  /** Per location, Shopify's first, the most stocked first. */
  levels: Schema.Array(Level)
})

export class ProductDetail extends Schema.Class<ProductDetail>("products/ProductDetail")({
  product: ProductRow,
  /** Every photograph, in Shopify's order (the row carries the first). */
  images: Schema.Array(Schema.String),
  descriptionHtml: Schema.String,
  variants: Schema.Array(Variant),
  /** Units sold in the last 30 days, the pace its stock is read at. */
  soldLast30: Schema.Int,
  /** The threshold its stock level was read against. */
  lowStockAt: Schema.Int
}) {}

/** The panel's counts (ADR-0028): products per status, and per Aandacht cut (`use-cases/attention.ts`). */
export const ProductCounts = Schema.Struct({
  active: Schema.Int,
  draft: Schema.Int,
  archived: Schema.Int,
  attentionReturns: Schema.Int,
  attentionComplaints: Schema.Int,
  attentionChecks: Schema.Int
})
export type ProductCounts = typeof ProductCounts.Type

export class ProductPage extends Schema.Class<ProductPage>("products/ProductPage")({
  rows: Schema.Array(ProductRow),
  nextCursor: Schema.NullOr(Schema.String),
  counts: Schema.Struct({ total: Schema.Int, status: Schema.Record(Schema.String, Schema.Int) })
}) {}

/** `Products.lowStock`: what runs low, in the principal's stores (or one), against the workspace's threshold or this one. */
export const LowStockInput = Schema.Struct({
  storeId: Schema.optional(Schema.String),
  threshold: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100_000 }))),
  limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 200 })))
})
export type LowStockInput = typeof LowStockInput.Type

export class LowStockRow extends Schema.Class<LowStockRow>("products/LowStockRow")({
  productId: Schema.String,
  storeId: Schema.String,
  title: Schema.String,
  image: Schema.NullOr(Schema.String),
  status: Schema.Literals(["active", "draft", "archived"]),
  level: Schema.Literals(["low", "out"]),
  /** Units over every variant and location. */
  available: Schema.Int,
  /** The variants at or under the threshold, the emptiest first. */
  variants: Schema.Array(Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    sku: Schema.NullOr(Schema.String),
    available: Schema.Int
  })),
  soldLast30: Schema.Int,
  /** Orders with it that are not delivered, cancelled or refunded yet. */
  openOrders: Schema.Int,
  /** How long `available` lasts at the last 30 days' pace; `null` when it did not sell. */
  daysLeft: Schema.NullOr(Schema.Finite),
  supplierId: Schema.NullOr(Schema.String),
  supplierName: Schema.NullOr(Schema.String),
  leadDays: Schema.NullOr(Schema.Int)
}) {}

export class LowStockPage extends Schema.Class<LowStockPage>("products/LowStockPage")({
  threshold: Schema.Int,
  /** Sold out first, then the soonest to run out. */
  rows: Schema.Array(LowStockRow)
}) {}
