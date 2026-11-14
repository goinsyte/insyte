import { Schema } from "effect"

/*
 * Bestellingen, read-only (M6.4; domain.md §4.3, widgets/03): the mirror's orders as the list and the detail show
 * them. Amounts in minor units with their currency; derived row fields (`lineCount`, `hasTracking`) computed in SQL.
 * The commands are `Commands.ts` (M7.1).
 */

export const OrderStatus = Schema.Literals([
  "placed",
  "paid",
  "at_supplier",
  "shipped",
  "delivered",
  "cancelled",
  "refunded"
])
export const PaymentStatus = Schema.Literals(["pending", "paid", "partially_refunded", "refunded", "voided"])
export const FulfillmentStatus = Schema.Literals(["unfulfilled", "partial", "fulfilled", "returned"])

export const Address = Schema.NullOr(Schema.Struct({
  name: Schema.NullOr(Schema.String),
  line1: Schema.NullOr(Schema.String),
  line2: Schema.NullOr(Schema.String),
  city: Schema.NullOr(Schema.String),
  postcode: Schema.NullOr(Schema.String),
  region: Schema.NullOr(Schema.String),
  country: Schema.NullOr(Schema.String),
  phone: Schema.NullOr(Schema.String)
}))

export class OrderRow extends Schema.Class<OrderRow>("orders/OrderRow")({
  id: Schema.String,
  number: Schema.String,
  storeId: Schema.String,
  shopifyId: Schema.String,
  customerId: Schema.NullOr(Schema.String),
  customerName: Schema.String,
  customerEmail: Schema.NullOr(Schema.String),
  status: OrderStatus,
  paymentStatus: PaymentStatus,
  fulfillmentStatus: FulfillmentStatus,
  totalMinor: Schema.Int,
  currency: Schema.String,
  tags: Schema.Array(Schema.String),
  lineCount: Schema.Int,
  hasTracking: Schema.Boolean,
  carrier: Schema.NullOr(Schema.String),
  trackingNumber: Schema.NullOr(Schema.String),
  /** When Insyte, a supplier's lateness or an operator marked it delayed; null when it is not (M8.4, M7). */
  delayedAt: Schema.NullOr(Schema.Finite),
  /** The suppliers its forwarding legs went or go to, by name (M8.2); none before it is paid or for its own stock. */
  suppliers: Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String })),
  placedAt: Schema.Finite,
  updatedAt: Schema.Finite
}) {}

export const OrderLine = Schema.Struct({
  id: Schema.String,
  productId: Schema.NullOr(Schema.String),
  variantId: Schema.NullOr(Schema.String),
  sku: Schema.NullOr(Schema.String),
  title: Schema.String,
  variantTitle: Schema.NullOr(Schema.String),
  quantity: Schema.Int,
  unitPriceMinor: Schema.Int,
  /** The product's first photograph, where the line names a product Insyte holds. */
  imageUrl: Schema.NullOr(Schema.String)
})

export const Fulfilment = Schema.Struct({
  id: Schema.String,
  status: Schema.String,
  carrier: Schema.NullOr(Schema.String),
  trackingNumber: Schema.NullOr(Schema.String),
  trackingUrl: Schema.NullOr(Schema.String),
  trackingStatus: Schema.NullOr(Schema.String),
  shippedAt: Schema.NullOr(Schema.Finite),
  deliveredAt: Schema.NullOr(Schema.Finite),
  /**
   * What AfterShip last said of the parcel (M8.4), where it tracks it: its status, the latest checkpoint and when, a
   * carrier exception, the expected day. Only the latest is kept, not every scan.
   */
  delivery: Schema.NullOr(Schema.Struct({
    status: Schema.String,
    checkpoint: Schema.NullOr(Schema.String),
    exception: Schema.NullOr(Schema.String),
    lastEventAt: Schema.NullOr(Schema.Finite),
    estimatedDelivery: Schema.NullOr(Schema.Finite)
  }))
})

/**
 * A supplier the order went to (M8.2, M8.3): when its leg was sent, and its work as the supplier reports it: accepted,
 * the hand-off it promised (`handoffBy`), shipped. `late` once the hand-off has passed with nothing shipped.
 */
export const OrderSupplier = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  /** The leg's state (`forwarding_items.state`). */
  state: Schema.String,
  forwardedAt: Schema.NullOr(Schema.Finite),
  /** The work's status (`supplier_work.status`), once the leg reached the supplier. */
  work: Schema.NullOr(Schema.String),
  acceptedAt: Schema.NullOr(Schema.Finite),
  handoffBy: Schema.NullOr(Schema.Finite),
  shippedAt: Schema.NullOr(Schema.Finite),
  late: Schema.Boolean
})

export const Refund = Schema.Struct({
  id: Schema.String,
  amountMinor: Schema.Int,
  currency: Schema.String,
  note: Schema.NullOr(Schema.String),
  /** `pending` while an Insyte refund waits for Shopify (M7.2); `failed` when it never got there. */
  status: Schema.Literals(["pending", "succeeded", "failed"]),
  createdAt: Schema.Finite
})

/** The customer as the order's sidebar shows them: how often they ordered and for how much, as Shopify keeps it. */
export const OrderCustomer = Schema.Struct({
  ordersCount: Schema.Int,
  lifetimeValueMinor: Schema.Int,
  currency: Schema.NullOr(Schema.String)
})

export class OrderDetail extends Schema.Class<OrderDetail>("orders/OrderDetail")({
  order: OrderRow,
  /** Null for a guest order, or a customer since erased (`customers/redact`). */
  customer: Schema.NullOr(OrderCustomer),
  subtotalMinor: Schema.Int,
  shippingMinor: Schema.Int,
  taxMinor: Schema.Int,
  discountsMinor: Schema.Int,
  paymentGateway: Schema.NullOr(Schema.String),
  cardLast4: Schema.NullOr(Schema.String),
  shippingAddress: Address,
  /** The shopper's own note from the checkout, as Shopify keeps it: read-only. */
  note: Schema.NullOr(Schema.String),
  /** The team's internal note (`Orders.setNote`, M7.1): never sent to Shopify or shown to a supplier. */
  internalNote: Schema.NullOr(Schema.Struct({
    body: Schema.String,
    updatedAt: Schema.Finite,
    updatedBy: Schema.NullOr(Schema.String)
  })),
  channel: Schema.NullOr(Schema.String),
  paidAt: Schema.NullOr(Schema.Finite),
  shippedAt: Schema.NullOr(Schema.Finite),
  cancelledAt: Schema.NullOr(Schema.Finite),
  refundedAt: Schema.NullOr(Schema.Finite),
  lines: Schema.Array(OrderLine),
  fulfilments: Schema.Array(Fulfilment),
  refunds: Schema.Array(Refund),
  /** Where its legs went (M8.2), the first forwarded first. */
  supplierWork: Schema.Array(OrderSupplier)
}) {}

/** A page of orders, the cursor to the next, and the counts the header and the facets show. */
export class OrderPage extends Schema.Class<OrderPage>("orders/OrderPage")({
  rows: Schema.Array(OrderRow),
  nextCursor: Schema.NullOr(Schema.String),
  counts: Schema.Struct({
    total: Schema.Int,
    status: Schema.Record(Schema.String, Schema.Int)
  })
}) {}
