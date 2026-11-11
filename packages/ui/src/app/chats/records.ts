import { useMemo } from "react"
import {
  type ChatRecordKind,
  type ChatRecordRef,
  customers as seedCustomers,
  products as seedProducts
} from "../../data-source"
import { formatCurrency } from "../lib/format"
import type {
  Chargeback,
  ChargebackStatus,
  Customer,
  Order,
  OrderStatus,
  Product,
  Ticket,
  TicketStatus
} from "../lib/types/domain"
import { applyCustomerEdits, applyProductEdits, useWorkspace } from "../stores/workspace-store"

/*
 * What a conversation can carry from the app. A record in a message is a reference, never a copy:
 * the card reads the workspace on every render, so a refund done beside the chat shows on the card
 * that was shared an hour ago. One shape for the five kinds keeps the card, the picker and the side
 * column from each learning five records.
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

type Pools = {
  orders: Order[]
  customers: Customer[]
  products: Product[]
  chargebacks: Chargeback[]
  tickets: Ticket[]
}

/** Everything a conversation can point at, with this session's edits applied. */
export function usePools(): Pools {
  const orders = useWorkspace((s) => s.orders)
  const chargebacks = useWorkspace((s) => s.chargebacks)
  const tickets = useWorkspace((s) => s.tickets)
  const createdCustomers = useWorkspace((s) => s.createdCustomers)
  const customerEdits = useWorkspace((s) => s.customerEdits)
  const createdProducts = useWorkspace((s) => s.createdProducts)
  const productEdits = useWorkspace((s) => s.productEdits)
  const customers = useMemo(() => applyCustomerEdits([...createdCustomers, ...seedCustomers], customerEdits), [
    createdCustomers,
    customerEdits
  ])
  const products = useMemo(() => applyProductEdits([...createdProducts, ...seedProducts], productEdits), [
    createdProducts,
    productEdits
  ])
  return useMemo(() => ({ orders, customers, products, chargebacks, tickets }), [
    orders,
    customers,
    products,
    chargebacks,
    tickets
  ])
}

export function resolve(ref: ChatRecordRef, p: Pools): ChatRecord | null {
  switch (ref.kind) {
    case "order": {
      const o = p.orders.find((x) => x.id === ref.id)
      if (!o) return null
      const items = o.line_items.reduce((n, l) => n + l.quantity, 0)
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
    case "customer": {
      const c = p.customers.find((x) => x.id === ref.id)
      if (!c) return null
      return {
        ref,
        kind: "customer",
        customer: c,
        code: c.email,
        title: c.name,
        detail: `${c.orders_count} ${c.orders_count === 1 ? "bestelling" : "bestellingen"}`,
        amount: formatCurrency(c.lifetime_value, "USD"),
        to: "/customers/$customerId",
        params: { customerId: c.id }
      }
    }
    case "product": {
      const pr = p.products.find((x) => x.id === ref.id)
      if (!pr) return null
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
    case "chargeback": {
      const c = p.chargebacks.find((x) => x.id === ref.id)
      if (!c) return null
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
    case "ticket": {
      const t = p.tickets.find((x) => x.id === ref.id)
      if (!t) return null
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
  }
}

export function useRecord(ref: ChatRecordRef | undefined): ChatRecord | null {
  const pools = usePools()
  return useMemo(() => (ref ? resolve(ref, pools) : null), [ref, pools])
}

/** The # picker: what matches the typed text, across all five kinds, the likeliest first. */
export function searchRecords(q: string, p: Pools, kinds?: ReadonlyArray<ChatRecordKind>, limit = 7): ChatRecord[] {
  const needle = q.trim().toLowerCase()
  const want = (k: ChatRecordKind) => !kinds || kinds.includes(k)
  const refs: ChatRecordRef[] = []
  const hit = (...fields: Array<string | undefined>) => !needle || fields.some((f) => f?.toLowerCase().includes(needle))
  if (want("order")) {
    for (const o of p.orders) if (hit(o.number, o.customer_name)) refs.push({ kind: "order", id: o.id })
  }
  if (want("chargeback")) {
    for (const c of p.chargebacks) {
      if (hit(c.case_number, c.customer_name)) refs.push({ kind: "chargeback", id: c.id })
    }
  }
  if (want("ticket")) { for (const t of p.tickets) if (hit(t.number, t.title)) refs.push({ kind: "ticket", id: t.id }) }
  if (want("customer")) {
    for (const c of p.customers) if (hit(c.name, c.email)) refs.push({ kind: "customer", id: c.id })
  }
  if (want("product")) {
    for (const pr of p.products) if (hit(pr.title, pr.variants[0]?.sku)) refs.push({ kind: "product", id: pr.id })
  }
  /* Without a query the list mixes kinds rather than showing seven orders. */
  const ordered = needle ? refs : interleave(refs)
  return ordered
    .slice(0, limit * 3)
    .map((r) => resolve(r, p))
    .filter((r): r is ChatRecord => r !== null)
    .slice(0, limit)
}

function interleave(refs: ChatRecordRef[]): ChatRecordRef[] {
  const byKind = new Map<ChatRecordKind, ChatRecordRef[]>()
  for (const r of refs) byKind.set(r.kind, [...(byKind.get(r.kind) ?? []), r])
  const out: ChatRecordRef[] = []
  for (let i = 0; out.length < refs.length; i++) {
    let added = false
    for (const list of byKind.values()) {
      const r = list[i]
      if (r) {
        out.push(r)
        added = true
      }
    }
    if (!added) break
  }
  return out
}

/** Record handles written in text: SO-12224, DSP-2210, #5142. */
export function refsInText(text: string, p: Pools): ChatRecordRef[] {
  const out: ChatRecordRef[] = []
  for (const m of text.matchAll(/\bSO-\d{5}\b/g)) {
    const o = p.orders.find((x) => x.number === m[0])
    if (o) out.push({ kind: "order", id: o.id })
  }
  for (const m of text.matchAll(/\bDSP-\d{4}\b/g)) {
    const c = p.chargebacks.find((x) => x.case_number === m[0])
    if (c) out.push({ kind: "chargeback", id: c.id })
  }
  for (const m of text.matchAll(/#(\d{4})\b/g)) {
    const t = p.tickets.find((x) => x.number === `#${m[1]}`)
    if (t) out.push({ kind: "ticket", id: t.id })
  }
  return out
}

export const sameRef = (a: ChatRecordRef, b: ChatRecordRef) => a.kind === b.kind && a.id === b.id
