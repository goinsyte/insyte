import { customer, ORDERS, product, supplier, supplierOrders, supplierProducts } from "./records.ts"
import type { Customer, Order } from "./records.ts"
import { DEMO_NOW } from "./workspace.ts"

/**
 * The supplier portal's demo data: Allure Fulfillment (Marco Rossi) signed in to work Northwind's
 * orders. Copied from the current demo (`packages/ui/src/app/lib/supplier-*.ts`, `supplier/demo-source`,
 * `mock-data/quality.ts`, `courses.ts`, the #allure-fulfillment chat) and moved to this version's clock.
 *
 * The orders are the shared records (`supplierOrders("allure-fulfillment")`): a supplier sees only its
 * own lines, what Northwind pays for them (the product's cost, never the shelf price or the order's
 * total) and where the parcel goes (a name and an address, never the customer's email or phone). Its
 * status follows the order's: Betaald is still to accept, Bij leverancier is to ship. The handful of
 * changes the story needs (one problem reported, the parcels' tracking) are laid on here. Nothing
 * here is real.
 */

export const SUPPLIER_ID = "allure-fulfillment"
export const ME = supplier(SUPPLIER_ID) ?? {
  id: SUPPLIER_ID,
  name: "Allure Fulfillment",
  email: "ops@allurefulfillment.com",
  country: "Italië"
}
export const CONTACT = { name: "Marco Rossi", first: "Marco" } as const
export const BRAND = "Northwind"
export const BRAND_LEGAL = "Northwind Clothing Co."

const DAY = 86_400_000
const NOW = DEMO_NOW.date.getTime()
const TODAY = new Date(2026, 10, 23).getTime()

/* ── orders ───────────────────────────────────────────────────────────────────────────────────── */

export type SupStatus = "te-accepteren" | "te-verzenden" | "probleem" | "verzonden" | "afgesloten"

export const STATUS: Readonly<
  Record<SupStatus, { readonly label: string; readonly tone: "accent" | "neutral" | "warn" | "good" }>
> = {
  "te-accepteren": { label: "Te accepteren", tone: "accent" },
  "te-verzenden": { label: "Te verzenden", tone: "neutral" },
  probleem: { label: "Probleem gemeld", tone: "warn" },
  verzonden: { label: "Verzonden", tone: "good" },
  afgesloten: { label: "Afgesloten", tone: "neutral" }
}

export type ProblemKind = "voorraad" | "later" | "adres" | "beschadigd" | "anders"

export const PROBLEM_LABEL: Readonly<Record<ProblemKind, string>> = {
  voorraad: "Niet op voorraad",
  later: "Later klaar dan beloofd",
  adres: "Adres klopt niet",
  beschadigd: "Beschadigd bij inpakken",
  anders: "Iets anders"
}

export const CARRIERS = ["PostNL", "DHL", "DPD", "UPS", "GLS"] as const

export type Due = "late" | "today" | "soon" | "later"

export type SupLine = {
  readonly id: string
  readonly productId: string
  readonly title: string
  readonly size: string
  readonly sku: string
  readonly quantity: number
  /** What Northwind pays for one. */
  readonly cost: number
}

export type ShipTo = {
  readonly name: string
  readonly line1: string
  readonly postcode: string
  readonly city: string
  readonly country: string
}

export type Parcel = { readonly carrier: string; readonly tracking: string; readonly at: Date }
export type Problem = { readonly kind: ProblemKind; readonly note: string; readonly at: Date; readonly newDate?: Date }

/** An order as the supplier sees it, before what it did in this session (`store.ts`). */
export type SupOrder = {
  readonly number: string
  readonly placedAt: Date
  readonly lines: ReadonlyArray<SupLine>
  readonly units: number
  readonly status: SupStatus
  /** When it has to be with the carrier. */
  readonly handoff: Date
  /** "Jouw bedrag": what Northwind pays for these lines. */
  readonly amount: number
  readonly shipTo: ShipTo
  readonly acceptedAt?: Date
  readonly parcel?: Parcel
  readonly problem?: Problem
  /** "Notitie van Northwind". */
  readonly note?: string
}

