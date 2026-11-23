import type { BarData, Figure, FunnelData, LineData, Note, TableData } from "../charts/types.ts"
import { ORDERS, VAT } from "./records.ts"
import type { Order } from "./records.ts"

/**
 * Analyse's demo data: one week of Northwind EU (16–22 november 2026) against the week before. The
 * figures agree with each other and with Magnus's answers: 41 refunds against 30, 26 of them on the
 * Aurora Hooded Fleece, 21 of those "valt te klein".
 */

export const PERIOD = { label: "16–22 nov", compare: "9–15 nov" } as const

const DAYS = ["ma", "di", "wo", "do", "vr", "za", "zo"] as const

/** The days of the week by name, for the breakdown of one day: "vrijdag 20 nov". */
export const WEEK_DAYS = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"] as const

const WEEK_START = new Date(2026, 10, 16).getTime()
const DAY_MS = 86_400_000

/** The week's orders (16–22 nov), from the shared records: what every figure on a board adds up to. */
export const WEEK_ORDERS: ReadonlyArray<Order> = ORDERS.filter((o) => {
  const t = o.placedAt.getTime()
  return t >= WEEK_START && t < WEEK_START + 7 * DAY_MS
})

/** One day's orders, oldest first: the breakdown behind a point of "Omzet per dag" (`day` 0 is Monday). */
export function ordersOn(day: number): ReadonlyArray<Order> {
  const from = WEEK_START + day * DAY_MS
  return WEEK_ORDERS.filter((o) => o.placedAt.getTime() >= from && o.placedAt.getTime() < from + DAY_MS).toReversed()
}

/** Revenue excl. btw, as Analyse counts it. */
export const revenueOf = (orders: ReadonlyArray<Order>) => Math.round(orders.reduce((s, o) => s + o.total, 0) / VAT)

const tally = <K extends string>(key: (o: Order) => K) => {
  const counts = new Map<K, number>()
  for (const o of WEEK_ORDERS) counts.set(key(o), (counts.get(key(o)) ?? 0) + 1)
  return counts
}

const STORE_NAME = { store_eu: "Northwind EU", store_us: "Northwind US" } as const
const byStore = tally((o) => o.storeId)
const byPayment = [...tally((o) => o.payment).entries()].toSorted((a, b) => b[1] - a[1])
const klarnaAt = byPayment.findIndex(([payment]) => payment === "Klarna")

/** A building block: one question, one form, its data and where the data came from. */
export type Block =
  & { readonly id: string; readonly title: string; readonly source: string; readonly note?: Note }
  & (
    | { readonly kind: "figures"; readonly figures: ReadonlyArray<Figure> }
    | { readonly kind: "line"; readonly data: LineData }
    | { readonly kind: "bar"; readonly data: BarData }
    | { readonly kind: "rank"; readonly data: BarData }
    | { readonly kind: "funnel"; readonly data: FunnelData }
    | { readonly kind: "table"; readonly data: TableData }
  )

export type BlockKind = Block["kind"]

