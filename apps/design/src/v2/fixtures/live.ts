import type { Block } from "./analytics.ts"
import { DEMO_NOW, TODAY } from "./workspace.ts"

/**
 * Live's demo: Northwind EU on Monday 23 November, from 14:30 (`DEMO_NOW`). The screen ticks (visitors
 * drift, events arrive) from these starting values; nothing here is real traffic. Revenue and orders
 * start from `TODAY`, the same figures Start shows, and grow only by the sales that arrive.
 */

export const LIVE_KEY = { current: "Vandaag", compare: "Vorige maandag" } as const

/** The demo's clock starts here, so the feed and the clock agree whatever time it really is. */
export const OPENED_AT = { hours: DEMO_NOW.hours, minutes: DEMO_NOW.minutes } as const

/** Where the visitors are now: the base the ticker drifts around. */
export const NOW = {
  onStore: 47,
  browsing: 31,
  inCart: 9,
  checkout: 3,
  salesToday: TODAY.revenue,
  ordersToday: TODAY.orders
} as const

/** Last Monday at the same time, for the figures' comparison. */
export const SAME_TIME = {
  onStore: 39,
  inCart: 7,
  salesToday: TODAY.lastMonday.revenue,
  ordersToday: TODAY.lastMonday.orders
} as const

const HOURS = ["8:00", "9:00", "10:00", "11:00", "12:00", "13:00", "14:00"] as const

export const VISITORS_TODAY: Extract<Block, { kind: "line" }> = {
  id: "bezoekersVandaag",
  kind: "line",
  title: "Hoe druk is het vandaag?",
  source: "Shopify-sessies · per uur, tot nu",
  note: { text: "Om 12 uur dubbel zo druk als vorige maandag: de Instagram-post van 11:40.", at: 4 },
  data: {
    labels: HOURS,
    current: [62, 118, 164, 171, 302, 214, 188],
    compare: [58, 104, 150, 166, 148, 190, 176],
    format: "count",
    focus: 4
  }
}

export const LOOKING_AT: Extract<Block, { kind: "rank" }> = {
  id: "bekeken",
  kind: "rank",
  title: "Waar kijken ze nu naar?",
  source: "Shopify · bezoekers op een productpagina, nu",
  note: { text: "De Aurora wordt het meest bekeken maar zelden in het mandje gelegd: de maat.", at: 0 },
  data: {
    items: [
      { label: "Aurora Hooded Fleece", value: 12 },
      { label: "Coastline Bomber Jacket", value: 8 },
      { label: "Harbor Raincoat", value: 5 },
      { label: "Sailor Stripe Tee", value: 4 },
      { label: "Drift Crewneck", value: 2 }
    ],
    format: "count",
    focus: 0
  }
}

/** Where the visitors on the store are now, by country: the same 47 as "Op de winkel". */
export const WHERE_THEY_ARE: Extract<Block, { kind: "rank" }> = {
  id: "land",
  kind: "rank",
  title: "Waar zijn ze?",
  source: "Shopify · land van de sessie, nu",
  data: {
    items: [
      { label: "Nederland", value: 21 },
      { label: "België", value: 14 },
      { label: "Duitsland", value: 6 },
      { label: "Frankrijk", value: 3 },
      { label: "Overig", value: 3 }
    ],
    format: "count"
  }
}

export const COMING_FROM: Extract<Block, { kind: "rank" }> = {
  id: "herkomst",
  kind: "rank",
  title: "Waar komen ze vandaan?",
  source: "Shopify · verwijzer van de sessie, vandaag",
  data: {
    items: [
      { label: "Instagram", value: 412, compare: 160 },
      { label: "Google", value: 318, compare: 302 },
      { label: "Direct", value: 196, compare: 188 },
      { label: "Coastline-mail", value: 121, compare: 0 },
      { label: "TikTok", value: 72, compare: 64 }
    ],
    format: "count"
  }
}

export type LiveEvent = {
  readonly id: string
  readonly at: string
  readonly kind: "sale" | "cart" | "chat" | "agent"
  readonly text: string
  /** A sale's amount, added to today's revenue when it arrives. */
  readonly amount?: number
  /** Who on the map it happened to: where, and the product and size (a cart or a sale). */
  readonly who?: { readonly place: string; readonly product: string; readonly size: string }
}

