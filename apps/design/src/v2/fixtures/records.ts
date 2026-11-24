import type { Tone } from "../ui/badge.tsx"
import { DEMO_NOW, TODAY } from "./workspace.ts"

/**
 * The records every area of `/v2` shares: Northwind's customers, suppliers, products and orders.
 *
 * Copied from the current demo (`src/app/fixtures/mock-data`), then moved to this version's clock and
 * story: euros, Dutch and Belgian addresses, the week of 16 to 22 November 2026 and today until 14:30
 * (`DEMO_NOW`). The orders are generated from a fixed seed so that each day has exactly the count and
 * the revenue Analyse shows for it (`fixtures/analytics.ts`), and today exactly `TODAY`'s 86 orders and
 * € 3.412. The handful of orders the story names (#5309 is four days late, #5318 is the Klarna dispute)
 * are pinned on top. An area adds its own detail in its own fixture and points at these ids; it never
 * copies a customer or an order of its own. Nothing here is real.
 */

/* ── customers ─────────────────────────────────────────────────────────────────────────────────── */

export type Customer = {
  /** The URL slug: `/v2/klanten/astrid-berg`. */
  readonly id: string
  readonly name: string
  readonly email: string
  readonly city: string
  readonly country: "NL" | "BE" | "DE" | "FR" | "NO" | "SE" | "IT" | "ES" | "GB" | "IE" | "PL" | "PT"
  /** Everything they ever paid, in euros, before this fixture's window. */
  readonly lifetimeValue: number
  readonly ordersCount: number
  readonly tags: ReadonlyArray<string>
  /** Customer since, as people say it. */
  readonly since: string
  /** A second record of the same person (another store, a guest checkout): the duplicate review's work. */
  readonly duplicateOf?: string
}

const C = (
  id: string,
  name: string,
  email: string,
  city: string,
  country: Customer["country"],
  lifetimeValue: number,
  ordersCount: number,
  since: string,
  tags: ReadonlyArray<string> = [],
  duplicateOf?: string
): Customer => ({
  id,
  name,
  email,
  city,
  country,
  lifetimeValue,
  ordersCount,
  since,
  tags,
  ...(duplicateOf === undefined ? {} : { duplicateOf })
})

