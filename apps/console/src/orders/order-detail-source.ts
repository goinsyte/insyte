import type { OrderDetail, OrderRow } from "@insyte/modules/orders/domain/Orders"
import type { Address, Order } from "@insyte/ui/app/lib/types/domain"
import type { OrderDetailSource, TimelineStep } from "@insyte/ui/app/orders/detail-source"
import { useKnownOrderTags, useOrderCommands, useOrderGate, useRefundGate } from "./order-writes.ts"
import { orderOf } from "./orders-source.ts"

/*
 * One order's source in the console: `Orders.get` as the design's record (M6.4), and its commands (M7.1): Acties,
 * Bewerken and the labels, each behind Bestellingen · Bewerken; Terugbetalen (M7.2) behind the role's refund right and
 * limit, for what is left on the order. Retour starten (M9.1) is behind Retouren · Bewerken. The timeline says when
 * each step happened, from Shopify's own timestamps, the forwarding legs and the supplier's work (the "Bij leverancier"
 * step, M8.2–8.3) and what AfterShip last said of each parcel (M8.4: only the latest checkpoint is kept, not every
 * scan). The supplier line names the order's suppliers; Insyte's advice on a delayed order drafts the design's ticket to
 * the supplier. The internal note is the team's (`order_notes`); the shopper's note from the checkout is shown apart.
 * The agents' rows are left out until they exist.
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

/** "Bij leverancier", one step per supplier: how far its work has come, in the supplier's own dates. */
const supplierSteps = (d: OrderDetail): Array<TimelineStep> =>
  d.supplierWork.map((w) => {
    const base = { kind: "supplier" as const, label: "Bij leverancier" }
    if (w.shippedAt !== null) return { ...base, done: true, detail: `Verzonden door ${w.name} · ${long(w.shippedAt)}` }
    if (w.late && w.handoffBy !== null) {
      return { ...base, done: w.acceptedAt !== null, detail: `${w.name} · overdracht was ${long(w.handoffBy)}` }
    }
    if (w.acceptedAt !== null) {
      return { ...base, done: true, detail: `Geaccepteerd door ${w.name} · ${long(w.acceptedAt)}` }
    }
    if (w.forwardedAt !== null) {
      return { ...base, done: true, detail: `Doorgestuurd naar ${w.name} · ${long(w.forwardedAt)}` }
    }
    return { ...base, done: false, detail: `Nog door te sturen naar ${w.name}` }
  })

/** What AfterShip last said of each parcel still on its way: the latest checkpoint, or the carrier's exception. */
const parcelSteps = (d: OrderDetail): Array<TimelineStep> =>
  d.fulfilments.flatMap((f) => {
    const p = f.delivery
    if (p === null || p.status === "delivered" || p.status === "pending") return []
    const said = p.status === "exception" ? p.exception ?? p.checkpoint : p.checkpoint
    if (said === null && p.lastEventAt === null) return []
    const expected = p.estimatedDelivery === null || p.status === "exception"
      ? null
      : `verwacht ${long(p.estimatedDelivery)}`
    return [{
      kind: "shipped" as const,
      done: true,
      label: p.status === "exception"
        ? "Probleem bij de vervoerder"
        : p.status === "out_for_delivery"
        ? "Onderweg voor bezorging"
        : "Onderweg",
      detail: [said, p.lastEventAt === null ? null : long(p.lastEventAt), expected]
        .filter((t): t is string => t !== null && t !== "")
        .join(" · ")
    }]
  })

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
  return [
    placed,
    paid,
    ...supplierSteps(d),
    {
      kind: "shipped",
      done: o.status === "shipped" || o.status === "delivered",
      label: "Verzonden",
      detail: o.trackingNumber === null
        ? shippedAt === null ? "Opgehaald door vervoerder" : long(shippedAt)
        : `${o.carrier ?? "Vervoerder"} · ${o.trackingNumber}`
    },
    ...parcelSteps(d),
    {
      kind: "delivered",
      done: o.status === "delivered",
      label: "Bezorgd",
      detail: o.status === "delivered" ? delivered === null ? "Bevestigd" : long(delivered) : "In afwachting"
    }
  ]
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
    ...(d.internalNote === null ? {} : { notes: d.internalNote.body })
  }
  const method = methodOf(d)
  const phone = d.shippingAddress?.phone ?? null
  const suppliers = d.order.suppliers.map((s) => s.name).join(", ")
  return {
    order,
    ...(suppliers === "" ? {} : { supplier: suppliers }),
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
      // Insyte's advice on a delayed order, where it has a supplier: the design's ticket, drafted for the team.
      draftSupplierMessage: (supplier) => void commands.draftSupplierMessage(order, supplier)
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