export const COUNTRY: Readonly<Record<Customer["country"], string>> = {
  NL: "Nederland",
  BE: "België",
  DE: "Duitsland",
  FR: "Frankrijk",
  NO: "Noorwegen",
  SE: "Zweden",
  IT: "Italië",
  ES: "Spanje",
  GB: "Verenigd Koninkrijk",
  IE: "Ierland",
  PL: "Polen",
  PT: "Portugal"
}

const hash = (s: string) => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7)

const STREETS = [
  "Prinsengracht",
  "Lange Nieuwstraat",
  "Kerkstraat",
  "Hoofdweg",
  "Stationsplein",
  "Marktstraat",
  "Ringlaan",
  "Havenkade",
  "Dorpsstraat",
  "Molenweg"
]

function postcode(country: Customer["country"], h: number) {
  const n = 1000 + (h % 8999)
  if (country === "NL") return `${n} ${String.fromCharCode(65 + (h % 26))}${String.fromCharCode(65 + ((h >> 5) % 26))}`
  if (country === "GB" || country === "IE") return `${String.fromCharCode(65 + (h % 26))}${1 + (h % 9)} ${h % 9}AB`
  if (country === "DE" || country === "FR" || country === "IT" || country === "ES") return String(10000 + (h % 89999))
  return String(n)
}

function shipTo(o: Order): ShipTo {
  const c = customer(o.customerId)
  const h = hash(o.customerId)
  return {
    name: c?.name ?? "Klant",
    line1: `${STREETS[h % STREETS.length]} ${1 + (h % 180)}`,
    postcode: postcode(c?.country ?? "NL", h),
    city: c?.city ?? "",
    country: COUNTRY[c?.country ?? "NL"]
  }
}

function tracking(carrier: string, number: string) {
  const h = hash(`${carrier}${number}`)
  const digits = String(h).padStart(10, "0").slice(0, 10)
  if (carrier === "PostNL") return `3SNWD${digits}`
  if (carrier === "DHL") return `JVGL0${digits}`
  if (carrier === "DPD") return `0150${digits}`
  if (carrier === "UPS") return `1Z9A${digits}`
  return `GL${digits}`
}

const at = (day: number, time: string) => {
  const [h = 0, m = 0] = time.split(":").map(Number)
  return new Date(2026, 10, day, h, m)
}

/** The story's problem: the Aurora in XL is out until Wednesday, so #6312 waits (the dashboard's "Probleem gemeld"). */
const PROBLEMS: Readonly<Record<string, Problem>> = {
  "6312": {
    kind: "voorraad",
    note: "De XL van de Aurora komt woensdag binnen met de nieuwe batch, de rest ligt klaar.",
    at: at(23, "09:05"),
    newDate: at(25, "17:00")
  }
}

const NOTES: Readonly<Record<string, string>> = {
  "6402": "Graag de Skyline Tote en de Aurora in één doos; de tote komt van Black Cedar Studio naar jullie.",
  "6449": "Cadeauverpakking, zonder pakbon met prijzen."
}

/**
 * When it has to be with the carrier: an order placed before 12:00 the same day at 17:00, a later one
 * the next day at 17:00. In the busy week every hand-off is a day earlier, so the late column fills.
 */
function handoffOf(o: Order, druk: boolean) {
  const d = new Date(o.placedAt)
  const sameDay = d.getHours() < 12
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate() + (sameDay ? 0 : 1) - (druk ? 1 : 0), 17)
  return day
}

function statusOf(o: Order): SupStatus {
  if (o.status === "geannuleerd" || o.status === "terugbetaald") return "afgesloten"
  if (PROBLEMS[o.number] !== undefined) return "probleem"
  if (o.status === "betaald") return "te-accepteren"
  if (o.status === "bij-leverancier") return "te-verzenden"
  return "verzonden"
}