/** The customers the story names, and the ones the current demo had. */
const NAMED: ReadonlyArray<Customer> = [
  C("astrid-berg", "Astrid Berg", "astrid@example.com", "Oslo", "NO", 880, 4, "mrt 2025"),
  C("hannah-schmidt", "Hannah Schmidt", "hannah@example.com", "Keulen", "DE", 1740, 9, "jan 2025", ["vaste klant"]),
  C("luca-romano", "Luca Romano", "luca.r@example.com", "Utrecht", "NL", 230, 2, "sep 2026"),
  C("maria-garcia", "Maria Garcia", "maria.garcia@example.com", "Gent", "BE", 2310, 8, "jun 2024", ["vip"]),
  C("chris-lee", "Chris Lee", "chris.lee@example.com", "Amsterdam", "NL", 4129, 22, "feb 2024", ["vip", "vaste klant"]),
  C("soren-nilsson", "Soren Nilsson", "soren@example.com", "Göteborg", "SE", 2210, 11, "apr 2024", ["vaste klant"]),
  C("felix-muller", "Felix Muller", "felix@example.com", "Düsseldorf", "DE", 2750, 13, "nov 2024", ["vip"]),
  C("noah-bakker", "Noah Bakker", "noah.bakker@example.com", "Rotterdam", "NL", 610, 4, "jul 2025"),
  C("lena-vos", "Lena Vos", "lena.vos@example.com", "Haarlem", "NL", 1490, 9, "okt 2024", ["vaste klant"]),
  C("daniel-brown", "Daniel Brown", "daniel.brown@example.com", "Antwerpen", "BE", 1842, 12, "mei 2024"),
  C("emily-white", "Emily White", "emily.white@example.com", "Londen", "GB", 940, 4, "aug 2025"),
  C("sofia-mendez", "Sofía Méndez", "sofia.m@example.com", "Madrid", "ES", 1280, 6, "dec 2024"),
  C("yuki-tanaka", "Yuki Tanaka", "yuki@example.com", "Amsterdam", "NL", 2980, 14, "mrt 2024", ["vip"]),
  C("aisha-khan", "Aisha Khan", "aisha@example.com", "Den Haag", "NL", 510, 3, "feb 2026"),
  C("olivier-dubois", "Olivier Dubois", "olivier@example.com", "Lille", "FR", 980, 5, "sep 2025"),
  C("priya-patel", "Priya Patel", "priya.patel@example.com", "Eindhoven", "NL", 690, 4, "jan 2026"),
  C("liam-oconnor", "Liam O'Connor", "liam@example.com", "Dublin", "IE", 1140, 7, "jun 2025"),
  C("nina-petrova", "Nina Petrova", "nina@example.com", "Warschau", "PL", 380, 2, "apr 2026"),
  C("carlos-mendes", "Carlos Mendes", "carlos@example.com", "Lissabon", "PT", 845, 5, "okt 2025"),
  C("mei-lin", "Mei Lin", "mei.lin@example.com", "Leiden", "NL", 540, 3, "mei 2026"),
  C("jacob-hill", "Jacob Hill", "jacob.hill@example.com", "Brussel", "BE", 195, 1, "nov 2026"),
  C("tariq-hassan", "Tariq Hassan", "tariq@example.com", "Arnhem", "NL", 1340, 6, "jul 2025"),
  C("renata-costa", "Renata Costa", "renata@example.com", "Porto", "PT", 470, 3, "mrt 2026"),
  C("bea-williams", "Bea Williams", "bea@example.com", "Mechelen", "BE", 320, 2, "aug 2026"),
  C("quinn-adams", "Quinn Adams", "quinn@example.com", "Groningen", "NL", 90, 1, "nov 2026"),
  C("devon-park", "Devon Park", "devon@example.com", "Berlijn", "DE", 1980, 10, "feb 2025", ["vaste klant"]),
  C("sage-ferreira", "Sage Ferreira", "sage@example.com", "Leuven", "BE", 660, 4, "jun 2026"),
  C("emma-jansen", "Emma Jansen", "emma.jansen@example.com", "Zwolle", "NL", 1210, 7, "apr 2025"),
  C("milan-peeters", "Milan Peeters", "milan.peeters@example.com", "Brugge", "BE", 405, 3, "okt 2026"),
  C("julia-weber", "Julia Weber", "julia.weber@example.com", "Hamburg", "DE", 760, 5, "dec 2025"),
  C("anouk-de-wit", "Anouk de Wit", "anouk@example.com", "Utrecht", "NL", 1890, 11, "sep 2024", ["vaste klant"]),
  C("thomas-claes", "Thomas Claes", "thomas.claes@example.com", "Hasselt", "BE", 260, 2, "jul 2026"),
  // The same people twice, as a second store or a guest checkout makes them.
  C("daniel-brown-2", "Daniel Brown", "dan.brown@gmail.com", "Antwerpen", "BE", 210, 2, "okt 2026", [], "daniel-brown"),
  C(
    "felix-muller-2",
    "Felix Muller",
    "felix.muller@example.com",
    "Düsseldorf",
    "DE",
    330,
    2,
    "sep 2026",
    [],
    "felix-muller"
  ),
  C("yuki-tanaka-2", "Yuki Tanaka", "yuki.t@example.com", "Amsterdam", "NL", 95, 1, "nov 2026", [], "yuki-tanaka")
]

const FIRST = [
  "Sanne",
  "Lars",
  "Fleur",
  "Daan",
  "Noor",
  "Bram",
  "Lotte",
  "Ruben",
  "Iris",
  "Thijs",
  "Eva",
  "Jesse",
  "Femke",
  "Sem",
  "Lieke",
  "Niels",
  "Merel",
  "Koen",
  "Anna",
  "Wout",
  "Elise",
  "Jonas",
  "Hanna",
  "Stijn",
  "Maud",
  "Pieter",
  "Julie",
  "Tom",
  "Sara",
  "Gijs",
  "Lina",
  "Mats",
  "Zoë",
  "Arne",
  "Roos",
  "Finn",
  "Nina",
  "Lucas",
  "Mila",
  "Jens"
]
const LAST = [
  "de Vries",
  "Janssens",
  "Peeters",
  "Visser",
  "Smit",
  "Maes",
  "Mulder",
  "Willems",
  "de Boer",
  "Claes",
  "Dekker",
  "Wouters",
  "Bos",
  "Goossens",
  "Vermeulen",
  "Hendriks",
  "Meijer",
  "Jacobs",
  "van Dijk",
  "Mertens",
  "Koster",
  "Dubois",
  "Brouwer",
  "Lambert",
  "van Leeuwen",
  "Schneider",
  "Kok",
  "Verhoeven",
  "Becker",
  "Postma"
]
const CITIES: ReadonlyArray<readonly [string, Customer["country"]]> = [
  ["Amsterdam", "NL"],
  ["Utrecht", "NL"],
  ["Rotterdam", "NL"],
  ["Gent", "BE"],
  ["Antwerpen", "BE"],
  ["Eindhoven", "NL"],
  ["Leuven", "BE"],
  ["Nijmegen", "NL"],
  ["Keulen", "DE"],
  ["Breda", "NL"],
  ["Brugge", "BE"],
  ["Groningen", "NL"],
  ["Hamburg", "DE"],
  ["Tilburg", "NL"],
  ["Lille", "FR"]
]
const SINCE = [
  "jan 2025",
  "apr 2025",
  "jul 2025",
  "okt 2025",
  "jan 2026",
  "mrt 2026",
  "jun 2026",
  "sep 2026",
  "nov 2026"
]

