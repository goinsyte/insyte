import type { Vendor } from "./parts.tsx"

/*
 * The demo workspace's records, as the landing page draws them.
 *
 * Copied, not imported: the marketing pages may not reach into the product's fixtures (`apps/design/src/app/fixtures`). Every record here
 * is the console's "Gewone dinsdag" persona (`?scenario=settled`), Northwind Clothing Co.:
 *
 * - products and photographs: `apps/design/src/app/fixtures/mock-data/product-catalog.ts` (Unsplash, free
 *   licence), requested here at thumbnail width;
 * - the queue and its proposals: `apps/design/src/app/fixtures/mock-data/plates.ts`;
 * - customers and orders: `mock-data/customers.ts`, `mock-data/orders.ts` and the live ticker in
 *   `stores/live-store.ts` (SO-124xx);
 * - the people and suppliers named: `mock-data/members.ts`, `mock-data/suppliers.ts`;
 * - automation templates: `packages/ui/src/app/lib/automation-templates.ts`, with the vendor each step
 *   runs on;
 * - connected services: `stores/workspace-store.ts`.
 *
 * Northwind is the console's sample workspace, labelled as such wherever it is shown.
 */

/** An Unsplash photograph at thumbnail width. Small, cropped square, format chosen by the CDN. */
export const thumb = (id: string, w = 96): string =>
  `https://images.unsplash.com/photo-${id}?w=${w}&h=${w}&q=70&auto=format&fit=crop`

export const PRODUCTS = {
  fleece: { title: "Aurora fleece met capuchon", img: "1620799140188-3b2a02fd9a77", price: 89 },
  crewneck: { title: "Drift sweater met ronde hals", img: "1620799140408-edc6dcb6d633", price: 65 },
  raincoat: { title: "Harbor regenjas", img: "1527192250228-1ece59813102", price: 220 },
  flannel: { title: "Sequoia flanellen overhemd", img: "1760124128502-66d9ceaa418b", price: 84 },
  beanie: { title: "Mariner wollen muts", img: "1576871337632-b9aef4c17ab9", price: 35 },
  tote: { title: "Skyline draagtas", img: "1574365569389-a10d488ca3fb", price: 55 },
  daypack: { title: "Meridian rugzak", img: "1553062407-98eeb64c6a62", price: 120 },
  bomber: { title: "Coastline bomberjack", img: "1591047139829-d91aecb6caea", price: 145 },
  cap: { title: "Switchback pet", img: "1521369909029-2afed882baee", price: 32 },
  wallet: { title: "Granite portemonnee", img: "1620109176813-e91290f6c795", price: 59 }
} as const

export type ProductKey = keyof typeof PRODUCTS

/** A queue row: what it is, the record's own icon or logo, and a two-part title so nothing truncates. */
export type QueueItem = {
  readonly id: string
  readonly kind: "chargeback" | "supplier" | "ticket" | "customer" | "stock" | "template" | "order"
  readonly vendor?: Vendor
  readonly product?: ProductKey
  readonly person?: string
  readonly title: string
  readonly detail: string
  readonly store: "EU" | "US" | "Alle"
  readonly value: string
  readonly due: string
  readonly urgent: boolean
  /** Present when Insyte drew a proposal: what the plate says and what Versturen does. */
  readonly proposal?: {
    readonly heading: string
    readonly body: string
    readonly sources: ReadonlyArray<string>
    readonly action: string
    readonly toast: string
  }
}

/** The queue as it stands when the window settles (plates.ts, in its own order). */
export const QUEUE: ReadonlyArray<QueueItem> = [
  {
    id: "q_cb_2214",
    kind: "chargeback",
    vendor: "klarna",
    title: "Chargeback DSP-2214",
    detail: "Klarna · bewijs verzameld, 4 documenten",
    store: "EU",
    value: "€248,00",
    due: "4u 10m",
    urgent: true
  },
  {
    id: "q_tk_5142",
    kind: "ticket",
    vendor: "gmail",
    title: "Ticket #5142",
    detail: "Twee keer om terugbetaling gevraagd",
    store: "EU",
    value: "€89,95",
    due: "1d",
    urgent: false
  },
  {
    id: "q_stock",
    kind: "stock",
    product: "fleece",
    title: "Voorraad SKU-2148",
    detail: "Aurora fleece · over 2 dagen op",
    store: "US",
    value: "€1.204,00",
    due: "2d",
    urgent: false
  },
  {
    id: "q_tpl",
    kind: "template",
    title: "Sjabloon voor terugbetalingen",
    detail: "18% minder reacties dan gemiddeld",
    store: "Alle",
    value: "—",
    due: "1d",
    urgent: false
  },
  {
    id: "q_ship",
    kind: "order",
    vendor: "dhl",
    title: "Bestelling #10418 verzonden",
    detail: "DHL · track & trace verstuurd",
    store: "EU",
    value: "€134,00",
    due: "—",
    urgent: false
  }
]