export const BLOCKS = {
  kerncijfers: {
    id: "kerncijfers",
    kind: "figures",
    title: "Hoe ging de week?",
    source: "Shopify en Inbox · 1.204 bestellingen, 318 tickets",
    figures: [
      { label: "Omzet", value: 48210, previous: 44800, format: "euro", better: "higher" },
      { label: "Bestellingen", value: 1204, previous: 1152, format: "count", better: "higher" },
      { label: "Terugbetalingen", value: 41, previous: 30, format: "count", better: "lower" },
      { label: "Eerste reactie", value: 14, previous: 19, format: "minutes", better: "lower" }
    ]
  },
  retourcijfers: {
    id: "retourcijfers",
    kind: "figures",
    title: "Hoeveel komt er terug?",
    source: "Shopify · 41 terugbetalingen, 7 omruilingen",
    figures: [
      { label: "Terugbetalingen", value: 41, previous: 30, format: "count", better: "lower" },
      { label: "Retourpercentage", value: 3.4, previous: 2.6, format: "percent", better: "lower" },
      { label: "Omruilingen", value: 7, previous: 9, format: "count", better: "higher" },
      { label: "Terugbetaald", value: 2987, previous: 2140, format: "euro", better: "lower" }
    ]
  },
  omzetPerDag: {
    id: "omzetPerDag",
    kind: "line",
    title: "Omzet per dag",
    source: "Shopify · betaalde bestellingen, excl. btw",
    note: { text: "Vrijdag was de beste dag sinds juni: de Coastline-mail van donderdag.", at: 4 },
    data: {
      labels: DAYS,
      current: [6120, 7480, 6890, 7210, 8040, 6650, 5820],
      compare: [5900, 6400, 6700, 6500, 7300, 6600, 5400],
      format: "euro"
    }
  },
  bestellingenPerDag: {
    id: "bestellingenPerDag",
    kind: "line",
    title: "Bestellingen per dag",
    source: "Shopify · 1.204 bestellingen",
    data: {
      labels: DAYS,
      current: [168, 181, 172, 176, 190, 166, 151],
      compare: [160, 170, 168, 165, 180, 165, 144],
      format: "count",
      focus: 4
    }
  },
  retourredenen: {
    id: "retourredenen",
    kind: "rank",
    title: "Waarom komen retouren terug?",
    source: "Retourformulieren · 41 redenen",
    note: { text: "21 van de 23 ‘valt te klein’ gaan over de Aurora in maat S.", at: 0 },
    data: {
      items: [
        { label: "Valt te klein", value: 23, compare: 9 },
        { label: "Niet zoals op de foto", value: 6, compare: 7 },
        { label: "Valt te groot", value: 5, compare: 6 },
        { label: "Anders", value: 4, compare: 5 },
        { label: "Beschadigd", value: 3, compare: 3 }
      ],
      format: "count",
      focus: 0
    }
  },
  terugbetalingenPerProduct: {
    id: "terugbetalingenPerProduct",
    kind: "bar",
    title: "Terugbetalingen per product",
    source: "Shopify · 41 terugbetalingen",
    note: { text: "26 van de 41 terugbetalingen gaan over de Aurora Hooded Fleece.", at: 0 },
    data: {
      items: [
        { label: "Aurora", value: 26, compare: 8 },
        { label: "Coastline", value: 4, compare: 6 },
        { label: "Drift", value: 3, compare: 4 },
        { label: "Sailor", value: 3, compare: 5 },
        { label: "Overig", value: 5, compare: 7 }
      ],
      format: "count",
      focus: 0
    }
  },
  conversie: {
    id: "conversie",
    kind: "funnel",
    title: "Waar haken bezoekers af?",
    source: "Shopify-sessies · 38.420 bezoeken",
    data: {
      steps: [
        { label: "Bezoeken", value: 38420 },
        { label: "Product bekeken", value: 21130 },
        { label: "In winkelwagen", value: 4870 },
        { label: "Afrekenen", value: 2140 },
        { label: "Betaald", value: 1204 }
      ]
    }
  },
  retourPerProduct: {
    id: "retourPerProduct",
    kind: "table",
    title: "Welke producten komen terug?",
    source: "Shopify · verkocht en terugbetaald, 16–22 nov",
    data: {
      columns: [
        { key: "product", label: "Product" },
        { key: "sold", label: "Verkocht", format: "count" },
        { key: "returned", label: "Terug", format: "count", bar: true },
        { key: "rate", label: "Retour", format: "percent", previousKey: "ratePrev", better: "lower" }
      ],
      rows: [
        { product: "Aurora Hooded Fleece", sold: 212, returned: 26, rate: 12.3, ratePrev: 3.9 },
        { product: "Coastline Bomber Jacket", sold: 96, returned: 4, rate: 4.2, ratePrev: 5.8 },
        { product: "Drift Crewneck", sold: 154, returned: 3, rate: 1.9, ratePrev: 2.6 },
        { product: "Sailor Stripe Tee", sold: 188, returned: 3, rate: 1.6, ratePrev: 2.9 },
        { product: "Boulevard Linen Shirt", sold: 74, returned: 2, rate: 2.7, ratePrev: 2.5 },
        { product: "Harbor Raincoat", sold: 61, returned: 1, rate: 1.6, ratePrev: 3.3 }
      ],
      focus: 0
    }
  },
  levertijd: {
    id: "levertijd",
    kind: "bar",
    title: "Hoe snel leveren de leveranciers?",
    source: "Track & trace · 1.096 bezorgde pakketten",
    note: { text: "Kestrel Goods haalt de belofte van 5 dagen al drie weken niet.", at: 1 },
    data: {
      items: [
        { label: "Allure", value: 3.8, compare: 3.9 },
        { label: "Kestrel", value: 6.1, compare: 5.7 },
        { label: "DPC", value: 4.4, compare: 4.6 },
        { label: "Black Cedar", value: 4, compare: 4.2 }
      ],
      format: "days",
      focus: 1,
      reference: { value: 5, label: "belofte 5 d" }
    }
  },
  perVervoerder: {
    id: "perVervoerder",
    kind: "rank",
    title: "Terugbetalingen per vervoerder",
    source: "Shopify en track & trace · 41 terugbetalingen",
    data: {
      items: [
        { label: "PostNL", value: 18, compare: 13 },
        { label: "DHL", value: 11, compare: 8 },
        { label: "DPD", value: 8, compare: 6 },
        { label: "UPS", value: 4, compare: 3 }
      ],
      format: "count"
    }
  },
  bezorging: {
    id: "bezorging",
    kind: "figures",
    title: "Komt het op tijd aan?",
    source: "Track & trace · pakketten van 16–22 nov",
    figures: [
      { label: "Op tijd bezorgd", value: 91.2, previous: 93.4, format: "percent", better: "higher" },
      { label: "Te laat", value: 96, previous: 71, format: "count", better: "lower" },
      { label: "Gem. levertijd", value: 4.4, previous: 4.3, format: "days", better: "lower" },
      { label: "Nu vertraagd", value: 8, previous: 5, format: "count", better: "lower" }
    ]
  },
  teLaatPerLand: {
    id: "teLaatPerLand",
    kind: "rank",
    title: "Waar komen pakketten te laat aan?",
    source: "Track & trace · 96 te late pakketten",
    note: { text: "België: 19 van de 27 te late pakketten kwamen van Kestrel Goods.", at: 1 },
    data: {
      items: [
        { label: "Nederland", value: 41, compare: 36 },
        { label: "België", value: 27, compare: 14 },
        { label: "Duitsland", value: 18, compare: 15 },
        { label: "Frankrijk", value: 6, compare: 4 },
        { label: "Overig", value: 4, compare: 2 }
      ],
      format: "count",
      focus: 1
    }
  },
  geschillenPerReden: {
    id: "geschillenPerReden",
    kind: "rank",
    title: "Waarom betwisten klanten een betaling?",
    source: "Klarna, Stripe en PayPal · 3 geschillen geopend",
    note: { text: "CB-2291 van Felix Muller (Klarna, € 129) moet morgen 12:00 beantwoord zijn.", at: 0 },
    data: {
      items: [
        { label: "Artikel niet ontvangen", value: 1, compare: 0 },
        { label: "Niet zoals beschreven", value: 1, compare: 0 },
        { label: "Niet-geautoriseerde transactie", value: 1, compare: 0 }
      ],
      format: "count",
      focus: 0
    }
  },
  ticketsPerDag: {
    id: "ticketsPerDag",
    kind: "bar",
    title: "Wanneer komen de vragen binnen?",
    source: "Inbox · 318 tickets",
    note: { text: "Maandag brengt een vijfde van de vragen: wat in het weekend bleef liggen.", at: 0 },
    data: {
      items: [
        { label: "ma", value: 62, compare: 58 },
        { label: "di", value: 51, compare: 49 },
        { label: "wo", value: 44, compare: 47 },
        { label: "do", value: 41, compare: 44 },
        { label: "vr", value: 46, compare: 41 },
        { label: "za", value: 34, compare: 30 },
        { label: "zo", value: 40, compare: 38 }
      ],
      format: "count",
      focus: 0
    }
  },
  klantenservice: {
    id: "klantenservice",
    kind: "figures",
    title: "Hoe snel helpen we?",
    source: "Inbox · 318 tickets",
    figures: [
      { label: "Tickets", value: 318, previous: 307, format: "count", better: "lower" },
      { label: "Eerste reactie", value: 14, previous: 19, format: "minutes", better: "lower" },
      { label: "Binnen een dag opgelost", value: 84.6, previous: 78.1, format: "percent", better: "higher" },
      { label: "Door agents afgehandeld", value: 122, previous: 97, format: "count", better: "higher" }
    ]
  },
  perWinkel: {
    id: "perWinkel",
    kind: "bar",
    title: "Uit welke winkel komen de bestellingen?",
    source: `Shopify · ${WEEK_ORDERS.length.toLocaleString("nl-NL")} bestellingen`,
    data: {
      items: [...byStore.entries()].map(([store, value]) => ({ label: STORE_NAME[store], value })),
      format: "count",
      focus: 0
    }
  },
  betaalmethode: {
    id: "betaalmethode",
    kind: "rank",
    title: "Hoe betalen klanten?",
    source: `Shopify · ${WEEK_ORDERS.length.toLocaleString("nl-NL")} bestellingen`,
    note: {
      text: `Klarna: ${
        byPayment[klarnaAt]?.[1] ?? 0
      } bestellingen, en het geschil dat morgen 12:00 beantwoord moet zijn (CB-2291).`,
      at: klarnaAt
    },
    data: { items: byPayment.map(([label, value]) => ({ label, value })), format: "count", focus: klarnaAt }
  }
} as const satisfies Record<string, Block>