/** What already happened when the page opens, newest first: the last half hour. */
export const EVENTS: ReadonlyArray<LiveEvent> = [
  {
    id: "e1",
    at: "14:29",
    kind: "sale",
    amount: 89,
    text: "**€ 89,00** · Coastline Bomber Jacket, maat L, uit Utrecht"
  },
  { id: "e2", at: "14:28", kind: "agent", text: "Waar is mijn bestelling beantwoordde een vraag over **#5322**" },
  { id: "e3", at: "14:27", kind: "cart", text: "Aurora Hooded Fleece, maat **M**, in een mandje in Gent" },
  { id: "e4", at: "14:25", kind: "chat", text: "Nieuwe winkelchat over levertijd, Sofía Kim neemt hem" },
  {
    id: "e5",
    at: "14:24",
    kind: "sale",
    amount: 158,
    text: "**€ 158,00** · 2× Sailor Stripe Tee en een Harbor Raincoat, uit Antwerpen"
  },
  { id: "e6", at: "14:21", kind: "cart", text: "Drift Crewneck, maat S, in een mandje in Den Haag" },
  { id: "e7", at: "14:19", kind: "agent", text: "Retouragent maakte een retourlabel voor **#5301**" },
  { id: "e8", at: "14:16", kind: "sale", amount: 39, text: "**€ 39,00** · Sailor Stripe Tee, maat M, uit Brugge" },
  {
    id: "e9",
    at: "14:12",
    kind: "agent",
    text: "Waar is mijn bestelling stelde een kortingscode voor aan Luca Romano"
  },
  { id: "e10", at: "14:08", kind: "chat", text: "Winkelchat over de maat van de Aurora, de agent antwoordde zelf" },
  { id: "e11", at: "14:05", kind: "sale", amount: 79, text: "**€ 79,00** · Aurora Hooded Fleece, maat L, uit Zwolle" }
]

/**
 * What arrives while you watch, in turn. `after` is how many demo seconds after the previous event it
 * lands, so the feed's times move on like a real afternoon instead of all reading the minute the page
 * opened. The demo runs faster than the clock: one event every few real seconds.
 */
export const INCOMING: ReadonlyArray<Omit<LiveEvent, "id" | "at"> & { readonly after: number }> = [
  {
    after: 70,
    kind: "cart",
    text: "Harbor Raincoat, maat S, in een mandje in Rotterdam",
    who: { place: "Rotterdam", product: "Harbor Raincoat", size: "S" }
  },
  {
    after: 95,
    kind: "sale",
    amount: 79,
    text: "**€ 79,00** · Aurora Hooded Fleece, maat M, uit Haarlem",
    who: { place: "Haarlem", product: "Aurora Hooded Fleece", size: "M" }
  },
  { after: 60, kind: "agent", text: "Retouragent bood een omruiling aan voor **#5318**" },
  {
    after: 110,
    kind: "cart",
    text: "Coastline Bomber Jacket, maat M, in een mandje in Leuven",
    who: { place: "Leuven", product: "Coastline Bomber Jacket", size: "M" }
  },
  {
    after: 80,
    kind: "sale",
    amount: 49,
    text: "**€ 49,00** · Drift Crewneck, maat L, uit Amsterdam",
    who: { place: "Amsterdam", product: "Drift Crewneck", size: "L" }
  },
  { after: 65, kind: "chat", text: "Nieuwe winkelchat over een kortingscode, Ethan Jeppesen neemt hem" }
]

/** The store chats open right now: what Live's menu counts and Sofía's peek says. */
export const OPEN_STORE_CHATS: ReadonlyArray<{ readonly id: string; readonly about: string; readonly who: string }> = [
  { id: "chat-levertijd", about: "Levertijd naar België", who: "Sofía Kim" },
  { id: "chat-aurora", about: "Maat van de Aurora", who: "Sofía Kim" },
  { id: "chat-korting", about: "Kortingscode werkt niet", who: "Sofía Kim" }
]

/* ── who is on the store: the map ──────────────────────────────────────────────────────────────── */

/**
 * How far a visitor is in: landed and looking around, on a product, something in the cart, paying,
 * or just bought (a dot that stays a moment, then leaves). The map draws the stages from light grey
 * to ink, the cart in ink, paying in the accent and a sale in the good tone.
 */
export type Stage = "kijkt" | "product" | "mandje" | "afrekenen" | "gekocht"

export const STAGES: ReadonlyArray<Stage> = ["kijkt", "product", "mandje", "afrekenen", "gekocht"]