function rowOf(o: Order, druk: boolean): SupOrder {
  const lines = o.lines
    .map((l, i): SupLine | null => {
      const p = product(l.productId)
      if (p?.supplierId !== SUPPLIER_ID) return null
      return {
        id: `${o.number}-${i}`,
        productId: p.id,
        title: p.name,
        size: l.size,
        sku: `${p.sku}-${l.size === "Eén maat" ? "OS" : l.size}`,
        quantity: l.quantity,
        cost: p.cost
      }
    })
    .filter((l): l is SupLine => l !== null)
  const status = statusOf(o)
  const shipped = status === "verzonden" || status === "afgesloten"
  const h = hash(o.number)
  const accepted = status !== "te-accepteren"
  return {
    number: o.number,
    placedAt: o.placedAt,
    lines,
    units: lines.reduce((n, l) => n + l.quantity, 0),
    status,
    handoff: PROBLEMS[o.number]?.newDate ?? handoffOf(o, druk),
    amount: lines.reduce((n, l) => n + l.cost * l.quantity, 0),
    shipTo: shipTo(o),
    ...(accepted ? { acceptedAt: new Date(o.placedAt.getTime() + (40 + (h % 140)) * 60_000) } : {}),
    ...(shipped && o.status !== "geannuleerd"
      ? {
        parcel: {
          carrier: o.carrier,
          tracking: tracking(o.carrier, o.number),
          at: new Date(Math.min(NOW, o.placedAt.getTime() + (18 + (h % 8)) * 3_600_000))
        }
      }
      : {}),
    ...(PROBLEMS[o.number] === undefined ? {} : { problem: PROBLEMS[o.number] }),
    ...(NOTES[o.number] === undefined ? {} : { note: NOTES[o.number] })
  }
}

let rows: ReadonlyArray<SupOrder> | undefined
let busyRows: ReadonlyArray<SupOrder> | undefined

/** Allure's orders, newest first. `druk` moves every hand-off a day earlier. */
export function supplierRows(druk: boolean): ReadonlyArray<SupOrder> {
  if (druk) {
    busyRows ??= supplierOrders(SUPPLIER_ID).map((o) => rowOf(o, true))
    return busyRows
  }
  rows ??= supplierOrders(SUPPLIER_ID).map((o) => rowOf(o, false))
  return rows
}

export const isOpen = (s: SupStatus) => s === "te-accepteren" || s === "te-verzenden" || s === "probleem"

export function dueOf(handoff: Date): Due {
  const d = handoff.getTime()
  if (d < TODAY) return "late"
  if (d < TODAY + DAY) return "today"
  if (d < TODAY + 3 * DAY) return "soon"
  return "later"
}

/** The order views the list is cut by, and which rows each holds. */
export type OrderView = "te-verzenden" | "te-accepteren" | "te-laat" | "probleem" | "verzonden" | "alle"

export const ORDER_VIEWS: ReadonlyArray<{ readonly id: OrderView; readonly label: string }> = [
  { id: "te-verzenden", label: "Te verzenden" },
  { id: "te-accepteren", label: "Te accepteren" },
  { id: "te-laat", label: "Te laat" },
  { id: "probleem", label: "Probleem" },
  { id: "verzonden", label: "Verzonden" },
  { id: "alle", label: "Alle" }
]

export function inView(status: SupStatus, handoff: Date, view: OrderView) {
  if (view === "alle") return true
  if (view === "te-laat") return (status === "te-accepteren" || status === "te-verzenden") && dueOf(handoff) === "late"
  return status === view
}

/* ── products ─────────────────────────────────────────────────────────────────────────────────── */

export type StockMode = "live" | "op-voorraad" | "handmatig"

export const MODE_LABEL: Readonly<Record<StockMode, { readonly label: string; readonly detail: string }>> = {
  live: { label: "Live", detail: "Je API stuurt de voorraad door, elke vijf minuten." },
  "op-voorraad": { label: "Op voorraad of niet", detail: "Northwind ziet alleen of het er is, niet hoeveel." },
  handmatig: { label: "Handmatig", detail: "Je werkt de aantallen hier zelf bij." }
}

/** Stock per size, adding up to the product's stock in the records. The Aurora's XL is out until Wednesday. */
const SPLIT: Readonly<Record<string, ReadonlyArray<number>>> = {
  "aurora-hooded-fleece": [96, 168, 148, 0],
  "drift-crewneck": [8, 22, 20, 10],
  "boulevard-linen-shirt": [12, 30, 22, 10],
  "heartland-henley": [40, 72, 62, 36],
  "cloud-joggers": [34, 66, 56, 32]
}

