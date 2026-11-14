import { Schema } from "effect"
import { StockLevel } from "../../products/domain/Products.ts"

/*
 * Suppliers as the console reads them (M8.1; domain.md §5, widgets/03 `/suppliers`). Each row carries its standing,
 * counted from the orders in the role's stores whose lines are its products (a line's supplier is its product's primary
 * `product_supply`): open (not closed or delivered), delayed (Insyte's `at_risk` marker on an open order), shipped
 * without one, and the share on time of shipped and delayed together (`null` while it has shipped nothing).
 */

export const SupplierStatus = Schema.Literals(["active", "pending", "inactive"])
export const ForwardChannel = Schema.Literals(["portal", "email", "api"])
export type ForwardChannel = typeof ForwardChannel.Type
export const StockMode = Schema.Literals(["live", "indicator", "manual"])
export type StockMode = typeof StockMode.Type

export const SupplierStats = Schema.Struct({
  products: Schema.Int,
  open: Schema.Int,
  delayed: Schema.Int,
  shipped: Schema.Int,
  onTime: Schema.NullOr(Schema.Finite)
})

export class SupplierRow extends Schema.Class<SupplierRow>("suppliers/SupplierRow")({
  id: Schema.String,
  name: Schema.String,
  contactEmail: Schema.NullOr(Schema.String),
  contactPhone: Schema.NullOr(Schema.String),
  /** "Wat ze leveren". */
  description: Schema.String,
  status: SupplierStatus,
  /** When new orders stopped going to them; `null` while they take orders. */
  pausedAt: Schema.NullOr(Schema.Finite),
  /** "Betaalde bestellingen meteen doorsturen" (forwarding, M8.2). */
  autoForward: Schema.Boolean,
  forwardChannel: ForwardChannel,
  forwardEmail: Schema.NullOr(Schema.String),
  confirmWithinHours: Schema.Int,
  defaultLeadDays: Schema.Int,
  stockMode: StockMode,
  /** The Shopify vendor it was made from; `null` for one made by hand. */
  vendor: Schema.NullOr(Schema.String),
  apiConnected: Schema.Boolean,
  /** Its own API (M8.2): the address Insyte posts to and the last connection test; `null` while none is connected. */
  api: Schema.NullOr(Schema.Struct({
    url: Schema.String,
    lastPing: Schema.NullOr(Schema.Struct({
      ok: Schema.Boolean,
      ms: Schema.NullOr(Schema.Int),
      at: Schema.Finite
    }))
  })),
  stats: SupplierStats,
  /** Its portal (M16): someone of theirs signs in, an invitation is open, or neither. */
  portal: Schema.Literals(["active", "invited", "none"]),
  createdAt: Schema.Finite
}) {}

export class SupplierList extends Schema.Class<SupplierList>("suppliers/SupplierList")({
  rows: Schema.Array(SupplierRow),
  counts: Schema.Struct({
    total: Schema.Int,
    delayedOrders: Schema.Int,
    liveStock: Schema.Int,
    portalActive: Schema.Int
  })
}) {}

export const SupplierProduct = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  image: Schema.NullOr(Schema.String),
  status: Schema.Literals(["active", "draft", "archived"]),
  /** Units over every location as Shopify reports them; `null` until inventory is mirrored. */
  available: Schema.NullOr(Schema.Int),
  /** `available` against the low-stock threshold by its emptiest variant, as the products list reads it. */
  stock: Schema.NullOr(StockLevel)
})

export class SupplierDetail extends Schema.Class<SupplierDetail>("suppliers/SupplierDetail")({
  supplier: SupplierRow,
  /** Their products (primary), by title, up to 50. */
  products: Schema.Array(SupplierProduct),
  /** Their open orders with a delay, newest first, up to 8. */
  delayedOrders: Schema.Array(Schema.Struct({ id: Schema.String, number: Schema.String }))
}) {}

export const ListInput = Schema.Struct({
  /** Only suppliers that supply every one of these products ("naar een andere leverancier"). */
  carries: Schema.optional(Schema.Array(Schema.String).check(Schema.isMaxLength(500))),
  /** Leave out the paused ones. */
  notPaused: Schema.optional(Schema.Boolean)
})
