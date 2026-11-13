import type { OrderDetail, Refund } from "@insyte/modules/orders/domain/Orders"
import type { OrderTracking } from "@insyte/modules/tracking/domain/Tracking"
import { orderV1 } from "../commerce/present.ts"
import { iso } from "../shared/time.ts"

/* One order in the public shape (M7, M8.4, M19.2): with its lines, address, note and refunds, and its parcels. */

export const orderDetailV1 = (d: OrderDetail) => ({
  ...orderV1(d.order),
  lines: d.lines.map((l) => ({
    title: l.title,
    variant_title: l.variantTitle,
    sku: l.sku,
    quantity: l.quantity,
    unit_price_minor: l.unitPriceMinor
  })),
  shipping_address: d.shippingAddress,
  internal_note: d.internalNote?.body ?? null,
  refunds: d.refunds.map((r) => ({
    id: r.id,
    order_id: d.order.id,
    amount: { amount_minor: r.amountMinor, currency: r.currency },
    status: r.status,
    note: r.note,
    created_at: iso(r.createdAt)!
  }))
})

/** A refund just made, as its order now holds it. */
export const refundRowV1 = (orderId: string, refund: typeof Refund.Type) => ({
  id: refund.id,
  order_id: orderId,
  amount: { amount_minor: refund.amountMinor, currency: refund.currency },
  status: refund.status,
  note: refund.note,
  created_at: iso(refund.createdAt)!
})

export const trackingV1 = (t: OrderTracking) => ({
  order_id: t.orderId,
  delayed_at: iso(t.delayedAt),
  delivered_at: iso(t.deliveredAt),
  parcels: t.parcels.map((p) => ({
    carrier: p.carrier,
    tracking_number: p.trackingNumber,
    tracking_url: p.trackingUrl,
    shipped_at: iso(p.shippedAt),
    status: p.status,
    checkpoint: p.checkpoint,
    exception: p.exception,
    estimated_delivery: iso(p.estimatedDelivery),
    delivered_at: iso(p.deliveredAt)
  }))
})