export type BlockId = keyof typeof BLOCKS

/** Four widths on a 12-column grid, one height: whatever is combined, the board stays aligned. */
export type Width = "third" | "half" | "two-thirds" | "full"

export type Placement = { readonly block: BlockId; readonly width: Width }

export type Board = {
  readonly id: string
  readonly name: string
  readonly owner: string
  /** The one block the board leads with: drawn larger, the question the board exists for. */
  readonly lead: BlockId
  readonly placements: ReadonlyArray<Placement>
}

export const BOARDS: ReadonlyArray<Board> = [
  {
    id: "week",
    name: "Weekoverzicht",
    owner: "Elena Hart",
    lead: "omzetPerDag",
    placements: [
      { block: "kerncijfers", width: "full" },
      { block: "omzetPerDag", width: "two-thirds" },
      { block: "retourredenen", width: "third" },
      { block: "conversie", width: "half" },
      { block: "retourPerProduct", width: "half" }
    ]
  },
  {
    id: "retouren",
    name: "Retouren",
    owner: "Sofía Kim",
    lead: "terugbetalingenPerProduct",
    placements: [
      { block: "retourcijfers", width: "full" },
      { block: "terugbetalingenPerProduct", width: "two-thirds" },
      { block: "retourredenen", width: "third" },
      { block: "retourPerProduct", width: "two-thirds" },
      { block: "perVervoerder", width: "third" }
    ]
  },
  {
    id: "leveranciers",
    name: "Leveranciers",
    owner: "Elena Hart",
    lead: "levertijd",
    placements: [
      { block: "bezorging", width: "full" },
      { block: "levertijd", width: "two-thirds" },
      { block: "teLaatPerLand", width: "third" },
      { block: "bestellingenPerDag", width: "third" },
      { block: "perVervoerder", width: "third" },
      { block: "retourPerProduct", width: "two-thirds" }
    ]
  },
  {
    id: "klantenservice",
    name: "Klantenservice",
    owner: "Sofía Kim",
    lead: "ticketsPerDag",
    placements: [
      { block: "klantenservice", width: "full" },
      { block: "ticketsPerDag", width: "two-thirds" },
      { block: "geschillenPerReden", width: "third" },
      { block: "retourredenen", width: "half" },
      { block: "teLaatPerLand", width: "half" }
    ]
  }
]