/** Days from order to hand-off, as Allure promised them per product. */
const LEAD: Readonly<Record<string, number>> = { "aurora-hooded-fleece": 1 }

export const LOW_AT = 80

export type SupProduct = {
  readonly id: string
  readonly name: string
  readonly variants: ReadonlyArray<
    { readonly id: string; readonly size: string; readonly sku: string; readonly stock: number }
  >
  readonly lead: number
  readonly mode: StockMode
  readonly cost: number
}

export const SUP_PRODUCTS: ReadonlyArray<SupProduct> = supplierProducts(SUPPLIER_ID)
  .filter((p) => p.status !== "gearchiveerd")
  .map((p) => ({
    id: p.id,
    name: p.name,
    cost: p.cost,
    lead: LEAD[p.id] ?? 2,
    mode: "live",
    variants: p.sizes.map((size, i) => ({
      id: `${p.id}-${size}`,
      size,
      sku: `${p.sku}-${size}`,
      stock: SPLIT[p.id]?.[i] ?? Math.round(p.stock / p.sizes.length)
    }))
  }))

export const stockLevel = (units: number, variants: ReadonlyArray<number>) =>
  units === 0 ? "uitverkocht" : units < LOW_AT || variants.some((n) => n === 0) ? "laag" : "op-voorraad"

export const STOCK_LABEL = {
  "op-voorraad": { label: "Op voorraad", tone: "neutral" },
  laag: { label: "Lage voorraad", tone: "warn" },
  uitverkocht: { label: "Uitverkocht", tone: "bad" }
} as const

/**
 * The Aurora's size table as Northwind shows it in the store. Allure delivered it on 2 October; Sofía
 * changed the chest of S and M on 20 November after 21 of 26 refunds said "valt te klein".
 */
export const AURORA_SIZES = {
  productId: "aurora-hooded-fleece",
  deliveredAt: "2 okt",
  changedBy: "Sofía Kim",
  changedAt: "20 nov",
  advice: "Valt klein. Twijfel je tussen twee maten, neem de grotere.",
  columns: ["Borstomvang", "Lengte", "Mouwlengte"] as const,
  rows: [
    { size: "S", values: [98, 66, 61], was: [100, 66, 61] },
    { size: "M", values: [104, 69, 63], was: [106, 69, 63] },
    { size: "L", values: [110, 72, 65], was: [110, 72, 65] },
    { size: "XL", values: [116, 74, 66], was: [116, 74, 66] }
  ]
} as const

const auroraSize = (o: Order | undefined) => o?.lines.find((l) => l.productId === "aurora-hooded-fleece")?.size ?? "S"

/** What customers said about the Aurora last week, from the 26 refunds; no names, they stay with Northwind. */
export function auroraComplaints() {
  const refunded = ORDERS.filter((o) =>
    o.lines.some((l) => l.productId === "aurora-hooded-fleece") &&
    (o.status === "terugbetaald" || o.number === "5296")
  )
  const pick = (i: number) => refunded[i]
  const quotes = [
    { order: "5296", size: "S", text: "Valt eerder als een XS. De mouwen komen net over mijn pols.", when: "20 nov" },
    {
      order: pick(1)?.number,
      size: auroraSize(pick(1)),
      text: "Te klein over de schouders, terwijl ik altijd M draag.",
      when: "19 nov"
    },
    {
      order: pick(2)?.number,
      size: auroraSize(pick(2)),
      text: "Naad bij de linkerschouder liet los na één keer wassen.",
      when: "18 nov"
    }
  ].filter((q): q is { order: string; size: string; text: string; when: string } => q.order !== undefined)
  return {
    total: 26,
    reasons: [
      { label: "Valt te klein", count: 21 },
      { label: "Te groot", count: 2 },
      { label: "Naad los bij de schouder", count: 2 },
      { label: "Anders", count: 1 }
    ],
    quotes
  }
}

/* ── quality checks ───────────────────────────────────────────────────────────────────────────── */

export type QualityCheck = {
  readonly id: string
  readonly productId: string
  readonly kind: string
  readonly status: "gevraagd" | "ingestuurd" | "goedgekeurd" | "afgekeurd"
  readonly due: Date
  readonly requestedBy: string
  readonly requestedAt: Date
  readonly note: string
  readonly deliver: ReadonlyArray<string>
  readonly sizes: ReadonlyArray<string>
  readonly verdict?: string
}

