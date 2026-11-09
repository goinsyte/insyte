import type { OrderDetail, OrderRow } from "@insyte/modules/orders/domain/Orders"
import type { Address, Order } from "@insyte/ui/app/lib/types/domain"
import type { OrderDetailSource, TimelineStep } from "@insyte/ui/app/orders/detail-source"
import { orderOf } from "./orders-source.ts"

/*
 * One order's source in the console (M6.4): `Orders.get` as the design's record. The console reads before it changes
 * (M7), so there are no `writes`: no Acties, no Bewerken, labels shown and not edited. What the console does not know
 * yet is left out rather than made up: the supplier and the "Bij leverancier" step (M8), the forwarding tracker, the
 * agents' rows and the returns. The timeline says when each step happened, from Shopify's own timestamps.
 */

/* `formatLong`'s format, kept here because the screen module is the relaxed program's (`tsconfig.strict.json`). */
const long = (ms: number) =>
  new Intl.DateTimeFormat("nl-NL", {
    timeZone: "Europe/Amsterdam",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(ms))

const GATEWAY: Record<string, string> = {
  shopify_payments: "Shopify Payments",
  paypal: "PayPal",
  klarna: "Klarna",
  manual: "Handmatig",
  bogus: "Testbetaling",
  gift_card: "Cadeaubon"
}

const methodOf = (d: OrderDetail) => {
  const gateway = d.paymentGateway === null ? "Onbekende betaalmethode" : GATEWAY[d.paymentGateway] ?? d.paymentGateway
  return d.cardLast4 === null ? gateway : `${gateway} · kaart eindigend op ${d.cardLast4}`
}

const addressOf = (a: OrderDetail["shippingAddress"]): Address | undefined =>
  a === null ? undefined : {
    line1: a.line1 ?? "",
    ...(a.line2 === null ? {} : { line2: a.line2 }),
    city: a.city ?? "",
    region: a.region ?? "",
    postal_code: a.postcode ?? "",
    country: a.country ?? ""
  }

function timelineOf(d: OrderDetail, method: string): Array<TimelineStep> {
  const o = d.order
  const placed: TimelineStep = { kind: "placed", done: true, label: "Bestelling geplaatst", detail: long(o.placedAt) }
  const paid: TimelineStep = {
    kind: "paid",
    done: d.paidAt !== null || o.paymentStatus !== "pending",
    label: "Betaling geïnd",
    detail: d.paidAt === null ? method : `${method} · ${long(d.paidAt)}`
  }
  if (o.status === "cancelled" || o.status === "refunded") {
    const at = o.status === "cancelled" ? d.cancelledAt : d.refundedAt
    return [placed, paid, {
      kind: "closed",
      done: true,
      label: o.status === "cancelled" ? "Geannuleerd" : "Terugbetaald",
      detail: at === null ? "In Shopify" : long(at)
    }]
  }
  const shippedAt = d.shippedAt ?? d.fulfilments.find((f) => f.shippedAt !== null)?.shippedAt ?? null
  const delivered = d.fulfilments.find((f) => f.deliveredAt !== null)?.deliveredAt ?? null
  return [placed, paid, {
    kind: "shipped",
    done: o.status === "shipped" || o.status === "delivered",
    label: "Verzonden",
    detail: o.trackingNumber === null
      ? shippedAt === null ? "Opgehaald door vervoerder" : long(shippedAt)
      : `${o.carrier ?? "Vervoerder"} · ${o.trackingNumber}`
  }, {
    kind: "delivered",
    done: o.status === "delivered",
    label: "Bezorgd",
    detail: o.status === "delivered" ? delivered === null ? "Bevestigd" : long(delivered) : "In afwachting"
  }]
}

const NO_TAGS: ReadonlyArray<string> = []

export function consoleOrderDetail(d: OrderDetail): OrderDetailSource {
  const images = new Map(d.lines.map((l) => [l.id, l.imageUrl]))
  const skus = new Map(d.lines.map((l) => [l.id, l.sku]))
  const address = addressOf(d.shippingAddress)
  const order: Order = {
    ...orderOf(d.order),
    line_items: d.lines.map((l) => ({
      id: l.id,
      product_id: l.productId ?? "",
      variant_id: l.variantId ?? "",
      title: l.title,
      ...(l.variantTitle === null ? {} : { variant_title: l.variantTitle }),
      quantity: l.quantity,
      unit_price: l.unitPriceMinor / 100
    })),
    ...(address === undefined ? {} : { shipping_address: address }),
    ...(d.note === null ? {} : { notes: d.note })
  }
  const method = methodOf(d)
  const phone = d.shippingAddress?.phone ?? null
  return {
    order,
    customer: d.customer === null ? undefined : {
      orders_count: d.customer.ordersCount,
      lifetime_value: d.customer.lifetimeValueMinor / 100,
      currency: (d.customer.currency ?? d.order.currency) as Order["currency"],
      ...(phone === null ? {} : { phone })
    },
    imageOf: (line) => images.get(line.id) ?? undefined,
    skuOf: (line) => skus.get(line.id) ?? undefined,
    totals: {
      subtotal: d.subtotalMinor / 100,
      shipping: d.shippingMinor / 100,
      tax: d.taxMinor / 100,
      discount: d.discountsMinor / 100
    },
    timeline: timelineOf(d, method),
    payment: { method, collectedAt: d.paidAt === null ? undefined : new Date(d.paidAt).toISOString() },
    arriving: false,
    tags: { known: NO_TAGS }
  }
}

/** The record while `Orders.get` is still out: the list's row draws the header, the record's skeleton the body. */
export function arrivingOrderDetail(row: OrderRow): OrderDetailSource {
  return {
    order: orderOf(row),
    imageOf: () => undefined,
    skuOf: () => undefined,
    totals: { subtotal: 0, shipping: 0, tax: 0, discount: 0 },
    timeline: [],
    payment: { method: "" },
    arriving: true,
    tags: { known: NO_TAGS }
  }
}