export const STAGE_LABEL: Readonly<Record<Stage, string>> = {
  kijkt: "Kijkt rond",
  product: "Bekijkt een product",
  mandje: "Iets in het mandje",
  afrekenen: "Rekent af",
  gekocht: "Net gekocht"
}

export type Place = {
  readonly city: string
  readonly country: string
  readonly lon: number
  readonly lat: number
  /** How often a visitor comes from here, against the other places of the same country. */
  readonly weight: number
}

/** Where Northwind's visitors come from: mostly the Netherlands and Belgium, a few from further. */
export const PLACES: ReadonlyArray<Place> = [
  { city: "Amsterdam", country: "Nederland", lon: 4.9, lat: 52.37, weight: 6 },
  { city: "Rotterdam", country: "Nederland", lon: 4.48, lat: 51.92, weight: 4 },
  { city: "Utrecht", country: "Nederland", lon: 5.12, lat: 52.09, weight: 4 },
  { city: "Den Haag", country: "Nederland", lon: 4.3, lat: 52.08, weight: 3 },
  { city: "Haarlem", country: "Nederland", lon: 4.64, lat: 52.38, weight: 2 },
  { city: "Eindhoven", country: "Nederland", lon: 5.47, lat: 51.44, weight: 2 },
  { city: "Zwolle", country: "Nederland", lon: 6.09, lat: 52.52, weight: 1 },
  { city: "Groningen", country: "Nederland", lon: 6.57, lat: 53.22, weight: 1 },
  { city: "Nijmegen", country: "Nederland", lon: 5.86, lat: 51.84, weight: 1 },
  { city: "Antwerpen", country: "België", lon: 4.4, lat: 51.22, weight: 5 },
  { city: "Gent", country: "België", lon: 3.72, lat: 51.05, weight: 4 },
  { city: "Brussel", country: "België", lon: 4.35, lat: 50.85, weight: 3 },
  { city: "Brugge", country: "België", lon: 3.22, lat: 51.21, weight: 2 },
  { city: "Leuven", country: "België", lon: 4.7, lat: 50.88, weight: 2 },
  { city: "Luik", country: "België", lon: 5.57, lat: 50.63, weight: 1 },
  { city: "Berlijn", country: "Duitsland", lon: 13.4, lat: 52.52, weight: 2 },
  { city: "Keulen", country: "Duitsland", lon: 6.96, lat: 50.94, weight: 2 },
  { city: "Düsseldorf", country: "Duitsland", lon: 6.78, lat: 51.23, weight: 1 },
  { city: "Hamburg", country: "Duitsland", lon: 9.99, lat: 53.55, weight: 1 },
  { city: "Parijs", country: "Frankrijk", lon: 2.35, lat: 48.86, weight: 2 },
  { city: "Rijsel", country: "Frankrijk", lon: 3.06, lat: 50.63, weight: 1 },
  { city: "Londen", country: "Verenigd Koninkrijk", lon: -0.13, lat: 51.51, weight: 1 },
  { city: "Stockholm", country: "Zweden", lon: 18.07, lat: 59.33, weight: 1 },
  { city: "New York", country: "Verenigde Staten", lon: -74, lat: 40.71, weight: 1 }
]

export const place = (city: string) => PLACES.find((p) => p.city === city)

export type Source = "Instagram" | "Google" | "Direct" | "Klaviyo" | "TikTok"

/** The service logo of a source, when it has one (`ServiceLogo`); Direct has none. */
export const SOURCE_SERVICE: Readonly<Record<Source, string | null>> = {
  Instagram: "instagram",
  Google: "google",
  Direct: null,
  Klaviyo: "klaviyo",
  TikTok: null
}

/** The few pages a visitor looks around on before a product. */
export const LANDING_PAGES: ReadonlyArray<string> = ["Homepagina", "Collectie jassen", "Nieuw binnen", "Sale"]

export type Visitor = {
  readonly id: string
  readonly city: string
  readonly country: string
  /** A little off the city's centre, so two visitors from Gent are two dots. */
  readonly lon: number
  readonly lat: number
  readonly stage: Stage
  /** The page they are on: a product from "Bekijkt een product" on, else a landing page. */
  readonly page: string
  /** What is in the cart, from "Iets in het mandje" on: "Aurora Hooded Fleece, maat M". */
  readonly cart?: string | undefined
  readonly source: Source
  readonly device: "mobiel" | "desktop"
  readonly returning: boolean
  /** When they arrived, in demo seconds from the moment Live opened (negative: before it). */
  readonly since: number
  /** The tick their stage last changed, so the map can ring the dot once. */
  readonly moved: number
}

