import type { Glyph } from "../fixtures/agents.ts"
import { casesOf, CHANNEL_LABEL } from "../fixtures/chargebacks.ts"
import { TICKETS } from "../fixtures/inbox.ts"
import { customer, CUSTOMERS, euro, ORDER_STATUS, ORDERS, product, PRODUCTS, SUPPLIERS } from "../fixtures/records.ts"
import { REASON_LABEL, returnsOf } from "../fixtures/returns.ts"
import { paths } from "../router.tsx"
import { getInbox, ticketsOf } from "../screens/inbox/store.ts"
import { BarChart3, CreditCard, Factory, FileText, Package, Returns, ShoppingBag, Ticket, User } from "../ui/icons.tsx"

/**
 * What Magnus can be pointed at: every record in the workspace a message can name with `@`, and the
 * `/` commands. One catalogue for the composer's list, the chips in a message and the answers, so a
 * record is spelled and linked the same way wherever it turns up.
 */

export type RefKind = "order" | "customer" | "product" | "supplier" | "ticket" | "chargeback" | "return"

/** A record named in a message: what it is, how it reads, where it opens. */
export type Ref = {
  readonly kind: RefKind
  readonly id: string
  readonly label: string
  readonly hint: string
  readonly href: string
}

export const KIND_GLYPH: Readonly<Record<RefKind | "board" | "page", Glyph>> = {
  order: ShoppingBag,
  customer: User,
  product: Package,
  supplier: Factory,
  ticket: Ticket,
  chargeback: CreditCard,
  return: Returns,
  board: BarChart3,
  page: FileText
}

export const KIND_LABEL: Readonly<Record<RefKind, string>> = {
  order: "Bestelling",
  customer: "Klant",
  product: "Product",
  supplier: "Leverancier",
  ticket: "Ticket",
  chargeback: "Chargeback",
  return: "Retour"
}

/** The `/` commands: a short name, what it is for, and the question it asks. */
export const COMMANDS: ReadonlyArray<{ readonly name: string; readonly hint: string; readonly prompt: string }> = [
  { name: "samenvatten", hint: "Wat vandaag op jou wacht", prompt: "Vat de open zaken van vandaag samen" },
  {
    name: "vertragingen",
    hint: "Bestellingen die te laat dreigen te komen",
    prompt: "Welke bestellingen dreigen te laat te komen?"
  },
  {
    name: "opstellen",
    hint: "Een antwoord aan een klant, als concept",
    prompt: "Stel een antwoord op aan Luca Romano over zijn vertraagde levering"
  },
  { name: "chargebacks", hint: "Zaken die op bewijs wachten", prompt: "Welke chargebacks hebben bewijs nodig?" },
  { name: "retouren", hint: "Wat er terugkomt en waarom", prompt: "Waarom stegen de terugbetalingen afgelopen week?" },
  { name: "omzet", hint: "De week tegen de week ervoor", prompt: "Hoe ging de omzet afgelopen week?" },
  { name: "advertenties", hint: "Wat de advertenties opleveren", prompt: "Wat leveren de advertenties op?" },
  {
    name: "automatiseren",
    hint: "Een automatisering als concept",
    prompt: "Maak een automatisering voor late leveringen"
  }
]

export type Command = (typeof COMMANDS)[number]

const norm = (s: string) => s.toLocaleLowerCase("nl-NL").normalize("NFD").replace(/\p{Diacritic}/gu, "")

const nameOf = (customerId: string) => customer(customerId)?.name ?? "Onbekende klant"

/* ── the refs, per kind ────────────────────────────────────────────────────────────────────────── */

export const orderRef = (number: string): Ref => {
  const o = ORDERS.find((x) => x.number === number)
  return {
    kind: "order",
    id: number,
    label: `#${number}`,
    hint: o === undefined ? "Bestelling" : `${nameOf(o.customerId)} · ${ORDER_STATUS[o.status].label}`,
    href: paths.order(number)
  }
}

export const customerRef = (id: string): Ref => {
  const c = customer(id)
  return {
    kind: "customer",
    id,
    label: c?.name ?? id,
    hint: c === undefined ? "Klant" : `${c.city} · ${c.ordersCount} bestellingen`,
    href: paths.customer(id)
  }
}

export const productRef = (id: string): Ref => {
  const p = product(id)
  return {
    kind: "product",
    id,
    label: p?.name ?? id,
    hint: p === undefined
      ? "Product"
      : `${euro(p.price)} · ${p.stock === 0 ? "uitverkocht" : `${p.stock} op voorraad`}`,
    href: paths.product(id)
  }
}

export const supplierRef = (id: string): Ref => {
  const s = SUPPLIERS.find((x) => x.id === id)
  return {
    kind: "supplier",
    id,
    label: s?.name ?? id,
    hint: s === undefined || s.leadDays === 0
      ? "Leverancier"
      : `Levertijd ${s.leadDays.toLocaleString("nl-NL")} d, belofte ${s.promiseDays}`,
    href: paths.supplier(id)
  }
}

export const ticketRef = (number: string): Ref => {
  const t = ticketsOf(getInbox(), false).find((x) => x.number === number)
  return {
    kind: "ticket",
    id: number,
    label: `Ticket #${number}`,
    hint: t?.subject ?? "Ticket",
    href: paths.ticket(number)
  }
}

export const caseRef = (id: string): Ref => {
  const c = casesOf().find((x) => x.id === id)
  return {
    kind: "chargeback",
    id,
    label: id,
    hint: c === undefined ? "Chargeback" : `${nameOf(c.customerId)} · ${CHANNEL_LABEL[c.channel]}`,
    href: paths.chargeback(id)
  }
}