/**
 * Everyone else who bought this month: a store of 1.200 orders a week has about a thousand buyers, so
 * no named customer stands behind dozens of orders. Built from a fixed seed, like the orders.
 */
function buyers(): ReadonlyArray<Customer> {
  const rand = seeded(1123)
  const out: Array<Customer> = []
  const taken = new Set(NAMED.map((c) => c.id))
  for (let i = 0; out.length < 960; i++) {
    const first = FIRST[Math.floor(rand() * FIRST.length)] as string
    const last = LAST[Math.floor(rand() * LAST.length)] as string
    const name = `${first} ${last}`
    let id = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]+/g, "-")
    if (taken.has(id)) id = `${id}-${i}`
    taken.add(id)
    const [city, country] = CITIES[Math.floor(rand() * CITIES.length)] ?? ["Utrecht", "NL"]
    const orders = 1 + Math.floor(Math.pow(rand(), 3) * 9)
    out.push({
      id,
      name,
      email: `${id.replace(/-[0-9]+$/, "").replaceAll("-", ".")}@example.com`,
      city,
      country,
      lifetimeValue: Math.round(orders * (38 + rand() * 40)),
      ordersCount: orders,
      since: SINCE[Math.floor(rand() * SINCE.length)] ?? "nov 2026",
      tags: orders >= 7 ? ["vaste klant"] : []
    })
  }
  return out
}

export const CUSTOMERS: ReadonlyArray<Customer> = [...NAMED, ...buyers()]

export const customer = (id: string) => CUSTOMERS.find((c) => c.id === id)

/* ── suppliers ─────────────────────────────────────────────────────────────────────────────────── */

export type SupplierStatus = "actief" | "uitgenodigd" | "gepauzeerd"

export type Supplier = {
  /** The URL slug: `/v2/leveranciers/kestrel-goods`. */
  readonly id: string
  readonly name: string
  readonly email: string
  readonly phone?: string
  readonly country: string
  readonly status: SupplierStatus
  /** Stock and tracking come in over their API; otherwise they work in the supplier portal. */
  readonly apiConnected: boolean
  /** Average days from order to delivery over the last week, against the promise below. */
  readonly leadDays: number
  readonly promiseDays: number
  readonly since: string
}

export const SUPPLIERS: ReadonlyArray<Supplier> = [
  {
    id: "allure-fulfillment",
    name: "Allure Fulfillment",
    email: "ops@allurefulfillment.com",
    phone: "+39 02 1234 5678",
    country: "Italië",
    status: "actief",
    apiConnected: true,
    leadDays: 3.8,
    promiseDays: 5,
    since: "sep 2024"
  },
  {
    id: "dpc-apparel",
    name: "DPC Apparel",
    email: "team@dpcapparel.com",
    country: "Portugal",
    status: "actief",
    apiConnected: false,
    leadDays: 4.4,
    promiseDays: 5,
    since: "nov 2024"
  },
  {
    id: "kestrel-goods",
    name: "Kestrel Goods",
    email: "hi@kestrelgoods.co",
    country: "Verenigd Koninkrijk",
    status: "actief",
    apiConnected: true,
    leadDays: 6.1,
    promiseDays: 5,
    since: "feb 2025"
  },
  {
    id: "black-cedar-studio",
    name: "Black Cedar Studio",
    email: "studio@blackcedar.co",
    country: "Nederland",
    status: "actief",
    apiConnected: false,
    leadDays: 4,
    promiseDays: 5,
    since: "apr 2026"
  },
  {
    id: "noord-atelier",
    name: "Noord Atelier",
    email: "hallo@noordatelier.nl",
    country: "Nederland",
    status: "uitgenodigd",
    apiConnected: false,
    leadDays: 0,
    promiseDays: 5,
    since: "nov 2026"
  }
]