export const CHECKS: ReadonlyArray<QualityCheck> = [
  {
    id: "qc-304",
    productId: "aurora-hooded-fleece",
    kind: "Batchcontrole",
    status: "gevraagd",
    due: at(27, "17:00"),
    requestedBy: "Sofía Kim",
    requestedAt: at(23, "13:50"),
    note:
      "Voor we opschalen: zes foto's van de nieuwe batch, binnen en buiten, en het batchnummer. Meet ook de borstomvang van een S na.",
    deliver: ["Foto's", "Batchnummer"],
    sizes: ["S", "M", "L"]
  },
  {
    id: "qc-301",
    productId: "aurora-hooded-fleece",
    kind: "Monster",
    status: "goedgekeurd",
    due: new Date(2026, 8, 30, 17),
    requestedBy: "Elena Hart",
    requestedAt: new Date(2026, 8, 24, 10),
    note: "Monster van de eerste productie: voorkant, achterkant, naden en de rits van dichtbij.",
    deliver: ["Foto's", "Maten"],
    sizes: [],
    verdict: "Goedgekeurd door Elena Hart op 1 okt."
  }
]

/* ── the chat ─────────────────────────────────────────────────────────────────────────────────── */

export type ChatMessage = {
  readonly id: string
  readonly from: "marco" | "elena" | "sofia"
  readonly body: string
  readonly at: Date
}

export const CHAT_PEOPLE = {
  marco: { name: "Marco Rossi", role: "Allure Fulfillment" },
  elena: { name: "Elena Hart", role: "Northwind · Eigenaar" },
  sofia: { name: "Sofía Kim", role: "Northwind · CX-lead" }
} as const

export const CHANNEL = "#allure-fulfillment"

/** Northwind's #allure-fulfillment, the same thread the brand reads in Teamchat. */
export function chatSeed(): ReadonlyArray<ChatMessage> {
  const toShip = supplierRows(false).filter((r) => r.status === "te-verzenden" && dueOf(r.handoff) === "today")
  const [a, b] = toShip.toReversed()
  return [
    {
      id: "m1",
      from: "sofia",
      at: at(20, "16:05"),
      body:
        "Hoi Marco, ik heb de maattabel van de Aurora aangepast: S en M vallen kleiner dan jullie tabel van 2 okt zegt. 21 van de 26 terugbetalingen vorige week waren ‘valt te klein’. Kun je de borstomvang van een S nameten in de nieuwe batch?"
    },
    {
      id: "m2",
      from: "marco",
      at: at(20, "16:40"),
      body: "Doe ik. De nieuwe batch komt woensdag binnen, dan meet ik er drie na."
    },
    {
      id: "m3",
      from: "elena",
      at: at(23, "09:12"),
      body: `Goedemorgen Marco, kun je bevestigen dat #${a?.number ?? "6417"} en #${
        b?.number ?? "6425"
      } vandaag de deur uit gaan?`
    },
    {
      id: "m4",
      from: "marco",
      at: at(23, "09:40"),
      body: "Beide liggen klaar voor PostNL, ophaling om 16:00. #6312 wacht op de XL, die heb ik gemeld."
    },
    {
      id: "m5",
      from: "sofia",
      at: at(23, "13:55"),
      body:
        "Dank je. Ik heb een batchcontrole voor de Aurora klaargezet, vóór vrijdag. Zes foto's en het batchnummer is genoeg, plus de borstomvang van een S."
    }
  ]
}

/** Messages from Northwind that Marco has not read yet: the last one. */
export const UNREAD_CHAT = 1

/* ── statements ───────────────────────────────────────────────────────────────────────────────── */

export type StatementLine = {
  readonly productId: string
  readonly title: string
  readonly quantity: number
  readonly unit: number
  readonly total: number
}

export type Correction = {
  readonly order: string
  readonly day: Date
  readonly title: string
  readonly quantity: number
  readonly unit: number
  readonly total: number
  readonly reason: string
}

