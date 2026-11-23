import { useSyncExternalStore } from "react"
import type { Tone } from "../ui/badge.tsx"
import { ticket as inboxTicket } from "./inbox.ts"
import { customer, ORDER_STATUS, ORDERS, product, supplier, VAT } from "./records.ts"
import type { Carrier, Order, OrderLine, OrderStatus, Payment } from "./records.ts"
import { DEMO_NOW, PEOPLE, STORES } from "./workspace.ts"

/**
 * Bestellingen's own detail on top of the shared orders (`records.ts`): where each order's lines stand
 * with their supplier (the forwarding legs, after `/app`'s `lib/forwarding.ts`), the address and the
 * track & trace number, the order's history, the team's notes and labels, and what the team changed
 * during this visit (a status, a refund, a concept order). The shared orders never change; this file
 * lays the visit's changes over them, so the list, the record and the menu's counts read one source.
 */

/* ── small helpers ─────────────────────────────────────────────────────────────────────────────── */

const DAY = 86_400_000
const HOUR = 3_600_000
const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"]
const NOW = DEMO_NOW.date.getTime()
const MIDNIGHT = new Date(2026, 10, 23).getTime()

const two = (n: number) => String(n).padStart(2, "0")
const clock = (d: Date) => `${two(d.getHours())}:${two(d.getMinutes())}`