export const supplier = (id: string) => SUPPLIERS.find((s) => s.id === id)

/* ── products ──────────────────────────────────────────────────────────────────────────────────── */

export type ProductStatus = "actief" | "concept" | "gearchiveerd"

export type Product = {
  /** The URL slug: `/v2/producten/aurora-hooded-fleece`. */
  readonly id: string
  readonly name: string
  /** Shelf price in euros, incl. btw. */
  readonly price: number
  /** What the supplier charges, in euros. */
  readonly cost: number
  /** On hand over every size. */
  readonly stock: number
  readonly supplierId: string
  readonly status: ProductStatus
  readonly tags: ReadonlyArray<string>
  readonly sizes: ReadonlyArray<string>
  readonly sku: string
}

const P = (
  id: string,
  name: string,
  price: number,
  cost: number,
  stock: number,
  supplierId: string,
  tags: ReadonlyArray<string> = [],
  status: ProductStatus = "actief",
  sizes: ReadonlyArray<string> = ["S", "M", "L", "XL"]
): Product => ({
  id,
  name,
  price,
  cost,
  stock,
  supplierId,
  status,
  tags,
  sizes,
  sku: `NW-${id.split("-").map((w) => w.slice(0, 2).toUpperCase()).join("")}`
})

const ONE = ["Eén maat"]

export const PRODUCTS: ReadonlyArray<Product> = [
  P("aurora-hooded-fleece", "Aurora Hooded Fleece", 79, 32, 412, "allure-fulfillment", ["bestseller"]),
  P("coastline-bomber-jacket", "Coastline Bomber Jacket", 149, 58, 87, "kestrel-goods", ["nieuw"]),
  P("drift-crewneck", "Drift Crewneck", 59, 22, 60, "allure-fulfillment", ["bestseller"]),
  P("sailor-stripe-tee", "Sailor Stripe Tee", 32, 9, 530, "dpc-apparel"),
  P("harbor-raincoat", "Harbor Raincoat", 94, 36, 142, "kestrel-goods"),
  P("mariner-wool-beanie", "Mariner Wool Beanie", 25, 7, 1240, "dpc-apparel", [], "actief", ONE),
  P("field-pant-olive", "Field Pant · Olive", 89, 34, 230, "dpc-apparel", [], "actief", ["28", "30", "32", "34"]),
  P(
    "field-pant-stone",
    "Field Pant · Stone",
    89,
    34,
    0,
    "dpc-apparel",
    ["nabestelling"],
    "actief",
    ["28", "30", "32", "34"]
  ),
  P("skyline-tote", "Skyline Tote", 39, 11, 318, "black-cedar-studio", [], "actief", ONE),
  P("anchor-belt-tan", "Anchor Belt · Tan", 45, 14, 96, "black-cedar-studio", [], "actief", ["85", "90", "95"]),
  P("boulevard-linen-shirt", "Boulevard Linen Shirt", 69, 25, 74, "allure-fulfillment"),
  P("cascade-puffer", "Cascade Puffer", 179, 71, 38, "kestrel-goods", ["nieuw"]),
  P("meridian-daypack", "Meridian Daypack", 85, 30, 55, "kestrel-goods", [], "actief", ONE),
  P("heartland-henley", "Heartland Henley", 49, 17, 210, "allure-fulfillment"),
  P("sequoia-flannel", "Sequoia Flannel", 65, 23, 12, "dpc-apparel", ["bijna op"]),
  P("cloud-joggers", "Cloud Joggers", 55, 19, 188, "allure-fulfillment"),
  P("switchback-cap", "Switchback Cap", 29, 8, 0, "black-cedar-studio", [], "concept", ONE),
  P("pacific-sandal", "Pacific Sandal", 59, 21, 44, "dpc-apparel", [], "gearchiveerd", ["38", "40", "42", "44"])
]

export const product = (id: string) => PRODUCTS.find((p) => p.id === id)

/* ── orders ────────────────────────────────────────────────────────────────────────────────────── */

export type OrderStatus =
  | "betaald"
  | "bij-leverancier"
  | "verzonden"
  | "bezorgd"
  | "vertraagd"
  | "retour"
  | "terugbetaald"
  | "geannuleerd"

export const ORDER_STATUS: Readonly<Record<OrderStatus, { readonly label: string; readonly tone: Tone }>> = {
  betaald: { label: "Betaald", tone: "neutral" },
  "bij-leverancier": { label: "Bij leverancier", tone: "neutral" },
  verzonden: { label: "Verzonden", tone: "good" },
  bezorgd: { label: "Bezorgd", tone: "good" },
  vertraagd: { label: "Vertraagd", tone: "warn" },
  retour: { label: "Retour aangevraagd", tone: "accent" },
  terugbetaald: { label: "Terugbetaald", tone: "bad" },
  geannuleerd: { label: "Geannuleerd", tone: "neutral" }
}