export type Statement = {
  /** `2026-11`, also the URL. */
  readonly id: string
  readonly label: string
  readonly lines: ReadonlyArray<StatementLine>
  readonly corrections: ReadonlyArray<Correction>
  readonly shippedUnits: number
  readonly shipped: number
  readonly corrected: number
  readonly total: number
  readonly status: "betaald" | "lopend"
  readonly payDay: Date
}

export const STATEMENT_STATUS = {
  betaald: { label: "Betaald", tone: "good" },
  lopend: { label: "Lopend", tone: "warn" }
} as const

const MONTH = new Intl.DateTimeFormat("nl-NL", { month: "long", year: "numeric" })
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1)

/** Before 16 November the records hold no orders; their numbers run up to #5249 from the store's start. */
const historic = (d: Date) => {
  const start = new Date(2025, 2, 1).getTime()
  const cut = new Date(2026, 10, 16).getTime()
  return String(Math.round(1000 + ((d.getTime() - start) / (cut - start)) * 4249))
}

let statements: ReadonlyArray<Statement> | undefined

/**
 * What Northwind owes Allure, per month: every line it shipped at the agreed cost, less the returns that
 * were its fault (damaged, not as pictured) at the same cost. A size complaint is not a correction: the
 * size table is Northwind's page. November counts this week's real orders plus the first two weeks at
 * the week's pace; the months before keep the same pace, a little lower in summer.
 */
export function allureStatements(): ReadonlyArray<Statement> {
  if (statements !== undefined) return statements
  const week = new Map<string, number>()
  const weekStart = new Date(2026, 10, 16).getTime()
  const shippedThisMonth = supplierRows(false).filter((r) =>
    r.placedAt.getTime() >= weekStart && r.placedAt.getTime() < TODAY &&
    (r.status === "verzonden" || r.status === "afgesloten")
  )
  for (const r of shippedThisMonth) {
    for (const l of r.lines) week.set(l.productId, (week.get(l.productId) ?? 0) + l.quantity)
  }
  // Not the orders whose customers are quoted on the product page: those came back for the size.
  const quoted = new Set(auroraComplaints().quotes.map((q) => q.order))
  const refundedAurora = supplierRows(false).filter((r) =>
    r.status === "afgesloten" && r.parcel !== undefined && !quoted.has(r.number) &&
    r.lines.some((l) => l.productId === "aurora-hooded-fleece")
  )
  const months: ReadonlyArray<{ id: string; pace: number; days: number; real: boolean }> = [
    { id: "2026-11", pace: 1, days: 15, real: true },
    { id: "2026-10", pace: 0.94, days: 31, real: false },
    { id: "2026-09", pace: 0.82, days: 30, real: false },
    { id: "2026-08", pace: 0.71, days: 31, real: false },
    { id: "2026-07", pace: 0.74, days: 31, real: false },
    { id: "2026-06", pace: 0.79, days: 30, real: false }
  ]
  statements = months.map((m, i) => {
    const [y = 2026, mo = 1] = m.id.split("-").map(Number)
    const first = new Date(y, mo - 1, 1)
    const lines = SUP_PRODUCTS.map((p) => {
      const perWeek = week.get(p.id) ?? 0
      const quantity = Math.round((perWeek / 7) * m.days * m.pace * (1 + ((hash(p.id + m.id) % 9) - 4) / 100)) +
        (m.real ? perWeek : 0)
      return { productId: p.id, title: p.name, quantity, unit: p.cost, total: quantity * p.cost }
    }).filter((l) => l.quantity > 0)
    const corrections: Array<Correction> = m.real
      ? refundedAurora.slice(0, 2).map((r) => ({
        order: r.number,
        day: new Date(r.placedAt.getTime() + 3 * DAY),
        title: "Aurora Hooded Fleece",
        quantity: 1,
        unit: 32,
        total: -32,
        reason: "Beschadigd aangekomen"
      }))
      : Array.from({ length: 1 + (i % 3) }, (_, k) => {
        const p = SUP_PRODUCTS[(i + k) % SUP_PRODUCTS.length]
        const day = new Date(y, mo - 1, 6 + k * 9)
        return {
          order: historic(day),
          day,
          title: p?.name ?? "",
          quantity: 1,
          unit: p?.cost ?? 0,
          total: -(p?.cost ?? 0),
          reason: k % 2 === 0 ? "Beschadigd aangekomen" : "Anders dan op de foto"
        }
      })
    const shipped = lines.reduce((n, l) => n + l.total, 0)
    const corrected = corrections.reduce((n, c) => n + c.total, 0)
    const payDay = new Date(y, mo, 15, 10)
    return {
      id: m.id,
      label: cap(MONTH.format(first)),
      lines,
      corrections,
      shippedUnits: lines.reduce((n, l) => n + l.quantity, 0),
      shipped,
      corrected,
      total: shipped + corrected,
      status: payDay.getTime() <= NOW ? "betaald" : "lopend",
      payDay
    }
  })
  return statements
}

