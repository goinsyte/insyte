import { paths } from "../router.tsx"
import type { Staat } from "../view.ts"
import { CHATS } from "./assistant.ts"
import { casesOf, CHANNEL_LABEL } from "./chargebacks.ts"
import { CONVERSATIONS, STORE_CHATS, TICKET_STATUS, TICKETS } from "./inbox.ts"
import { customer, CUSTOMERS, euro, ORDER_STATUS, ORDERS, product, PRODUCTS, supplier, SUPPLIERS } from "./records.ts"
import { returnsOf, STATUS as RETURN_STATUS } from "./returns.ts"

/**
 * Everything ⌘K can find, as one list over the workspace's records: orders, returns, customers,
 * tickets, chats (the team's channels and their messages, the store chats, Magnus's conversations),
 * chargebacks, products and suppliers. Each hit says what it is, a clause to tell it apart, the words
 * it is found by and where it opens. Read when the palette opens, so a return started or a case
 * changed a moment ago is found too. On the first day after setup there is nothing to find yet.
 */

export type HitKind =
  | "order"
  | "return"
  | "customer"
  | "ticket"
  | "chat"
  | "chargeback"
  | "product"
  | "supplier"

type Hit = {
  readonly id: string
  readonly kind: HitKind
  readonly label: string
  readonly meta: string
  readonly keywords: string
  readonly href: string
}

/** The groups, in the order the palette lists them. */
export const HIT_GROUP: Readonly<Record<HitKind, string>> = {
  order: "Bestellingen",
  return: "Retouren",
  customer: "Klanten",
  ticket: "Tickets",
  chat: "Chats",
  chargeback: "Chargebacks",
  product: "Producten",
  supplier: "Leveranciers"
}

const nameOf = (customerId: string) => customer(customerId)?.name ?? ""
const excerpt = (text: string) => {
  const plain = text.replaceAll("**", "").replace(/\s+/g, " ").trim()
  return plain.length > 72 ? `${plain.slice(0, 71)}…` : plain
}

/** What never changes in a visit: built once. */
let fixed: ReadonlyArray<Hit> | null = null

function build(): ReadonlyArray<Hit> {
  const orders = ORDERS.map((o): Hit => ({
    id: `order-${o.number}`,
    kind: "order",
    label: `#${o.number}`,
    meta: `${nameOf(o.customerId)} · ${euro(o.total)} · ${ORDER_STATUS[o.status].label}`,
    keywords: `${o.number} ${nameOf(o.customerId)} ${o.carrier} ${o.payment} ${o.tags.join(" ")}`,
    href: paths.order(o.number)
  }))
  const customers = CUSTOMERS.map((c): Hit => ({
    id: `customer-${c.id}`,
    kind: "customer",
    label: c.name,
    meta: `${c.email} · ${c.city}`,
    keywords: `${c.email} ${c.city} ${c.tags.join(" ")}`,
    href: paths.customer(c.id)
  }))
  const tickets = TICKETS.map((t): Hit => ({
    id: `ticket-${t.number}`,
    kind: "ticket",
    label: `#${t.number} ${t.subject}`,
    meta: `${nameOf(t.customerId)} · ${TICKET_STATUS[t.status].label}`,
    keywords: `${t.number} ${nameOf(t.customerId)} ${t.handle} ${t.labels.join(" ")} ${t.order ?? ""}`,
    href: paths.ticket(t.number)
  }))
  const channels = CONVERSATIONS.flatMap((c): ReadonlyArray<Hit> => {
    const where = c.kind === "kanaal" ? `#${c.name}` : c.name
    const href = `${paths.teamChat}?kanaal=${c.id}`
    return [
      { id: `chat-${c.id}`, kind: "chat", label: where, meta: c.topic, keywords: "teamchat kanaal", href },
      ...c.messages.map((m): Hit => ({
        id: `chat-${c.id}-${m.id}`,
        kind: "chat",
        label: where,
        meta: excerpt(m.text),
        keywords: m.text,
        href
      }))
    ]
  })
  const storeChats = STORE_CHATS.map((c): Hit => ({
    id: `store-${c.id}`,
    kind: "chat",
    label: `Winkelchat · ${c.visitor}`,
    meta: c.about,
    keywords: `${c.place} ${c.page} ${c.lines.map((l) => l.text).join(" ")}`,
    href: `${paths.storeChat}?chat=${c.id}`
  }))
  const magnus = CHATS.map((c): Hit => ({
    id: `magnus-${c.id}`,
    kind: "chat",
    label: c.title,
    meta: `Gesprek met Magnus · ${c.started}`,
    keywords: c.turns.map((t) => (t.from === "me" ? t.text : t.paragraphs.join(" "))).join(" "),
    href: paths.chat(c.id)
  }))
  const products = PRODUCTS.map((p): Hit => ({
    id: `product-${p.id}`,
    kind: "product",
    label: p.name,
    meta: `${euro(p.price)} · ${supplier(p.supplierId)?.name ?? ""}`,
    keywords: `${p.sku} ${p.tags.join(" ")}`,
    href: paths.product(p.id)
  }))
  const suppliers = SUPPLIERS.map((s): Hit => ({
    id: `supplier-${s.id}`,
    kind: "supplier",
    label: s.name,
    meta: `${s.country} · levert in ${String(s.leadDays).replace(".", ",")} dagen`,
    keywords: `${s.email} ${s.country}`,
    href: paths.supplier(s.id)
  }))
  return [...orders, ...customers, ...tickets, ...channels, ...storeChats, ...magnus, ...products, ...suppliers]
}

/** Every record the palette can find, for the view's state. */
export function searchRecords(staat: Staat): ReadonlyArray<Hit> {
  if (staat === "leeg") return []
  fixed ??= build()
  const returns = returnsOf().map((r): Hit => ({
    id: `return-${r.id}`,
    kind: "return",
    label: r.number,
    meta: `${nameOf(r.customerId)} · #${r.orderNumber} · ${RETURN_STATUS[r.status].label}`,
    keywords: `${r.orderNumber} ${nameOf(r.customerId)} ${product(r.productId)?.name ?? ""} ${r.note}`,
    href: paths.return(r.id)
  }))
  const cases = casesOf().map((c): Hit => ({
    id: `chargeback-${c.id}`,
    kind: "chargeback",
    label: `#${c.id}`,
    meta: `${nameOf(c.customerId)} · ${CHANNEL_LABEL[c.channel]} · ${euro(c.amount)}`,
    keywords: `${c.orderNumber} ${nameOf(c.customerId)} ${c.reason}`,
    href: paths.chargeback(c.id)
  }))
  return [...fixed, ...returns, ...cases]
}