/**
 * The templates a new board starts from (`/v2/analyse/sjablonen`, `/v2/analyse/nieuw`): a name, the
 * question the board answers, and its blocks. "Leeg" starts with nothing and opens the block picker.
 */
export type BoardTemplate = {
  readonly id: string
  readonly name: string
  readonly purpose: string
  readonly lead: BlockId | null
  readonly placements: ReadonlyArray<Placement>
}

const asTemplate = (board: Board, purpose: string): BoardTemplate => ({
  id: board.id,
  name: board.name,
  purpose,
  lead: board.lead,
  placements: board.placements
})

const boardOf = (id: string) => BOARDS.find((b) => b.id === id)

export const BOARD_TEMPLATES: ReadonlyArray<BoardTemplate> = [
  ...[
    ["week", "Hoe ging de week: omzet, bestellingen, conversie en wat er terugkwam."],
    ["retouren", "Wat komt er terug, waarom, en bij welk product en welke vervoerder."],
    ["leveranciers", "Wie levert op tijd, waar pakketten blijven hangen en hoe lang het duurt."],
    ["klantenservice", "Hoeveel vragen er komen, wanneer, en hoe snel ze beantwoord zijn."]
  ].flatMap(([id, purpose]) => {
    const board = boardOf(id ?? "")
    return board === undefined ? [] : [asTemplate(board, purpose ?? "")]
  }),
  {
    id: "geld",
    name: "Betalingen en geschillen",
    purpose: "Hoe klanten betalen, uit welke winkel, en wat er betwist wordt.",
    lead: "betaalmethode",
    placements: [
      { block: "kerncijfers", width: "full" },
      { block: "betaalmethode", width: "third" },
      { block: "perWinkel", width: "third" },
      { block: "geschillenPerReden", width: "third" }
    ]
  },
  { id: "leeg", name: "Leeg bord", purpose: "Begin zonder blokken en kies ze zelf.", lead: null, placements: [] }
]