/* ── training ─────────────────────────────────────────────────────────────────────────────────── */

export type CourseBlock =
  | { readonly id: string; readonly kind: "tekst"; readonly title: string; readonly body: string }
  | {
    readonly id: string
    readonly kind: "vraag"
    readonly question: string
    readonly options: ReadonlyArray<string>
    readonly right: number
    readonly explain: string
  }

export type SupplierCourse = {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly minutes: number
  readonly by: string
  readonly updated: string
  readonly blocks: ReadonlyArray<CourseBlock>
}

/** The one course Northwind opened to Allure (`crs_doorsturen` in the current demo). */
export const COURSES: ReadonlyArray<SupplierCourse> = [
  {
    id: "doorsturen",
    title: "Een bestelling doorsturen naar de leverancier",
    description: "Van betaalde bestelling tot bevestiging van de leverancier, en wat je doet als een artikel op is.",
    minutes: 6,
    by: "Elena Hart",
    updated: "18 nov",
    blocks: [
      {
        id: "b1",
        kind: "tekst",
        title: "De wachtrij",
        body:
          "Onder Bestellingen → Te versturen staat alles wat betaald is en nog niet bij een leverancier ligt. Insyte kiest de leverancier per regel; jij controleert en verstuurt."
      },
      {
        id: "b2",
        kind: "tekst",
        title: "Wachten op bevestiging",
        body:
          "Een leverancier bevestigt binnen 24 uur. Daarna zet Insyte de bestelling bij Wacht op bevestiging en stuurt het één herinnering."
      },
      {
        id: "b3",
        kind: "vraag",
        question: "Binnen hoeveel uur bevestigt een leverancier?",
        options: ["Binnen 4 uur", "Binnen 24 uur", "Binnen 72 uur"],
        right: 1,
        explain: "Binnen 24 uur. Daarna stuurt Insyte één herinnering."
      },
      {
        id: "b4",
        kind: "tekst",
        title: "Uitverkocht",
        body:
          "Meldt de leverancier dat een artikel op is, dan kies je een andere leverancier of je mailt de klant met een alternatief. Annuleren doe je pas als de klant dat wil."
      }
    ]
  }
]

/* ── notifications ────────────────────────────────────────────────────────────────────────────── */

export type SupplierNote = {
  readonly id: string
  readonly from?: string
  readonly text: string
  readonly at: string
  readonly page: string
  readonly unread: boolean
  readonly glyph: "order" | "chat" | "clock" | "check" | "money"
}

/** A supplier hears about the work Northwind sends it, never about the brand's own workspace. */
export function supplierNotes(): ReadonlyArray<SupplierNote> {
  const all = supplierRows(false)
  const newest = all.find((r) => r.status === "te-accepteren")
  const today = all.filter((r) => isOpen(r.status) && dueOf(r.handoff) === "today").length
  const october = allureStatements().find((s) => s.id === "2026-10")
  return [
    {
      id: "s1",
      glyph: "order",
      text: `Nieuwe bestelling om te accepteren: **#${newest?.number ?? ""}**, ${newest?.units ?? 1} ${
        newest?.units === 1 ? "artikel" : "artikelen"
      }.`,
      at: "14:12",
      page: newest === undefined ? "bestellingen" : `bestellingen/${newest.number}`,
      unread: true
    },
    {
      id: "s2",
      glyph: "chat",
      from: "Sofía Kim",
      text:
        "Sofía Kim schreef in **#allure-fulfillment**: ‘Ik heb een batchcontrole voor de Aurora klaargezet, vóór vrijdag.’",
      at: "13:55",
      page: "chats",
      unread: true
    },
    {
      id: "s3",
      glyph: "check",
      from: "Sofía Kim",
      text: "Sofía Kim vraagt een **batchcontrole** voor de Aurora Hooded Fleece, vóór vrijdag 27 nov.",
      at: "13:50",
      page: "producten/aurora-hooded-fleece",
      unread: false
    },
    {
      id: "s4",
      glyph: "clock",
      text: `Vandaag overdragen om op tijd te zijn: **${today} bestellingen**.`,
      at: "12:00",
      page: "bestellingen",
      unread: false
    },
    {
      id: "s5",
      glyph: "money",
      text: `Afrekening **oktober** is betaald: € ${
        (october?.total ?? 0).toLocaleString("nl-NL", { maximumFractionDigits: 0 })
      }, verzonden regels tegen kostprijs.`,
      at: "15 nov",
      page: "afrekeningen/2026-10",
      unread: false
    }
  ]
}

