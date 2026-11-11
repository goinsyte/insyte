import { useMemo } from "react"
import {
  chargebacks as seedChargebacks,
  type ChatRecordKind,
  type ChatRecordRef,
  customers as seedCustomers,
  orders as seedOrders,
  products as seedProducts
} from "../../data-source"
import type { Chargeback, Customer, Order, Product, Ticket } from "../lib/types/domain"
import { applyCustomerEdits, applyProductEdits, useWorkspace } from "../stores/workspace-store"
import { chargebackRecord, type ChatRecord, customerRecord, orderRecord, productRecord, ticketRecord } from "./records"

/*
 * The design app's records for the chats screen: the workspace store's orders, chargebacks and tickets, and the seed's
 * customers and products with this session's edits, as they were before the seam (`source.tsx`). The console resolves
 * each reference through the record's own slice instead.
 */

export type Pools = {
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
      return o ? orderRecord(o, ref) : null
    }
    case "customer": {
      const c = p.customers.find((x) => x.id === ref.id)
      return c ? customerRecord(c, "USD", ref) : null
    }
    case "product": {
      const pr = p.products.find((x) => x.id === ref.id)
      return pr ? productRecord(pr, ref) : null
    }
    case "chargeback": {
      const c = p.chargebacks.find((x) => x.id === ref.id)
      return c ? chargebackRecord(c, ref) : null
    }
    case "ticket": {
      const t = p.tickets.find((x) => x.id === ref.id)
      return t ? ticketRecord(t, ref) : null
    }
  }
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

/** A handle in a message's text, as the seed knows it: an order number or a chargeback's case. */
export function seedRefOf(code: string): ChatRecordRef | undefined {
  if (/^SO-\d{5}$/.test(code)) {
    const o = seedOrders.find((x) => x.number === code)
    return o ? { kind: "order", id: o.id } : undefined
  }
  if (/^DSP-\d{4}$/.test(code)) {
    const c = seedChargebacks.find((x) => x.case_number === code)
    return c ? { kind: "chargeback", id: c.id } : undefined
  }
  return undefined
}