function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** One draw from `items` by weight. */
export function pickWeighted<T>(items: ReadonlyArray<T>, weight: (item: T) => number, roll: number): T {
  let r = roll * items.reduce((sum, item) => sum + weight(item), 0)
  for (const item of items) {
    r -= weight(item)
    if (r <= 0) return item
  }
  return items[0] as T
}

const COUNTRY_COUNT: ReadonlyArray<readonly [string, number]> = [
  ["Nederland", 21],
  ["België", 14],
  ["Duitsland", 6],
  ["Frankrijk", 3]
]
const ELSEWHERE_CITIES = ["Londen", "Stockholm", "New York"] as const
/** The products the 31 on a product page are looking at: "Waar kijken ze nu naar?". */
const LOOKED_AT: ReadonlyArray<readonly [string, number]> = [
  ["Aurora Hooded Fleece", 12],
  ["Coastline Bomber Jacket", 8],
  ["Harbor Raincoat", 5],
  ["Sailor Stripe Tee", 4],
  ["Drift Crewneck", 2]
]
const SIZES = ["S", "M", "M", "L", "L", "XL"] as const
const SOURCES: ReadonlyArray<readonly [Source, number]> = [
  ["Instagram", 5],
  ["Google", 4],
  ["Direct", 3],
  ["Klaviyo", 1],
  ["TikTok", 1]
]

/** A visitor's fields that a roll decides: the dot's offset, the source, the device, a return. */
export function visitorTraits(rand: () => number) {
  return {
    jitter: [(rand() - 0.5) * 0.5, (rand() - 0.5) * 0.35] as const,
    source: pickWeighted(SOURCES, (s) => s[1], rand())[0],
    device: rand() < 0.68 ? ("mobiel" as const) : ("desktop" as const),
    returning: rand() < 0.3,
    size: SIZES[Math.floor(rand() * SIZES.length)] ?? "M"
  }
}

/**
 * The 47 on the store when Live opens (`NOW.onStore`), the same crowd every time: by country as
 * "Waar zijn ze?" counts them (21, 14, 6, 3 and 3 elsewhere), 31 on a product as "Waar kijken ze
 * nu naar?" counts them, and of those 9 with something in the cart and 3 paying (`NOW`).
 */
export const VISITORS: ReadonlyArray<Visitor> = (() => {
  const rand = seeded(2311)
  const cities: Array<string> = [
    ...COUNTRY_COUNT.flatMap(([country, n]) => {
      const here = PLACES.filter((p) => p.country === country)
      return Array.from({ length: n }, () => pickWeighted(here, (p) => p.weight, rand()).city)
    }),
    ...ELSEWHERE_CITIES
  ]
  // Shuffled, so the stages below fall across the countries and not in their order.
  for (let i = cities.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[cities[i], cities[j]] = [cities[j] as string, cities[i] as string]
  }
  const pages = LOOKED_AT.flatMap(([page, n]) => Array.from({ length: n }, () => page))
  for (let i = pages.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[pages[i], pages[j]] = [pages[j] as string, pages[i] as string]
  }
  return cities.map((city, i): Visitor => {
    const at = place(city)
    const traits = visitorTraits(rand)
    const stage: Stage = i < NOW.checkout
      ? "afrekenen"
      : i < NOW.inCart
      ? "mandje"
      : i < NOW.browsing
      ? "product"
      : "kijkt"
    const page = stage === "kijkt"
      ? LANDING_PAGES[Math.floor(rand() * LANDING_PAGES.length)] ?? "Homepagina"
      : pages[i] ?? "Aurora Hooded Fleece"
    return {
      id: `v${i + 1}`,
      city,
      country: at?.country ?? "",
      lon: (at?.lon ?? 0) + traits.jitter[0],
      lat: (at?.lat ?? 0) + traits.jitter[1],
      stage,
      page,
      ...(stage === "mandje" || stage === "afrekenen" ? { cart: `${page}, maat ${traits.size}` } : {}),
      source: traits.source,
      device: traits.device,
      returning: traits.returning,
      since: -Math.round(60 + rand() * 1500),
      moved: -1
    }
  })
})()