export type Carrier = "PostNL" | "DHL" | "DPD" | "UPS"
export type Payment = "iDEAL" | "Kaart" | "Klarna" | "PayPal" | "Bancontact"

export type OrderLine = {
  readonly productId: string
  readonly size: string
  readonly quantity: number
  /** Price of one, in euros. */
  readonly price: number
}

export type Order = {
  /** The order number without the hash, also the URL: `/v2/bestellingen/5309`. */
  readonly number: string
  readonly customerId: string
  readonly lines: ReadonlyArray<OrderLine>
  /** Lines plus shipping, less discount, in euros, incl. btw (Analyse's revenue is this over `VAT`). */
  readonly total: number
  readonly shipping: number
  readonly discount: number
  readonly placedAt: Date
  readonly status: OrderStatus
  readonly carrier: Carrier
  readonly payment: Payment
  readonly storeId: "store_eu" | "store_us"
  readonly tags: ReadonlyArray<string>
  /** The day the customer was promised, for an order still on its way. */
  readonly promisedAt?: Date
  readonly note?: string
}

/** A small seeded generator, so the same orders come out every time. */
function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const DAY_MS = 86_400_000
/** Monday 16 November 2026, 00:00: the first day of Analyse's week. */
const WEEK_START = new Date(2026, 10, 16)
/** Orders and revenue per day, 16 to 22 November (`fixtures/analytics.ts`), then today until 14:30. */
const DAYS: ReadonlyArray<{ readonly orders: number; readonly revenue: number; readonly until: number }> = [
  { orders: 168, revenue: 6120, until: 24 },
  { orders: 181, revenue: 7480, until: 24 },
  { orders: 172, revenue: 6890, until: 24 },
  { orders: 176, revenue: 7210, until: 24 },
  { orders: 190, revenue: 8040, until: 24 },
  { orders: 166, revenue: 6650, until: 24 },
  { orders: 151, revenue: 5820, until: 24 },
  { orders: TODAY.orders, revenue: TODAY.revenue, until: DEMO_NOW.hours + DEMO_NOW.minutes / 60 }
]

/** Analyse counts revenue excl. btw; an order's total includes it. */
export const VAT = 1.21

const cents = (n: number) => Math.round(n * 100)
const linesTotal = (lines: ReadonlyArray<OrderLine>) => lines.reduce((s, l) => s + l.price * l.quantity, 0)

/** The first order of 16 November; numbers count up from here without a gap. */
export const FIRST_ORDER_NUMBER = 5250

const PAYMENTS: ReadonlyArray<Payment> = ["iDEAL", "iDEAL", "iDEAL", "Kaart", "Klarna", "PayPal", "Bancontact"]
const CARRIERS: ReadonlyArray<Carrier> = ["PostNL", "PostNL", "DHL", "DPD", "UPS"]
/** Who buys how often: the first customers in the list are the regulars. */
/** The named customers buy now and then; everyone else is one of the thousand. */
const REGULARS = NAMED.filter((c) => c.duplicateOf === undefined)
const OTHERS = CUSTOMERS.slice(NAMED.length)
/**
 * Orders other areas name together with their buyer (a ticket's order, the return portal's examples),
 * as they stood when those areas were written; kept so the buyer never moves under them.
 */
const KEEP_BUYER: Readonly<Record<string, string>> = {
  "5263": "hannah-schmidt",
  "5274": "maria-garcia",
  "5288": "luca-romano",
  "5296": "astrid-berg",
  "5297": "liam-oconnor",
  "5301": "soren-nilsson",
  "5309": "luca-romano",
  "5318": "felix-muller",
  "5321": "soren-nilsson",
  "5322": "maria-garcia",
  "5400": "quinn-adams",
  "5424": "sofia-mendez",
  "5433": "olivier-dubois",
  "5678": "priya-patel",
  "5820": "mei-lin",
  "5900": "priya-patel",
  "5988": "emma-jansen",
  "6120": "maria-garcia",
  "6230": "chris-lee",
  "6288": "yuki-tanaka",
  "6312": "maria-garcia",
  "6400": "priya-patel",
  "6402": "astrid-berg",
  "6417": "nina-petrova",
  "6425": "felix-muller",
  "6449": "thomas-claes",
  "6451": "daniel-brown",
  "6500": "priya-patel"
}
/** How often each product sells, by its place in `PRODUCTS`: Aurora most (212 last week). */
const WEIGHTS = [260, 15, 70, 420, 20, 560, 30, 0, 170, 90, 25, 5, 10, 100, 15, 50, 0, 0]