/** "14:12" today, "gisteren 18:40", "morgen 12:00", "19 nov 09:05" further off. */
export function stamp(d: Date): string {
  const day = Math.floor((MIDNIGHT - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / DAY)
  if (day === 0) return clock(d)
  if (day === -1) return `morgen ${clock(d)}`
  if (day === 1) return `gisteren ${clock(d)}`
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${clock(d)}`
}

/** "19 nov", or "vandaag" and "morgen" around the demo's Monday. */
export function dayName(d: Date): string {
  const day = Math.floor((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - MIDNIGHT) / DAY)
  if (day === 0) return "vandaag"
  if (day === 1) return "morgen"
  if (day === -1) return "gisteren"
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** "23 nov 2026, 14:12": the record's own head. */
export const longDate = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${clock(d)}`

/** "€ 129,00": a record's money, always with cents. */
export const money = (n: number) =>
  `€ ${n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** "1 bestelling", "3 bestellingen". */
export const counted = (n: number, one: string, many: string) => `${n.toLocaleString("nl-NL")} ${n === 1 ? one : many}`

export const storeName = (id: string) => STORES.find((s) => s.id === id)?.name ?? id
export const linesTotal = (lines: ReadonlyArray<OrderLine>) => lines.reduce((s, l) => s + l.price * l.quantity, 0)
export const units = (o: Order) => o.lines.reduce((s, l) => s + l.quantity, 0)
/** The btw inside a total: Analyse counts revenue as the total over `VAT`. */
export const btwOf = (total: number) => Math.round((total - total / VAT) * 100) / 100

/** The suppliers an order's lines go to, in the order they appear. */
export const suppliersOf = (o: Order): ReadonlyArray<string> => [
  ...new Set(o.lines.map((l) => product(l.productId)?.supplierId ?? "").filter((s) => s !== ""))
]

/** The day the customer was promised: the order's own, or the slowest supplier's promise. */
export function promisedOf(o: Order): Date {
  if (o.promisedAt !== undefined) return o.promisedAt
  const days = Math.max(...suppliersOf(o).map((s) => supplier(s)?.promiseDays ?? 5), 5)
  return new Date(o.placedAt.getTime() + days * DAY)
}

/* ── addresses and track & trace ───────────────────────────────────────────────────────────────── */

export type Address = {
  readonly street: string
  readonly postcode: string
  readonly city: string
  readonly country: string
}

const STREETS: Readonly<Record<string, ReadonlyArray<string>>> = {
  NL: ["Oudegracht", "Kerkstraat", "Prinsengracht", "Molenweg", "Stationsplein", "Lindelaan"],
  BE: ["Kouter", "Meir", "Veldstraat", "Grote Markt", "Brusselsesteenweg"],
  DE: ["Hauptstraße", "Schillerstraße", "Gartenweg", "Königsallee"],
  FR: ["Rue Nationale", "Rue de Béthune", "Boulevard Vauban"],
  NO: ["Karl Johans gate", "Bogstadveien", "Thereses gate"],
  SE: ["Kungsgatan", "Avenyn", "Linnégatan"],
  GB: ["High Street", "Baker Street", "Camden Road"],
  IE: ["Grafton Street", "Camden Street"],
  ES: ["Calle Mayor", "Gran Vía"],
  IT: ["Via Roma", "Corso Garibaldi"],
  PL: ["Nowy Świat", "Marszałkowska"],
  PT: ["Rua Augusta", "Rua de Santa Catarina"]
}

const COUNTRY: Readonly<Record<string, string>> = {
  NL: "Nederland",
  BE: "België",
  DE: "Duitsland",
  FR: "Frankrijk",
  NO: "Noorwegen",
  SE: "Zweden",
  GB: "Verenigd Koninkrijk",
  IE: "Ierland",
  ES: "Spanje",
  IT: "Italië",
  PL: "Polen",
  PT: "Portugal"
}

export const countryName = (code: string) => COUNTRY[code] ?? code

function postcode(country: string, n: number): string {
  if (country === "NL") {
    return `${1000 + (n * 37) % 8900} ${String.fromCharCode(65 + (n % 26))}${String.fromCharCode(65 + ((n * 7) % 26))}`
  }
  if (country === "BE") return String(1000 + (n * 13) % 8900)
  if (country === "GB" || country === "IE") return `D0${n % 9} X${(n * 3) % 90 + 10}`
  return String(10_000 + (n * 113) % 89_000)
}

/** The address the parcel goes to: the customer's city, a street of the country, unless the team changed it. */
export function baseAddress(o: Order): Address {
  const c = customer(o.customerId)
  const country = c?.country ?? "NL"
  const n = Number(o.number)
  const streets = STREETS[country] ?? ["Hoofdstraat"]
  // #5263's parcel is the one DPD lost; its address is fine. The order with the missing house number is below.
  const street = o.number === ADDRESS_ERROR
    ? streets[n % streets.length] ?? "Hoofdstraat"
    : `${streets[n % streets.length]} ${(n % 140) + 1}`
  return { street, postcode: postcode(country, n), city: c?.city ?? "Utrecht", country }
}

/** A track & trace number in the carrier's own shape, the same for an order every time. */
export function trackingOf(o: Order): string {
  const n = Number(o.number)
  const digits = (len: number) => String(n * 7919 + 104_729).padStart(len, "0").slice(-len)
  switch (o.carrier) {
    case "PostNL":
      return `3SNWD${digits(10)}`
    case "DHL":
      return `JJD0003900${digits(8)}`
    case "DPD":
      return `0522${digits(10)}`
    case "UPS":
      return `1Z999AA1${digits(8)}`
  }
}

/** Whether a parcel exists yet: it does once the supplier shipped it. */
export const shipped = (status: OrderStatus) =>
  status === "verzonden" || status === "bezorgd" || status === "vertraagd" || status === "retour" ||
  status === "terugbetaald"

/* ── what the story ties to an order (owned elsewhere, kept here until the lead wires it) ───────── */

/** The tickets that are about an order, with Inbox's subject (`paths.ticket`). */
export const ORDER_TICKETS: Readonly<
  Record<string, { readonly id: string; readonly subject: string; readonly meta: string }>
> = Object.fromEntries(
  ([
    ["5309", "5146", "Luca Romano · 4 dagen te laat"],
    ["5263", "5141", "Hannah Schmidt · toegewezen aan Elena"],
    ["5296", "5148", "Astrid Berg · omruiling voorgesteld"]
  ] as const).map(([order, id, meta]) => [order, { id, subject: inboxTicket(id)?.subject ?? "", meta }])
)

/** What the story says about a late order, in one sentence, and the ticket or proposal behind it. */
export const LATE_STORY: Readonly<Record<string, { readonly title: string; readonly body: string }>> = {
  "5309": {
    title: "Vier dagen later dan beloofd",
    body:
      "PostNL beloofde donderdag 19 nov en bezorgt hem morgen. Luca vroeg erom in ticket #5146; het voorstel voor een excuus met SORRY10 wacht hieronder op jou."
  },
  "5263": {
    title: "Pakket kwijt bij DPD",
    body:
      "DPD meldt het pakket als zoek sinds 18 nov. Hannah Schmidt mailde in ticket #5141. DPD sluit claims vandaag om 17:00."
  }
}

/* ── forwarding: one leg per order × supplier (`/app`'s `lib/forwarding.ts`) ────────────────────── */

export type LegState = "te-versturen" | "wordt-verstuurd" | "wacht" | "bevestigd" | "fout"
export type Via = "portaal" | "e-mail" | "api"
export type LegReason = "uitverkocht" | "adres" | "geweigerd"

export const VIA_LABEL: Readonly<Record<Via, string>> = {
  portaal: "Leveranciersportaal",
  "e-mail": "E-mail",
  api: "API"
}
export const REASON_LABEL: Readonly<Record<LegReason, string>> = {
  uitverkocht: "Leverancier meldt uitverkocht",
  adres: "Adres onvolledig",
  geweigerd: "Leverancier weigert de bestelling"
}

/** How each supplier takes its orders, and whether a paid order goes to it at once (`auto`). */
export const SUPPLIER_VIA: Readonly<Record<string, { readonly via: Via; readonly auto: boolean }>> = {
  "allure-fulfillment": { via: "api", auto: true },
  "dpc-apparel": { via: "portaal", auto: false },
  "kestrel-goods": { via: "e-mail", auto: false },
  "black-cedar-studio": { via: "api", auto: true },
  "noord-atelier": { via: "portaal", auto: false }
}

export type Leg = {
  readonly key: string
  readonly orderNumber: string
  readonly supplierId: string
  readonly state: LegState
  /** When it entered this state, as a time in ms. */
  readonly since: number
  readonly via?: Via
  readonly by?: string
  readonly reason?: LegReason
  readonly note?: string
  /** While a send waits out the undo window, until when (real ms, the window is real time). */
  readonly sendingUntil?: number
  /** The supplier it was taken from when it went elsewhere. */
  readonly from?: string
}

export const legKey = (orderNumber: string, supplierId: string) => `${orderNumber}|${supplierId}`

/** The two legs that went wrong today: DPC is out of a size, an Allure address lacks a house number. */
let STOCK_ERROR = ""
let ADDRESS_ERROR = ""
/** The order sent by hand yesterday morning that its supplier never confirmed: more than 24 hours. */
let OVERDUE = ""

const supplierName = (id: string) => supplier(id)?.name ?? id

function baseLegs(): ReadonlyArray<Leg> {
  const since = MIDNIGHT - DAY
  const open = ORDERS.filter(
    (o) => (o.status === "betaald" || o.status === "bij-leverancier") && o.placedAt.getTime() >= since
  ).toReversed()
  const out: Array<Leg> = []
  for (const o of open) {
    const placed = o.placedAt.getTime()
    for (const s of suppliersOf(o)) {
      const key = legKey(o.number, s)
      const pref = SUPPLIER_VIA[s] ?? { via: "portaal" as const, auto: false }
      const by = pref.auto ? "Insyte" : PEOPLE.ethan.name
      if (o.status === "bij-leverancier") {
        const yesterday = placed < MIDNIGHT
        if (OVERDUE === "" && yesterday && !pref.auto && placed < NOW - 26 * HOUR) {
          OVERDUE = key
          out.push({
            key,
            orderNumber: o.number,
            supplierId: s,
            state: "wacht",
            since: placed + HOUR,
            via: pref.via,
            by
          })
          continue
        }
        out.push({
          key,
          orderNumber: o.number,
          supplierId: s,
          state: "bevestigd",
          since: placed + 3 * HOUR,
          via: pref.via,
          by: supplierName(s)
        })
        continue
      }
      // Paid today and not yet with its supplier.
      if (STOCK_ERROR === "" && s === "dpc-apparel" && placed < NOW - 3 * HOUR) {
        STOCK_ERROR = key
        const line = o.lines.find((l) => product(l.productId)?.supplierId === s)
        const name = product(line?.productId ?? "")?.name ?? "Artikel"
        out.push({
          key,
          orderNumber: o.number,
          supplierId: s,
          state: "fout",
          since: placed + 2 * HOUR,
          via: pref.via,
          reason: "uitverkocht",
          by: supplierName(s),
          note: `${name}${
            line === undefined || line.size === "Eén maat" ? "" : `, maat ${line.size}`
          }: uitverkocht tot 30 november`
        })
        continue
      }
      if (ADDRESS_ERROR === "" && s === "allure-fulfillment" && placed < NOW - 4 * HOUR) {
        ADDRESS_ERROR = o.number
        out.push({
          key,
          orderNumber: o.number,
          supplierId: s,
          state: "fout",
          since: placed + 0.5 * HOUR,
          via: pref.via,
          reason: "adres",
          by: supplierName(s),
          note: "Huisnummer ontbreekt in het verzendadres"
        })
        continue
      }
      // Over the API at once; by hand (Ethan) until an hour and a half ago. The supplier confirms within
      // a few hours; what is younger still waits for it.
      const sent = pref.auto || placed < NOW - 1.5 * HOUR
      if (sent) {
        const confirmed = placed < NOW - (pref.auto ? 2 : 5) * HOUR
        out.push({
          key,
          orderNumber: o.number,
          supplierId: s,
          state: confirmed ? "bevestigd" : "wacht",
          since: confirmed ? placed + 2 * HOUR : placed + (pref.auto ? 0.05 : 1) * HOUR,
          via: pref.via,
          by: confirmed ? supplierName(s) : by
        })
        continue
      }
      out.push({ key, orderNumber: o.number, supplierId: s, state: "te-versturen", since: placed })
    }
  }
  return out
}

const BASE_LEGS = baseLegs()

/** A leg in a state that a person may still act on: to forward, waiting, or in error. */
export const legOpen = (state: LegState) => state !== "bevestigd"

/** A supplier that has not confirmed within 24 hours is late. */
export const legLate = (leg: Leg) => (leg.state === "wacht" || leg.state === "wordt-verstuurd") && NOW - leg.since > DAY

/** "3 u", "1 d 7 u", "zojuist", against the demo's clock. */
export function waited(since: number): string {
  const h = Math.max(0, Math.floor((NOW - since) / HOUR))
  if (h === 0) return "zojuist"
  if (h < 24) return `${h} u`
  const d = Math.floor(h / 24)
  const r = h % 24
  return r === 0 ? `${d} d` : `${d} d ${r} u`
}

/* ── the visit's changes ───────────────────────────────────────────────────────────────────────── */

export type DeskNote = { readonly id: string; readonly at: number; readonly by: string; readonly text: string }
export type DeskEvent = { readonly id: string; readonly at: number; readonly title: string; readonly tone?: Tone }

type Desk = {
  readonly status: Readonly<Record<string, OrderStatus>>
  readonly tags: Readonly<Record<string, ReadonlyArray<string>>>
  readonly notes: Readonly<Record<string, ReadonlyArray<DeskNote>>>
  readonly events: Readonly<Record<string, ReadonlyArray<DeskEvent>>>
  readonly legs: Readonly<Record<string, Partial<Leg>>>
  readonly address: Readonly<Record<string, Address>>
  readonly refunded: Readonly<Record<string, number>>
  /** Concept orders made in this visit, newest first. */
  readonly created: ReadonlyArray<Order>
}

let desk: Desk = { status: {}, tags: {}, notes: {}, events: {}, legs: {}, address: {}, refunded: {}, created: [] }
const listeners = new Set<() => void>()
const emit = () => {
  for (const l of listeners) l()
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const getDesk = () => desk
export const useDesk = () => useSyncExternalStore(subscribe, getDesk)

/** Change the desk; returns what it was, for the toast's undo. */
export function changeDesk(next: (d: Desk) => Desk): Desk {
  const before = desk
  desk = next(desk)
  emit()
  return before
}

/** Put the desk back as it was before a change ("Ongedaan maken"). */
export function restoreDesk(to: Desk) {
  desk = to
  emit()
}

/** "Nu", as the visit writes it into an order's history: the demo's clock, a second later per change. */
let tick = 0
export const nowMs = () => NOW + ++tick * 1000

const eventId = () => `e${++tick}`

export function addEvent(d: Desk, number: string, title: string, tone?: Tone): Desk {
  const event: DeskEvent = { id: eventId(), at: nowMs(), title, ...(tone === undefined ? {} : { tone }) }
  return { ...d, events: { ...d.events, [number]: [event, ...(d.events[number] ?? [])] } }
}

export function setStatus(
  d: Desk,
  numbers: ReadonlyArray<string>,
  status: OrderStatus,
  title?: (n: string) => string
): Desk {
  let next: Desk = { ...d, status: { ...d.status, ...Object.fromEntries(numbers.map((n) => [n, status])) } }
  if (title !== undefined) { for (const n of numbers) next = addEvent(next, n, title(n)) }
  return next
}

/* ── orders as the visit sees them ─────────────────────────────────────────────────────────────── */

/** The concept orders get numbers after the last real one. */
const NEXT_NUMBER = Math.max(...ORDERS.map((o) => Number(o.number))) + 1
export const CONCEPT = "concept"

export function createConcept(input: {
  readonly customerId: string
  readonly storeId: Order["storeId"]
  readonly payment: Payment
  readonly lines: ReadonlyArray<OrderLine>
  readonly note: string
}): Order {
  const number = String(NEXT_NUMBER + desk.created.length)
  const total = linesTotal(input.lines)
  const order: Order = {
    number,
    customerId: input.customerId,
    lines: input.lines,
    total,
    shipping: 0,
    discount: 0,
    placedAt: DEMO_NOW.date,
    status: "betaald",
    carrier: "PostNL",
    payment: input.payment,
    storeId: input.storeId,
    tags: [CONCEPT],
    ...(input.note.trim() === "" ? {} : { note: input.note.trim() })
  }
  changeDesk((d) =>
    addEvent({ ...d, created: [order, ...d.created] }, number, `Conceptbestelling aangemaakt door ${PEOPLE.elena.name}`)
  )
  return order
}

const cache = new WeakMap<Desk, ReadonlyArray<Order>>()

function apply(o: Order, d: Desk): Order {
  const status = d.status[o.number]
  const tags = d.tags[o.number]
  if (status === undefined && tags === undefined) return o
  return { ...o, ...(status === undefined ? {} : { status }), ...(tags === undefined ? {} : { tags }) }
}

/** Every order, newest first, with this visit's changes. */
export function deskOrders(d: Desk = desk): ReadonlyArray<Order> {
  const hit = cache.get(d)
  if (hit !== undefined) return hit
  const all = [...d.created, ...ORDERS].map((o) => apply(o, d))
  cache.set(d, all)
  return all
}

export const deskOrder = (number: string, d: Desk = desk) =>
  deskOrders(d).find((o) => o.number === number.replace(/^#/, ""))

export const isConcept = (o: Order) => o.tags.includes(CONCEPT)
export const isClosed = (o: Order) => o.status === "geannuleerd" || o.status === "terugbetaald"

/** The status as the list and the record write it: a concept says so. */
export function statusOf(o: Order): { readonly label: string; readonly tone: Tone } {
  if (isConcept(o) && o.status === "betaald") return { label: "Concept", tone: "neutral" }
  return ORDER_STATUS[o.status]
}

/** The labels a person put on an order (without the concept marker). */
export const ownTags = (o: Order) => o.tags.filter((t) => t !== CONCEPT)

/** Labels the team uses, for the label picker. */
export const KNOWN_TAGS: ReadonlyArray<string> = [
  "vip",
  "cadeau",
  "maat",
  "vertraagd",
  "pakket kwijt",
  "chargeback",
  "terugbellen"
]

/* ── legs as the visit sees them ───────────────────────────────────────────────────────────────── */

function effective(leg: Leg, at: number): Leg {
  if (leg.state === "wordt-verstuurd" && (leg.sendingUntil ?? 0) <= at) return { ...leg, state: "wacht" }
  return leg
}

/** Every leg with this visit's changes; `at` is the real clock, for a send's undo window. */
export function deskLegs(d: Desk = desk, at: number = Date.now()): ReadonlyArray<Leg> {
  const orders = new Map(deskOrders(d).map((o) => [o.number, o]))
  const created: ReadonlyArray<Leg> = d.created.flatMap((o) =>
    suppliersOf(o).map((s) => ({
      key: legKey(o.number, s),
      orderNumber: o.number,
      supplierId: s,
      state: "te-versturen" as const,
      since: o.placedAt.getTime()
    }))
  )
  return [...created, ...BASE_LEGS].flatMap((leg) => {
    const order = orders.get(leg.orderNumber)
    if (order === undefined || isClosed(order)) return []
    const patch = d.legs[leg.key]
    return [effective(patch === undefined ? leg : { ...leg, ...patch }, at)]
  })
}

export const orderLegs = (number: string, d: Desk = desk, at?: number) =>
  deskLegs(d, at).filter((l) => l.orderNumber === number)

/* ── the counts (menu, list head, Start): one function each ────────────────────────────────────── */

export const lateOrders = (d: Desk = desk) => deskOrders(d).filter((o) => o.status === "vertraagd")
export const todayOrders = (d: Desk = desk) =>
  deskOrders(d).filter((o) => o.placedAt.getTime() >= MIDNIGHT && !isConcept(o))
export const legsToForward = (d: Desk = desk) => deskLegs(d).filter((l) => l.state === "te-versturen")
export const legsAwaiting = (d: Desk = desk) =>
  deskLegs(d).filter((l) => l.state === "wacht" || l.state === "wordt-verstuurd")
export const legsInError = (d: Desk = desk) => deskLegs(d).filter((l) => l.state === "fout")
/** What Bij leverancier asks of a person: to forward, and what went wrong. */
export const forwardingWork = (d: Desk = desk) => legsToForward(d).length + legsInError(d).length

/* ── an order's history ────────────────────────────────────────────────────────────────────────── */

export type HistoryLine = {
  readonly id: string
  readonly at: number
  readonly title: string
  readonly body?: string
  readonly tone?: Tone
  readonly kind: "placed" | "paid" | "supplier" | "shipped" | "delivered" | "problem" | "money" | "note" | "change"
}

/** What happened to an order, newest first: from its status and legs, then the visit's own changes. */
export function historyOf(o: Order, d: Desk = desk): ReadonlyArray<HistoryLine> {
  const placed = o.placedAt.getTime()
  const out: Array<HistoryLine> = [
    { id: "placed", at: placed, title: `Bestelling geplaatst in ${storeName(o.storeId)}`, kind: "placed" },
    { id: "paid", at: placed + 60_000, title: `Betaling geïnd · ${o.payment}`, kind: "paid" }
  ]
  for (const leg of orderLegs(o.number, d)) {
    const name = supplierName(leg.supplierId)
    if (leg.state === "te-versturen") continue
    if (leg.via !== undefined) {
      out.push({
        id: `sent-${leg.supplierId}`,
        at: leg.state === "bevestigd" ? leg.since - 2 * HOUR : leg.since,
        title: `Doorgestuurd naar ${name}`,
        body: `${VIA_LABEL[leg.via]}${leg.by === undefined || leg.by === name ? "" : ` · door ${leg.by}`}`,
        kind: "supplier"
      })
    }
    if (leg.state === "bevestigd") {
      out.push({
        id: `ok-${leg.supplierId}`,
        at: leg.since,
        title: `${name} bevestigde de bestelling`,
        kind: "supplier"
      })
    }
    if (leg.state === "fout") {
      out.push({
        id: `err-${leg.supplierId}`,
        at: leg.since,
        title: `${name}: ${REASON_LABEL[leg.reason ?? "geweigerd"].toLowerCase()}`,
        ...(leg.note === undefined ? {} : { body: leg.note }),
        tone: "bad",
        kind: "problem"
      })
    }
  }
  const handed = placed + 26 * HOUR
  if (shipped(o.status) && suppliersOf(o).length > 0) {
    out.push({
      id: "handed",
      at: placed + 3 * HOUR,
      title: `${suppliersOf(o).map(supplierName).join(" en ")} bevestigde de bestelling`,
      kind: "supplier"
    })
    out.push({
      id: "shipped",
      at: handed,
      title: `Verzonden met ${o.carrier}`,
      body: `Track & trace ${trackingOf(o)}`,
      kind: "shipped"
    })
  }
  if (o.status === "vertraagd") {
    const promised = promisedOf(o)
    out.push({
      id: "late",
      at: Math.min(promised.getTime() + 18 * HOUR, NOW - HOUR),
      title: o.carrier === "DPD" && o.tags.includes("pakket kwijt")
        ? "DPD meldt het pakket als zoek"
        : `Niet bezorgd op de beloofde dag, ${dayName(promised)}`,
      tone: "warn",
      kind: "problem"
    })
  }
  if (o.status === "bezorgd" || o.status === "retour" || o.status === "terugbetaald") {
    out.push({ id: "delivered", at: placed + 60 * HOUR, title: `Bezorgd door ${o.carrier}`, kind: "delivered" })
  }
  if (o.status === "retour") {
    out.push({
      id: "return",
      at: Math.min(placed + 5 * DAY, NOW - 13 * HOUR),
      title: "Retour aangevraagd in het retourportaal",
      kind: "change"
    })
  }
  if (o.status === "terugbetaald" && d.refunded[o.number] === undefined) {
    out.push({
      id: "refund",
      at: placed + 4 * DAY,
      title: `Terugbetaald · ${money(o.total)}`,
      tone: "bad",
      kind: "money"
    })
  }
  const ticket = ORDER_TICKETS[o.number]
  if (ticket !== undefined) {
    out.push({
      id: "ticket",
      at: NOW - 3 * HOUR,
      title: `Klant mailde: ticket #${ticket.id}`,
      body: ticket.subject,
      kind: "change"
    })
  }
  for (const e of d.events[o.number] ?? []) {
    out.push({ id: e.id, at: e.at, title: e.title, ...(e.tone === undefined ? {} : { tone: e.tone }), kind: "change" })
  }
  for (const n of d.notes[o.number] ?? []) {
    out.push({ id: n.id, at: n.at, title: `Notitie van ${n.by}`, body: n.text, kind: "note" })
  }
  return out.filter((l) => l.at <= NOW + 3_600_000).toSorted((a, b) => b.at - a.at)
}

