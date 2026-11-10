import type { OrderDetail, OrderRow } from "@insyte/modules/orders/domain/Orders"
import type { Address, Order } from "@insyte/ui/app/lib/types/domain"
import type { OrderDetailSource, TimelineStep } from "@insyte/ui/app/orders/detail-source"
import { useKnownOrderTags, useOrderCommands, useOrderGate, useRefundGate } from "./order-writes.ts"
import { orderOf } from "./orders-source.ts"

/*
 * One order's source in the console: `Orders.get` as the design's record (M6.4), and its commands (M7.1): Acties,
 * Bewerken and the labels, each behind Bestellingen · Bewerken; Terugbetalen (M7.2) behind the role's refund right and
 * limit, for what is left on the order. What the
 * console does not know yet is left out rather than made up: the supplier and the "Bij leverancier" step (M8), the
 * forwarding tracker and the agents' rows. Retour starten (M9.1) is behind Retouren · Bewerken. The timeline says when each step happened, from Shopify's own
 * timestamps. The internal note is the team's (`order_notes`); the shopper's note from the checkout is shown apart.
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

function consoleOrderDetail(d: OrderDetail): OrderDetailSource {
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
    ...(d.internalNote === null ? {} : { notes: d.internalNote.body })
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
    checkoutNote: d.note ?? undefined,
    tags: { known: NO_TAGS }
  }
}

/** The record with what may be done to it: the commands behind the role's Bestellingen · Bewerken. */
export function useConsoleOrderDetail(d: OrderDetail): OrderDetailSource {
  const source = consoleOrderDetail(d)
  const commands = useOrderCommands()
  const edit = useOrderGate("orders", 2)
  const known = useKnownOrderTags()
  // What is left to refund: the total less every refund Shopify took or is still taking.
  const refundable = d.order.totalMinor -
    d.refunds.filter((r) => r.status !== "failed").reduce((s, r) => s + r.amountMinor, 0)
  const refund = useRefundGate(refundable)
  const returns = useOrderGate("returns", 2)
  const { order } = source
  return {
    ...source,
    tags: {
      known,
      write: edit.ok ? (tags, message) => void commands.setTags(order, tags, message) : undefined
    },
    writes: {
      gates: { edit, refund, returns },
      refundable: refundable / 100,
      fulfil: () => void commands.markFulfilled([order], `${order.number} als afgehandeld gemarkeerd`),
      refund: () => void commands.refund(order, refundable),
      cancel: () => void commands.cancel(order),
      saveNote: (note) => void commands.saveNote(order, note),
      saveShipping: (address) => void commands.saveShipping(order, address),
      // The supplier's advice shows only where there is a supplier (M8).
      draftSupplierMessage: () => undefined
    }
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