export const returnRef = (id: string): Ref => {
  const r = returnsOf().find((x) => x.id === id)
  return {
    kind: "return",
    id,
    label: r?.number ?? id.toUpperCase(),
    hint: r === undefined ? "Retour" : `${product(r.productId)?.name ?? "Product"} · ${REASON_LABEL[r.reason]}`,
    href: paths.return(id)
  }
}

/** The customers the story names come first in the fixture; the rest are the thousand who buy now and then. */
const STORY_CUSTOMERS = CUSTOMERS.filter((c) => c.duplicateOf === undefined).slice(0, 32)

let fixed: ReadonlyArray<Ref> | undefined
/** Orders, customers, products and suppliers do not change during a visit; built once, on first use. */
function fixedRefs(): ReadonlyArray<Ref> {
  fixed ??= [
    ...PRODUCTS.map((p) => productRef(p.id)),
    ...SUPPLIERS.map((s) => supplierRef(s.id)),
    ...CUSTOMERS.filter((c) => c.duplicateOf === undefined).map((c) => customerRef(c.id)),
    ...ORDERS.map((o) => orderRef(o.number))
  ]
  return fixed
}

/** Tickets, cases and returns change as the person works: read fresh each time. */
const liveRefs = (): ReadonlyArray<Ref> => [
  ...ticketsOf(getInbox(), false).map((t) => ticketRef(t.number)),
  ...casesOf().map((c) => caseRef(c.id)),
  ...returnsOf().map((r) => returnRef(r.id))
]

/** What the list offers before anything is typed after `@`: the records today is about. */
const FEATURED = (): ReadonlyArray<Ref> => [
  orderRef("5309"),
  caseRef("CB-2291"),
  productRef("aurora-hooded-fleece"),
  supplierRef("kestrel-goods"),
  customerRef("felix-muller"),
  ticketRef("5141"),
  productRef("field-pant-stone"),
  returnRef("r-881")
]

/** The records whose label or hint holds `query`, the ones that start with it first. */
export function searchRefs(query: string, limit = 8): ReadonlyArray<Ref> {
  const q = norm(query.trim().replace(/^#/, ""))
  if (q === "") return FEATURED()
  const all = [...liveRefs(), ...fixedRefs()]
  const starts: Array<Ref> = []
  const holds: Array<Ref> = []
  for (const ref of all) {
    const label = norm(ref.label.replace(/^(ticket )?#/i, ""))
    if (label.startsWith(q)) starts.push(ref)
    else if (label.includes(q) || norm(ref.hint).includes(q)) holds.push(ref)
    if (starts.length >= limit) break
  }
  return [...starts, ...holds].slice(0, limit)
}

/** The record a context chip names (the werkdraad attaches records by their label), if there is one. */
export function refByLabel(label: string): Ref | undefined {
  const l = norm(label)
  return [...FEATURED(), ...liveRefs(), ...fixedRefs()].find((ref) =>
    norm(ref.label) === l || norm(`${KIND_LABEL[ref.kind]} ${ref.label}`) === l
  )
}

/* ── records named without @ ───────────────────────────────────────────────────────────────────── */

/** First names the story uses on their own ("stel een antwoord op aan Felix"). */
const FIRST_NAMES = new Set(["luca", "felix", "hannah", "maria", "astrid", "soren", "daniel", "chris", "yuki"])

/**
 * The records a sentence names in plain words: an order or ticket number, a case, a return, a
 * product, a supplier or a customer the story knows. `@` is the precise way; this is the forgiving one.
 */
export function refsIn(text: string): ReadonlyArray<Ref> {
  const q = norm(text)
  const out: Array<Ref> = []
  const add = (ref: Ref) => {
    if (!out.some((r) => r.kind === ref.kind && r.id === ref.id)) out.push(ref)
  }
  for (const m of q.matchAll(/cb-?(\d{4})/g)) {
    const id = `CB-${m[1] ?? ""}`
    if (casesOf().some((c) => c.id === id)) add(caseRef(id))
  }
  for (const m of q.matchAll(/\br-?(\d{3})\b/g)) {
    const id = `r-${m[1] ?? ""}`
    if (returnsOf().some((r) => r.id === id)) add(returnRef(id))
  }
  for (const m of q.matchAll(/(?:^|[^\d-])#?(\d{4})\b/g)) {
    const n = m[1] ?? ""
    if (ticketsOf(getInbox(), false).some((t) => t.number === n) && /ticket/.test(q)) add(ticketRef(n))
    else if (ORDERS.some((o) => o.number === n)) add(orderRef(n))
    else if (TICKETS.some((t) => t.number === n)) add(ticketRef(n))
  }
  const words = new Set(q.split(/[^\p{L}\d]+/u))
  for (const p of PRODUCTS) {
    const name = norm(p.name.replace(" · ", " "))
    const first = name.split(" ")[0] ?? ""
    const unique = PRODUCTS.filter((x) => norm(x.name).startsWith(`${first} `)).length === 1
    if (q.includes(name) || (unique && first.length >= 4 && words.has(first))) add(productRef(p.id))
  }
  for (const s of SUPPLIERS) {
    const name = norm(s.name)
    if (q.includes(name) || words.has(name.split(" ")[0] ?? "")) add(supplierRef(s.id))
  }
  for (const c of STORY_CUSTOMERS) {
    const name = norm(c.name)
    const first = name.split(" ")[0] ?? ""
    if (q.includes(name) || (FIRST_NAMES.has(first) && words.has(first))) add(customerRef(c.id))
  }
  return out
}