/**
 * What arrives at the top of the queue while the window is watched, one at a time, each already
 * carrying the proposal Insyte drew for it. Versturen files it and the toast offers Undo, because
 * every one of these can be taken back (a chargeback submission cannot, so it is not in the loop).
 */
export const INCOMING: ReadonlyArray<QueueItem> = [
  {
    id: "in_allure",
    kind: "supplier",
    title: "3 bestellingen dreigen te laat",
    detail: "Leverancier Allure · SO-12231, SO-12236, SO-12240",
    store: "US",
    value: "€612,40",
    due: "vandaag",
    urgent: true,
    proposal: {
      heading: "Allure aansporen over drie bestellingen",
      body:
        "Hoi Allure-team, SO-12231, SO-12236 en SO-12240 lopen 1 tot 2 dagen achter. Kunnen jullie vandaag de verzenddatum bevestigen?",
      sources: ["Overdrachtsdatum 28 okt", "3 open bestellingen"],
      action: "Versturen",
      toast: "Bericht aan Allure verstuurd"
    }
  },
  {
    id: "in_sofia",
    kind: "customer",
    person: "SK",
    vendor: "gmail",
    title: "Sofía Kim vraagt naar haar pakket",
    detail: "Gmail · SO-12212, Drift sweater",
    store: "EU",
    value: "€72,50",
    due: "6u",
    urgent: false,
    proposal: {
      heading: "Antwoord aan Sofía Kim",
      body:
        "Hoi Sofía, je pakket is gisteren door DHL gescand in Utrecht en wordt morgen bezorgd. Hier is je track & trace.",
      sources: ["DHL-scan 30 okt", "Bestelling SO-12212"],
      action: "Versturen",
      toast: "Antwoord aan Sofía Kim verstuurd"
    }
  },
  {
    id: "in_5142",
    kind: "ticket",
    vendor: "gmail",
    title: "Ticket #5148 · retour van een regenjas",
    detail: "Gmail · Hannah Schmidt, SO-12463",
    store: "EU",
    value: "€220,00",
    due: "1d",
    urgent: false,
    proposal: {
      heading: "Retourlabel sturen aan Hannah",
      body:
        "Hoi Hannah, de Harbor regenjas valt binnen het retourbeleid. Het retourlabel zit in de bijlage; je geld staat terug zodra we hem binnen hebben.",
      sources: ["Retourbeleid v3", "Bezorgd 24 okt"],
      action: "Versturen",
      toast: "Retourlabel aan Hannah verstuurd"
    }
  }
]

/** The live ticker on the Start screen (live-store.ts, SO-1246x). */
export const LIVE_ORDERS = [
  { number: "SO-12461", who: "Emily White", product: "crewneck", qty: 1, total: "€ 60", ago: "3 min" },
  { number: "SO-12462", who: "Chris Lee", product: "raincoat", qty: 2, total: "€ 405", ago: "11 min" },
  { number: "SO-12463", who: "Hannah Schmidt", product: "flannel", qty: 3, total: "€ 254", ago: "19 min" },
  { number: "SO-12464", who: "Yuki Tanaka", product: "daypack", qty: 1, total: "€ 111", ago: "34 min" },
  { number: "SO-12465", who: "Maria Garcia", product: "beanie", qty: 2, total: "€ 65", ago: "52 min" }
] as const satisfies ReadonlyArray<{ product: ProductKey } & Record<string, unknown>>

/** The orders that arrive on the ticker while the window is watched. */
export const LIVE_NEXT = [
  { number: "SO-12466", who: "Olivier Dubois", product: "bomber", qty: 1, total: "€ 134", ago: "zojuist" },
  { number: "SO-12467", who: "Luca Romano", product: "tote", qty: 1, total: "€ 51", ago: "zojuist" },
  { number: "SO-12468", who: "Aisha Khan", product: "cap", qty: 2, total: "€ 59", ago: "zojuist" }
] as const satisfies ReadonlyArray<{ product: ProductKey } & Record<string, unknown>>

