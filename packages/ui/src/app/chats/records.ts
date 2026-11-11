import type { ChatRecordKind, ChatRecordRef } from "../../data-source"
import { formatCurrency } from "../lib/format"
import type {
  Chargeback,
  ChargebackStatus,
  Currency,
  Customer,
  Order,
  OrderStatus,
  Product,
  Ticket,
  TicketStatus
} from "../lib/types/domain"
import { useChatsSource } from "./source"

/*
 * What a conversation can carry from the app. A record in a message is a reference, never a copy:
 * the card reads the record through the host on every render, so a refund done beside the chat shows
 * on the card that was shared an hour ago. One shape for the five kinds keeps the card, the picker and
 * the side column from each learning five records; the builders below make it, for either host.
 */

export type ChatRecord =
  & {
    ref: ChatRecordRef
    /** The record's own handle: SO-12224, DSP-2210, #5142, a name. */
    code: string
    title: string
    /** One line under the title: who, what, how much. */
    detail: string
    amount?: string
    status?: { label: string; tone: Tone }
    /** Where the full record lives. */
    to: string
    params?: Record<string, string>
  }
  & (
    | { kind: "order"; order: Order }
    | { kind: "customer"; customer: Customer }
    | { kind: "product"; product: Product }
    | { kind: "chargeback"; chargeback: Chargeback }
    | { kind: "ticket"; ticket: Ticket }
  )

export type Tone = "arc" | "green" | "amber" | "red" | "quiet"

export const KIND_LABEL: Record<ChatRecordKind, string> = {
  order: "Bestelling",
  customer: "Klant",
  product: "Product",
  chargeback: "Chargeback",
  ticket: "Ticket"
}

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: Tone }> = {
  placed: { label: "Geplaatst", tone: "quiet" },
  paid: { label: "Betaald", tone: "green" },
  at_supplier: { label: "Bij leverancier", tone: "amber" },
  shipped: { label: "Verzonden", tone: "arc" },
  delivered: { label: "Bezorgd", tone: "green" },
  cancelled: { label: "Geannuleerd", tone: "quiet" },
  refunded: { label: "Terugbetaald", tone: "quiet" }
}

export const CHARGEBACK_STATUS: Record<ChargebackStatus, { label: string; tone: Tone }> = {
  open: { label: "Open", tone: "amber" },
  awaiting_evidence: { label: "Wacht op bewijs", tone: "red" },
  submitted: { label: "Ingediend", tone: "arc" },
  won: { label: "Gewonnen", tone: "green" },
  lost: { label: "Verloren", tone: "quiet" }
}

export const TICKET_STATUS: Record<TicketStatus, { label: string; tone: Tone }> = {
  intake: { label: "Nieuw", tone: "arc" },
  in_progress: { label: "Bezig", tone: "amber" },
  awaiting_reply: { label: "Wacht op antwoord", tone: "quiet" },
  done: { label: "Klaar", tone: "green" }
}

const PROVIDER: Record<Chargeback["provider"], string> = { klarna: "Klarna", stripe: "Stripe", paypal: "PayPal" }

/** An order as its card says it. */
export function orderRecord(o: Order, ref: ChatRecordRef = { kind: "order", id: o.id }): ChatRecord {
  const items = o.line_items.length > 0 ? o.line_items.reduce((n, l) => n + l.quantity, 0) : (o.line_count ?? 0)
  return {
    ref,
    kind: "order",
    order: o,
    code: o.number,
    title: o.customer_name,
    detail: `${items} ${items === 1 ? "artikel" : "artikelen"}${o.carrier ? ` · ${o.carrier}` : ""}`,
    amount: formatCurrency(o.total, o.currency, { maximumFractionDigits: 2 }),
    status: ORDER_STATUS[o.status],
    to: "/orders/$orderId",
    params: { orderId: o.id }
  }
}

/** A customer as their card says them; the design's figures are in dollars. */
export function customerRecord(
  c: Customer,
  currency: Currency = "USD",
  ref: ChatRecordRef = { kind: "customer", id: c.id }
): ChatRecord {
  return {
    ref,
    kind: "customer",
    customer: c,
    code: c.email,
    title: c.name,
    detail: `${c.orders_count} ${c.orders_count === 1 ? "bestelling" : "bestellingen"}`,
    amount: formatCurrency(c.lifetime_value, currency),
    to: "/customers/$customerId",
    params: { customerId: c.id }
  }
}

export function productRecord(pr: Product, ref: ChatRecordRef = { kind: "product", id: pr.id }): ChatRecord {
  const stock = pr.variants.reduce((n, v) => n + v.inventory_level, 0)
  return {
    ref,
    kind: "product",
    product: pr,
    code: pr.variants[0]?.sku ?? pr.id,
    title: pr.title,
    detail: `${stock} op voorraad · ${pr.variants.length} ${pr.variants.length === 1 ? "variant" : "varianten"}`,
    amount: formatCurrency(pr.price, pr.currency, { maximumFractionDigits: 2 }),
    status: pr.status === "active"
      ? { label: "Actief", tone: "green" }
      : pr.status === "draft"
      ? { label: "Concept", tone: "quiet" }
      : { label: "Gearchiveerd", tone: "quiet" },
    to: "/products/$productId",
    params: { productId: pr.id }
  }
}

export function chargebackRecord(c: Chargeback, ref: ChatRecordRef = { kind: "chargeback", id: c.id }): ChatRecord {
  return {
    ref,
    kind: "chargeback",
    chargeback: c,
    code: c.case_number,
    title: `${c.customer_name} · ${PROVIDER[c.provider]}`,
    detail: c.reason,
    amount: formatCurrency(c.amount, c.currency, { maximumFractionDigits: 2 }),
    status: CHARGEBACK_STATUS[c.status],
    to: "/chargebacks/$chargebackId",
    params: { chargebackId: c.id }
  }
}

export function ticketRecord(t: Ticket, ref: ChatRecordRef = { kind: "ticket", id: t.id }): ChatRecord {
  return {
    ref,
    kind: "ticket",
    ticket: t,
    code: t.number,
    title: t.title,
    detail: t.assignee_ids.length ? `${t.assignee_ids.length} toegewezen` : "Niet toegewezen",
    status: TICKET_STATUS[t.status],
    to: "/tickets"
  }
}

/** The record a reference names, live, through the host; `null` once it is gone. */
export function useRecord(ref: ChatRecordRef | undefined): ChatRecord | null {
  return useChatsSource().useRecord(ref)
}

export const sameRef = (a: ChatRecordRef, b: ChatRecordRef) => a.kind === b.kind && a.id === b.id