/** The nav's counts, from the same rows as the pages. */
export const supplierCounts = () => {
  const all = supplierRows(false)
  return {
    accept: all.filter((r) => r.status === "te-accepteren").length,
    unreadNotes: supplierNotes().filter((n) => n.unread).length,
    unreadChat: UNREAD_CHAT
  }
}

/* ── settings ─────────────────────────────────────────────────────────────────────────────────── */

export const PROFILE = {
  name: ME.name,
  email: ME.email,
  phone: "phone" in ME && ME.phone !== undefined ? ME.phone : "+39 02 1234 5678",
  description: "Jassen, truien en broeken. Gemiddeld twee dagen tot overdracht, minimale afname 20 stuks per variant."
}

export const NOTIFY_ROWS = [
  { key: "nieuw", label: "Nieuwe bestelling", detail: "Een e-mail zodra Northwind je een bestelling stuurt." },
  { key: "laat", label: "Bijna te laat", detail: "Een herinnering om 14:00 voor wat vandaag nog weg moet." },
  { key: "bericht", label: "Bericht van Northwind", detail: "Een melding als het team je iets vraagt of vermeldt." },
  {
    key: "overzicht",
    label: "Dagelijks overzicht",
    detail: "Elke ochtend om 08:00: te accepteren, te verzenden en te laat."
  }
] as const

export type Platform = "eigen" | "aliexpress" | "cj" | "spocket" | "modalyst" | "geen"

export const PLATFORMS: ReadonlyArray<{ readonly id: Platform; readonly label: string; readonly detail: string }> = [
  { id: "eigen", label: "Eigen API", detail: "Insyte stuurt bestellingen naar je webhook en leest je voorraad." },
  { id: "aliexpress", label: "AliExpress", detail: "Bestellingen en track & trace via je AliExpress-account." },
  { id: "cj", label: "CJ Dropshipping", detail: "Voorraad en verzending rechtstreeks uit CJ." },
  { id: "spocket", label: "Spocket", detail: "Producten en voorraad uit je Spocket-catalogus." },
  { id: "modalyst", label: "Modalyst", detail: "Bestellingen en voorraad uit Modalyst." },
  { id: "geen", label: "Geen koppeling", detail: "Je werkt alles hier in Insyte bij." }
]

export const API = {
  enabled: true,
  platform: "eigen" as Platform,
  url: "https://allure.example/insyte/webhook",
  key: "sk_live_allure_8c2e71d04f9a"
}

/** "Hoe je levert": Allure's own parcels, eight weeks to 22 November, against the delivery date the customer saw. */
export const PERFORMANCE = {
  measure: "Op tijd bezorgd",
  until: "22 nov",
  weeks: [
    { label: "4 okt", onTime: 95.1, n: 362 },
    { label: "11 okt", onTime: 96.4, n: 371 },
    { label: "18 okt", onTime: 94.2, n: 380 },
    { label: "25 okt", onTime: 88.6, n: 402 },
    { label: "1 nov", onTime: 93.8, n: 391 },
    { label: "8 nov", onTime: 96.9, n: 368 },
    { label: "15 nov", onTime: 95.7, n: 377 },
    { label: "22 nov", onTime: 96.3, n: 384 }
  ],
  lateBy: 1.4
}