/** The automation library (automation-templates.ts): name, steps, and the vendor each step runs on. */
export const TEMPLATES: ReadonlyArray<{
  readonly id: string
  readonly name: string
  readonly steps: ReadonlyArray<{ readonly summary: string; readonly vendor?: Vendor; readonly ai?: true }>
  readonly evidence?: string
}> = [
  {
    id: "tpl_shipped",
    name: "Bestelling verzonden → track & trace-bericht",
    steps: [
      { summary: "Bestelling in Shopify als verzonden gemarkeerd", vendor: "shopify" },
      { summary: "Track & trace-link · merkfoto · retourstappen", vendor: "klaviyo" }
    ],
    evidence: "10 bestellingen zijn nu onderweg."
  },
  {
    id: "tpl_late",
    name: "Late levering → leverancier, excuses en korting",
    steps: [
      { summary: "Levering later dan verwacht", vendor: "shopify" },
      { summary: "Leverancier vragen de verzending te bevestigen" },
      { summary: "Excuses in de stem van het merk", ai: true },
      { summary: "Excuses + kortingscode van 10%", vendor: "gmail" }
    ],
    evidence: "8 bestellingen staan op Vertraagd en wachten op iemand."
  },
  {
    id: "tpl_chargeback",
    name: "Chargeback geopend → bewijs en een ticket",
    steps: [
      { summary: "Geschil geopend bij de bank", vendor: "klarna" },
      { summary: "Bestellingen van de klant koppelen", ai: true },
      { summary: "Ticket met de antwoorddeadline" }
    ],
    evidence: "5 geschillen staan open."
  },
  {
    id: "tpl_refund",
    name: "Terugbetaling aangevraagd → eerst goedkeuring",
    steps: [
      { summary: "Terugbetaling boven €100 aangevraagd", vendor: "shopify" },
      { summary: "Eigenaar keurt goed" },
      { summary: "Terugbetalen via Stripe", vendor: "stripe" }
    ]
  },
  {
    id: "tpl_stock",
    name: "Lage voorraad → operations inlichten, campagne pauzeren",
    steps: [
      { summary: "Minder dan 60 stuks over", vendor: "shopify" },
      { summary: "Operations inlichten", vendor: "slack" },
      { summary: "Campagnes voor dit product pauzeren", vendor: "klaviyo" }
    ],
    evidence: "3 actieve producten hebben lage voorraad."
  },
  {
    id: "tpl_negative",
    name: "Negatief ticket → escaleren met een voorgesteld antwoord",
    steps: [
      { summary: "Klant klinkt negatief", vendor: "gmail" },
      { summary: "Het sentiment lezen", ai: true },
      { summary: "Escaleren naar de CX-lead · prioriteit hoog" },
      { summary: "Voorgesteld antwoord op het ticket", ai: true }
    ]
  }
]

/** The rest of the library, for the marquee: the same file, the four templates not shown above. */
export const MORE_TEMPLATES: typeof TEMPLATES = [
  {
    id: "tpl_vip",
    name: "Bestelling met hoge waarde → VIP-label en melding aan eigenaar",
    steps: [
      { summary: "Bestelling van een klant boven €1.000", vendor: "shopify" },
      { summary: "Label VIP" },
      { summary: "Eigenaar laten weten", vendor: "slack" }
    ]
  },
  {
    id: "tpl_review",
    name: "Slechte review → ticket en een persoonlijk antwoord",
    steps: [
      { summary: "Review van 1 of 2 sterren" },
      { summary: "Ticket voor CX" },
      { summary: "Persoonlijk antwoord aan de reviewer", ai: true }
    ]
  },
  {
    id: "tpl_winback",
    name: "90 dagen geen bestelling → terugwinnen",
    steps: [
      { summary: "Elke dag: klanten die 90 dagen niet bestelden", vendor: "shopify" },
      { summary: "Klaviyo-terugwinlijst", vendor: "klaviyo" }
    ]
  },
  {
    id: "tpl_followup",
    name: "Antwoord van klant → samenvatting op het ticket",
    steps: [
      { summary: "Antwoord in een open gesprek", vendor: "gmail" },
      { summary: "Samenvatting op het ticket", ai: true }
    ]
  }
]

/** The stores, as `mock-data/stores.ts` has them. */
export const STORES = [
  { name: "Northwind US", domain: "northwind-clothing.myshopify.com", connected: true, currency: "USD" },
  { name: "Northwind EU", domain: "northwind-eu.myshopify.com", connected: true, currency: "EUR" },
  { name: "Northwind UK", domain: "northwind-uk.myshopify.com", connected: false, currency: "GBP" }
] as const