function buyer(number: string, _legacy: number, r: number): string {
  const kept = KEEP_BUYER[number]
  if (kept !== undefined) return kept
  return r < 0.04 ? pick(REGULARS, r / 0.04).id : pick(OTHERS, (r - 0.04) / 0.96).id
}

function pick<T>(items: ReadonlyArray<T>, r: number): T {
  return items[Math.floor(r * items.length) % items.length] as T
}

function pickProduct(r: number): Product {
  const total = WEIGHTS.reduce((a, b) => a + b, 0)
  let at = r * total
  for (const [i, w] of WEIGHTS.entries()) {
    if (at < w) return PRODUCTS[i] as Product
    at -= w
  }
  return PRODUCTS[0] as Product
}

function statusFor(dayIndex: number, supplierId: string, r: number): OrderStatus {
  const age = DAYS.length - 1 - dayIndex
  if (age === 0) return r < 0.7 ? "betaald" : "bij-leverancier"
  if (age === 1) return r < 0.3 ? "bij-leverancier" : "verzonden"
  if (age === 2) return r < 0.6 ? "verzonden" : "bezorgd"
  if (r < 0.02) return "geannuleerd"
  return supplierId === "kestrel-goods" && age >= 4 && r < 0.18 ? "verzonden" : "bezorgd"
}

/** The orders the story names, laid over the generated ones by number. */
const PINNED: Readonly<Record<string, Partial<Order>>> = {
  // Four days later than promised; ticket #5146, the 10% code on Start.
  "5309": {
    customerId: "luca-romano",
    status: "vertraagd",
    carrier: "PostNL",
    promisedAt: new Date(2026, 10, 19),
    tags: ["vertraagd"]
  },
  // The Klarna dispute behind chargeback CB-2291 (€ 129,00).
  "5318": { customerId: "felix-muller", payment: "Klarna", status: "bezorgd", tags: ["chargeback"] },
  // Astrid's Aurora in S, too small: the Retouragent wants to offer an M (ticket #5148).
  "5296": { customerId: "astrid-berg", status: "retour", tags: ["maat"] },
  "5301": { customerId: "soren-nilsson", status: "retour", tags: ["maat"] },
  // Asked "waar is mijn bestelling" at 14:28.
  "5322": { customerId: "maria-garcia", status: "verzonden", carrier: "DHL" },
  // The parcel DPD lost (ticket #5141).
  "5263": { customerId: "hannah-schmidt", status: "vertraagd", carrier: "DPD", tags: ["pakket kwijt"] }
}

function pinned(o: Order): Order {
  const extra = PINNED[o.number]
  if (extra === undefined) return o
  const next = { ...o, ...extra }
  if (o.number === "5296") {
    return { ...next, lines: [{ productId: "aurora-hooded-fleece", size: "S", quantity: 1, price: 79 }] }
  }
  if (o.number === "5318") {
    return {
      ...next,
      lines: [{ productId: "coastline-bomber-jacket", size: "L", quantity: 1, price: 129 }],
      note: "Coastline-actie: € 20 korting"
    }
  }
  return next
}

/**
 * Analyse's week sells these many of its best-known products (`fixtures/analytics.ts`, "Retour per
 * product"). The seeded mix lands near them; the difference is made up by turning single, cheap
 * orders (a beanie, a tee, a tote) into that product, spread evenly over the week, so the product
 * page, the order list and Analyse count the same units. Orders other areas name keep their lines.
 */
export const WEEK_UNITS: Readonly<Record<string, number>> = {
  "aurora-hooded-fleece": 212
}