/* ── busy week: the names and labels that break a layout ───────────────────────────────────────── */

const LONG_NAMES = [
  "Maximiliane Alexandra von Hohenberg-Lichtenstein",
  "Jean-Baptiste Emmanuel Delacroix-Montgolfier",
  "Annemarie Wilhelmina van Oldenbarnevelt-Rijckevorsel",
  "Christopher Alexander Montgomery-Fitzgerald"
]

/** In the busy week every fourth customer has a name that does not fit and every fifth order three labels. */
export function busyName(o: Order, busy: boolean): string {
  const name = customer(o.customerId)?.name ?? "Gast"
  if (!busy) return name
  return Number(o.number) % 4 === 0 ? LONG_NAMES[Number(o.number) % LONG_NAMES.length] ?? name : name
}

export function busyTags(o: Order, busy: boolean): ReadonlyArray<string> {
  const own = ownTags(o)
  if (!busy || Number(o.number) % 5 !== 0) return own
  return [...own, "cadeauverpakking gevraagd", "terugbellen na 17:00", "vip"]
}

export const CARRIERS: ReadonlyArray<Carrier> = ["PostNL", "DHL", "DPD", "UPS"]
export const PAYMENTS: ReadonlyArray<Payment> = ["iDEAL", "Kaart", "Klarna", "PayPal", "Bancontact"]
