import type { Figure } from "../charts/types.ts"
import type { Presence } from "../ui/avatar.tsx"

/**
 * The demo workspace `/v2` draws: the same fictional Northwind Clothing Co. and team as the current
 * demo (`src/app/fixtures`), so the two versions tell one story. Nothing here is real.
 */

export const WORKSPACE = "Northwind"

export type ShopStore = {
  readonly id: string
  readonly name: string
  readonly detail: string
  readonly connected: boolean
}

export const STORES: ReadonlyArray<ShopStore> = [
  { id: "store_eu", name: "Northwind EU", detail: "Shopify · EUR", connected: true },
  { id: "store_us", name: "Northwind US", detail: "Shopify · USD", connected: true },
  { id: "store_uk", name: "Northwind UK", detail: "Shopify · ontkoppeld", connected: false }
]

export type Person = {
  readonly id: string
  readonly name: string
  readonly role: string
  readonly presence: Presence
}

export const PEOPLE = {
  elena: { id: "elena-hart", name: "Elena Hart", role: "Eigenaar", presence: "online" },
  sofia: { id: "sofia-kim", name: "Sofía Kim", role: "CX-lead", presence: "online" },
  ethan: { id: "ethan-jeppesen", name: "Ethan Jeppesen", role: "Teamlid", presence: "online" },
  liam: { id: "liam-tucker", name: "Liam Tucker", role: "Teamlid", presence: "away" },
  maya: { id: "maya-roy", name: "Maya Roy", role: "Teamlid", presence: "offline" }
} as const satisfies Record<string, Person>

/** Who is signed in. */
export const ME: Person = PEOPLE.elena

/**
 * "Now" in the demo: Monday 23 November 2026, 14:30. Start, Live and the boards all stand at this
 * moment, so a greeting, a clock and "vandaag tot nu" never disagree with each other, whatever time it
 * really is. Analyse's week (16–22 nov) is the week that ended yesterday.
 */
export const DEMO_NOW = { date: new Date(2026, 10, 23, 14, 30), hours: 14, minutes: 30, clock: "14:30" } as const

/**
 * Today until 14:30, against last Monday until 14:30: the one source for "vandaag" on Start, Live and
 * the boards. Revenue over orders is about € 40 a basket, as in Analyse's week (€ 48.210 over 1.204);
 * last Monday ended at 168 orders and € 6.120, so by 14:30 it stood at 79 and € 3.106.
 */
export const TODAY = {
  revenue: 3412,
  orders: 86,
  openTickets: 12,
  /** Minutes to the first reply, the median today. */
  firstReply: 11,
  lastMonday: { revenue: 3106, orders: 79, openTickets: 15, firstReply: 16 }
} as const

/** Today's four figures as the chart system draws them, for Start's strip. */
export const TODAY_FIGURES: ReadonlyArray<Figure> = [
  { label: "Omzet", value: TODAY.revenue, previous: TODAY.lastMonday.revenue, format: "euro", better: "higher" },
  { label: "Bestellingen", value: TODAY.orders, previous: TODAY.lastMonday.orders, format: "count", better: "higher" },
  {
    label: "Open tickets",
    value: TODAY.openTickets,
    previous: TODAY.lastMonday.openTickets,
    format: "count",
    better: "lower"
  },
  {
    label: "Eerste reactie",
    value: TODAY.firstReply,
    previous: TODAY.lastMonday.firstReply,
    format: "minutes",
    better: "lower"
  }
]

/** The records the werkdraad and the answers point at, each with what a peek shows. */
export const RECORDS = {
  aurora: {
    label: "Aurora Hooded Fleece",
    href: "/v2/producten/aurora-hooded-fleece",
    peek: ["Product · € 79,00", "212 verkocht afgelopen week", "26 terugbetalingen, 21 om ‘valt te klein’"]
  },
  allure: {
    label: "Allure Fulfillment",
    href: "/v2/leveranciers/allure-fulfillment",
    peek: ["Leverancier van de Aurora", "Gem. levertijd 3,8 dagen", "Maattabel laatst geleverd op 2 okt"]
  },
  kestrel: {
    label: "Kestrel Goods",
    href: "/v2/leveranciers/kestrel-goods",
    peek: ["Leverancier", "Gem. levertijd 6,1 dagen, belofte 5", "6 bestellingen langer dan 5 dagen onderweg"]
  },
  inbox: {
    label: "Inbox",
    href: "/v2/inbox",
    peek: [`${TODAY.openTickets} open tickets`, `Eerste reactie vandaag ${TODAY.firstReply} min`]
  }
} as const