function retarget(days: ReadonlyArray<Array<Order>>) {
  const slots = days.flatMap((orders, d) => orders.map((_, j) => ({ d, j })))
  const at = (slot: { d: number; j: number }) => days[slot.d]?.[slot.j] as Order
  const units = (id: string) =>
    slots.reduce((sum, slot) => sum + at(slot).lines.reduce((s, l) => s + (l.productId === id ? l.quantity : 0), 0), 0)
  const want = new Map(Object.entries(WEEK_UNITS).map(([id, n]) => [id, n - units(id)]))
  // Single-item orders of a product that has too many (or no target) can become one that is short.
  const spare = (id: string) =>
    (want.get(id) ?? -Infinity) < 0 ||
    (!want.has(id) && ["mariner-wool-beanie", "skyline-tote", "heartland-henley"].includes(id))
  const candidates = slots.filter((slot) => {
    const o = at(slot)
    return o.lines.length === 1 && o.lines[0]?.quantity === 1 && PINNED[o.number] === undefined &&
      KEEP_BUYER[o.number] === undefined
  })
  // A fixed stride through the week, so the change spreads over the days instead of filling Monday.
  const stride = 7
  for (const [id, short] of want) {
    if (short <= 0) continue
    const p = product(id) as Product
    let left = short
    for (let k = 0; left > 0 && k < candidates.length; k++) {
      const slot = candidates[(k * stride) % candidates.length] as { d: number; j: number }
      const o = at(slot)
      const from = o.lines[0]?.productId ?? ""
      if (from === id || !spare(from)) continue
      const day = days[slot.d] as Array<Order>
      day[slot.j] = {
        ...o,
        lines: [{ productId: id, size: p.sizes[slot.j % p.sizes.length] ?? "", quantity: 1, price: p.price }]
      }
      if (want.has(from)) want.set(from, (want.get(from) ?? 0) + 1)
      left--
    }
  }
}

const SHIPPING = 495
const FREE_FROM = 5000

/**
 * Closes one day on Analyse's revenue (incl. btw) to the cent, the way a shop would: € 4,95 shipping
 * under € 50, a few multi-item baskets that turn out to be single, a 10% code on some orders (more on a
 * day the baskets ran high), and one order that carries the last cents. The orders the story names keep their exact totals.
 */
function closeDay(orders: ReadonlyArray<Order>, target: number): Array<Order> {
  const day = orders.map((o) => ({ ...o, lines: [...o.lines] }))
  const free = day.filter((o) => PINNED[o.number] === undefined)
  const ship = (o: Order) => (PINNED[o.number] !== undefined || cents(linesTotal(o.lines)) >= FREE_FROM ? 0 : SHIPPING)
  const sum = () =>
    day.reduce((t, o) => t + cents(linesTotal(o.lines)) + ship(o), 0) - day.reduce((t, o) => t + cents(o.discount), 0)
  for (const o of free) o.discount = 0
  // Too much in the baskets: drop a second item (never an Aurora, which Analyse counts) or a second piece.
  for (const o of free) {
    if (sum() - target < 2500) break
    const extra = o.lines.findIndex((l, i) => i > 0 && l.productId !== "aurora-hooded-fleece")
    if (extra > 0) o.lines.splice(extra, 1)
    else if (o.lines[0] !== undefined && o.lines[0].quantity > 1 && o.lines[0].productId !== "aurora-hooded-fleece") {
      o.lines[0] = { ...o.lines[0], quantity: 1 }
    }
  }
  // Then a 10% code on every few orders until the day closes, a second round where it does not; the last takes what is left.
  for (const part of [10, 5]) {
    for (const [i, o] of free.entries()) {
      const over = sum() - target
      if (over <= 0) break
      if (i % 3 !== 1 && free.length - i > 3 * Math.ceil(over / 400)) continue
      const step = Math.round(cents(linesTotal(o.lines)) / part)
      o.discount = (cents(o.discount) + Math.min(step, over)) / 100
    }
  }
  // A shortfall is express shipping (€ 9,95) on a few orders, and the last cents on one more.
  const short = target - sum()
  let left = short
  const extra = new Map<string, number>()
  for (const o of free.toReversed()) {
    if (left <= 0) break
    if (ship(o) === 0) continue
    const add = Math.min(left, 500)
    extra.set(o.number, add)
    left -= add
  }
  return day.map((o) => {
    const shipping = (ship(o) + (extra.get(o.number) ?? 0)) / 100
    return { ...o, shipping, total: (cents(linesTotal(o.lines)) + cents(shipping) - cents(o.discount)) / 100 }
  })
}

