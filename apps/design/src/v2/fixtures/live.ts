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
  { after: 70, kind: "cart", text: "Harbor Raincoat, maat S, in een mandje in Rotterdam" },
  { after: 95, kind: "sale", amount: 79, text: "**€ 79,00** · Aurora Hooded Fleece, maat M, uit Haarlem" },
  { after: 60, kind: "agent", text: "Retouragent bood een omruiling aan voor **#5318**" },
  { after: 110, kind: "cart", text: "Coastline Bomber Jacket, maat M, in een mandje in Leuven" },
  { after: 80, kind: "sale", amount: 49, text: "**€ 49,00** · Drift Crewneck, maat L, uit Amsterdam" },
  { after: 65, kind: "chat", text: "Nieuwe winkelchat over een kortingscode, Ethan Jeppesen neemt hem" }
]

/** The store chats open right now: what Live's menu counts and Sofía's peek says. */
export const OPEN_STORE_CHATS: ReadonlyArray<{ readonly id: string; readonly about: string; readonly who: string }> = [
  { id: "chat-levertijd", about: "Levertijd naar België", who: "Sofía Kim" },
  { id: "chat-aurora", about: "Maat van de Aurora", who: "Sofía Kim" },
  { id: "chat-korting", about: "Kortingscode werkt niet", who: "Sofía Kim" }
]