function generate(): Array<Order> {
  const rand = seeded(20261123)
  // A stream of its own for who buys, so the products and statuses above never shift with it.
  const who = seeded(5150)
  const out: Array<Order> = []
  let number = FIRST_ORDER_NUMBER
  const days: Array<Array<Order>> = []
  for (const [dayIndex, day] of DAYS.entries()) {
    const start = WEEK_START.getTime() + dayIndex * DAY_MS
    const dayOrders: Array<Order> = []
    days.push(dayOrders)
    for (let i = 0; i < day.orders; i++) {
      // Spread over the day, more in the evening; today stops at 14:30.
      const hour = 7 + (day.until - 7) * Math.sqrt((i + rand()) / day.orders)
      const placedAt = new Date(start + Math.min(hour, day.until - 0.01) * 3_600_000)
      const lineCount = rand() < 0.92 ? 1 : 2
      const lines: Array<OrderLine> = []
      for (let l = 0; l < lineCount; l++) {
        const p = pickProduct(rand())
        lines.push({ productId: p.id, size: pick(p.sizes, rand()), quantity: rand() < 0.95 ? 1 : 2, price: p.price })
      }
      const first = product(lines[0]?.productId ?? "") as Product
      dayOrders.push({
        number: String(number++),
        customerId: buyer(String(number - 1), rand(), who()),
        lines,
        total: 0,
        shipping: 0,
        discount: 0,
        placedAt,
        status: statusFor(dayIndex, first.supplierId, rand()),
        carrier: pick(CARRIERS, rand()),
        payment: pick(PAYMENTS, rand()),
        storeId: rand() < 0.86 ? "store_eu" : "store_us",
        tags: []
      })
    }
  }
  retarget(days.slice(0, 7))
  for (const [dayIndex, day] of DAYS.entries()) {
    const dayOrders = (days[dayIndex] ?? []).map((o) => pinned(o))
    out.push(...closeDay(dayOrders, cents(day.revenue * VAT)))
  }
  return out
}

/**
 * The week's refunds and Kestrel's late parcels, marked on the delivered orders so that every list
 * agrees with Analyse: 41 refunded orders, 26 of them with an Aurora in them (`fixtures/analytics.ts`),
 * and the 6 Kestrel orders more than five days on their way that Start and the Kestrel agent name.
 */
function settle(orders: Array<Order>): Array<Order> {
  let aurora = 26
  let other = 15
  let kestrel = 6
  return orders.map((o) => {
    if (PINNED[o.number] !== undefined) return o
    const age = (new Date(2026, 10, 23).getTime() - o.placedAt.getTime()) / DAY_MS
    const hasAurora = o.lines.some((l) => l.productId === "aurora-hooded-fleece")
    const fromKestrel = o.lines.some((l) => product(l.productId)?.supplierId === "kestrel-goods")
    if (fromKestrel && age > 5 && kestrel > 0 && o.status !== "geannuleerd") {
      kestrel--
      return { ...o, status: "vertraagd", promisedAt: new Date(o.placedAt.getTime() + 5 * DAY_MS) }
    }
    if (o.status !== "bezorgd" || age < 3) return o
    if (hasAurora && aurora > 0 && (o.number.charCodeAt(3) % 2 === 0)) {
      aurora--
      return { ...o, status: "terugbetaald", tags: ["maat"] }
    }
    if (!hasAurora && other > 0 && Number(o.number) % 13 === 0) {
      other--
      return { ...o, status: "terugbetaald" }
    }
    return o
  })
}

/** Every order of 16 November until today 14:30, newest first. */
export const ORDERS: ReadonlyArray<Order> = settle(generate()).toReversed()

export const order = (number: string) => ORDERS.find((o) => o.number === number.replace(/^#/, ""))

/** Today's orders: exactly `TODAY.orders`; their totals over `VAT` sum to `TODAY.revenue`. */
export const ORDERS_TODAY: ReadonlyArray<Order> = ORDERS.filter(
  (o) => o.placedAt.getTime() >= new Date(2026, 10, 23).getTime()
)

export const customerOrders = (customerId: string) => ORDERS.filter((o) => o.customerId === customerId)
export const productOrders = (productId: string) => ORDERS.filter((o) => o.lines.some((l) => l.productId === productId))
export const supplierOrders = (supplierId: string) =>
  ORDERS.filter((o) => o.lines.some((l) => product(l.productId)?.supplierId === supplierId))
export const supplierProducts = (supplierId: string) => PRODUCTS.filter((p) => p.supplierId === supplierId)

/* ── formatting the demo's dates ───────────────────────────────────────────────────────────────── */

const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"]

/** "14:12" today, "gisteren 18:40", "zo 22 nov" this week, "16 nov" further back. */
export function when(at: Date): string {
  const today = new Date(2026, 10, 23).getTime()
  const time = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`
  const diff = Math.floor((today - new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime()) / DAY_MS)
  if (diff <= 0) return time
  if (diff === 1) return `gisteren ${time}`
  return `${at.getDate()} ${MONTHS[at.getMonth()]}`
}

/** "€ 1.234,50", or "€ 79" for whole euros. */
export function euro(value: number): string {
  const whole = Number.isInteger(value)
  return `€ ${value.toLocaleString("nl-NL", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`
}
