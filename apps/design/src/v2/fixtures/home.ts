import {
  BellRing,
  Box,
  CreditCard,
  Inbox,
  Mail,
  MessageSquare,
  Package,
  Returns,
  ShieldCheck,
  ShoppingBag,
  Store,
  Truck,
  UserPlus,
  Workflow
} from "../ui/icons.tsx"
import type { Glyph } from "./agents.ts"
import { OPEN_STORE_CHATS } from "./live.ts"
import { ORDERS } from "./records.ts"

/**
 * Start's day: one queue of what has to happen today, ranked by what is at stake and then by when it
 * is due. Some rows are yours to do (a task), some are an agent's proposal waiting for your yes.
 * `deadline` is minutes after midnight on the demo's Monday (`DEMO_NOW`), so tomorrow noon is
 * 24 × 60 + 12 × 60.
 */

const TOMORROW = 24 * 60

/**
 * What is at stake, which ranks a row before the clock does: a deadline someone else sets first,
 * then anything that moves money or speaks for the business (a customer, a supplier), then the rest.
 */
export type Stakes = "hard" | "outward" | "internal"

const RANK: Record<Stakes, number> = { hard: 0, outward: 1, internal: 2 }

export type Waiting = {
  readonly id: string
  readonly glyph: Glyph
  readonly title: string
  readonly context: string
  /** When it must be done, as people say it: "nu", "16:00", "morgen 12:00". */
  readonly due: string
  readonly deadline: number
  readonly stakes: Stakes
  /** Why it stands where it stands, in a few words: "harde deadline", "klanten wachten 6 u". */
  readonly because: string
  readonly action: string
  readonly href: string
}

export const WAITING: ReadonlyArray<Waiting> = [
  {
    id: "inbox",
    glyph: Inbox,
    title: "3 tickets wachten langer dan 4 uur",
    context: "Inbox · oudste van Felix Muller, 6 u",
    due: "nu",
    deadline: 14 * 60 + 30,
    stakes: "outward",
    because: "klanten wachten al 6 u",
    action: "Naar de inbox",
    href: "/v2/inbox"
  },
  {
    id: "dpd",
    glyph: Truck,
    title: "Pakket kwijt bij DPD voor Hannah Schmidt",
    context: "Ticket #5141 · aan jou toegewezen door de agent; DPD sluit claims om 17:00",
    due: "17:00",
    deadline: 17 * 60,
    stakes: "hard",
    because: "harde deadline",
    action: "Ticket openen",
    href: "/v2/inbox/5141"
  },
  {
    id: "cb-2291",
    glyph: CreditCard,
    title: "Bewijs voor chargeback #CB-2291",
    context: "Klarna · € 129,00 · bewijspakket staat klaar",
    due: "morgen 12:00",
    deadline: TOMORROW + 12 * 60,
    stakes: "hard",
    because: "harde deadline",
    action: "Pakket bekijken",
    href: "/v2/chargebacks/cb-2291"
  }
]

export type Approval = {
  readonly id: string
  readonly agentId: string
  readonly agent: string
  readonly title: string
  readonly why: string
  readonly read: ReadonlyArray<string>
  readonly at: string
  readonly due: string
  readonly deadline: number
  readonly stakes: Stakes
  readonly because: string
  /** The action sends something out (a mail): done shows the send window, not "uitgevoerd". */
  readonly sends?: boolean
  /** What the agent will send or set, as it stands: what Bewerken opens. */
  readonly draft: string
}

export const APPROVALS: ReadonlyArray<Approval> = [
  {
    id: "korting-5146",
    agentId: "waar-is-mijn-bestelling",
    agent: "Waar is mijn bestelling",
    title: "Kortingscode van 10% voor Luca Romano",
    why: "Bestelling #5309 is 4 dagen later dan beloofd; je regel zegt excuses en 10% na 3 dagen.",
    read: ["Ticket #5146", "PostNL-status", "Verzendbeleid"],
    at: "14:12",
    due: "16:00",
    deadline: 16 * 60,
    stakes: "outward",
    because: "kost geld · klant wacht",
    sends: true,
    draft:
      "Hoi Luca, je bestelling #5309 is vier dagen later dan we beloofden, sorry daarvoor. PostNL bezorgt hem morgen. Met de code SORRY10 krijg je 10% korting op je volgende bestelling."
  },
  {
    id: "omruil-5321",
    agentId: "retouragent",
    agent: "Retouragent",
    title: "Omruiling naar maat M voor Astrid Berg in plaats van terugbetalen",
    why: "Aurora Hooded Fleece in S, reden ‘valt te klein’. M is op voorraad (34 stuks).",
    read: ["Retour #R-881", "Voorraad Aurora", "Retourbeleid"],
    at: "13:47",
    due: "18:00",
    deadline: 18 * 60,
    stakes: "outward",
    because: "klant wacht op antwoord",
    sends: true,
    draft:
      "Hoi Astrid, jammer dat de Aurora te klein valt. Zullen we hem omruilen voor maat M? Die is op voorraad en gaat morgen de deur uit; het retourlabel zit in deze mail."
  },
  {
    id: "mail-kestrel",
    agentId: "leveranciers",
    agent: "Leveranciersopvolger",
    title: "Tweede mail aan Kestrel Goods over 6 vertraagde zendingen",
    why:
      "Geen antwoord op de mail van gisteren 10:15; de oudste zending is 8 dagen onderweg. Kestrels kantoor sluit om 16:00.",
    read: ["6 bestellingen", "Mail van gisteren", "Levertijd Kestrel"],
    at: "11:30",
    due: "15:00",
    deadline: 15 * 60,
    stakes: "outward",
    because: "leverancier sluit 16:00",
    sends: true,
    draft:
      "Beste Kestrel Goods, gisteren om 10:15 vroegen we naar zes zendingen die langer dan vijf dagen onderweg zijn. De oudste is nu acht dagen onderweg. Kunt u vandaag voor 16:00 per zending de status en een nieuwe verzenddatum sturen?"
  }
]

/** Everything on Start's queue: by stakes, then by deadline. */
export type QueueEntry =
  | { readonly kind: "task"; readonly item: Waiting }
  | { readonly kind: "proposal"; readonly item: Approval }

export const QUEUE: ReadonlyArray<QueueEntry> = [
  ...WAITING.map((item) => ({ kind: "task" as const, item })),
  ...APPROVALS.map((item) => ({ kind: "proposal" as const, item }))
].toSorted((a, b) => RANK[a.item.stakes] - RANK[b.item.stakes] || a.item.deadline - b.item.deadline)

/* ── Start's side column: the rest of the business, one reading each ─────────────────────────────── */

/**
 * "Elders": the few readings from other areas that are not on the queue and still worth a glance
 * today (the original dashboard's area tiles, as four lines). Each figure comes from the shared
 * records or the area's own fixture, so it is the same number the area shows.
 */
export type Elsewhere = {
  readonly id: string
  readonly glyph: Glyph
  readonly label: string
  readonly value: string
  readonly detail: string
  readonly href: string
  readonly tone: "warn" | "neutral"
}

const late = ORDERS.filter((o) => o.status === "vertraagd").length
const returnsAsked = ORDERS.filter((o) => o.status === "retour").length

export const ELSEWHERE: ReadonlyArray<Elsewhere> = [
  {
    id: "winkelchat",
    glyph: MessageSquare,
    label: "Winkelchat",
    value: `${OPEN_STORE_CHATS.length} open`,
    detail: "17 van 23 door de klantagent",
    href: "/v2/live/winkelchat",
    tone: "neutral"
  },
  {
    id: "vertraagd",
    glyph: ShoppingBag,
    label: "Bestellingen",
    value: `${late} vertraagd`,
    detail: "later dan beloofd",
    href: "/v2/bestellingen?status=vertraagd",
    tone: "warn"
  },
  {
    id: "retouren",
    glyph: Returns,
    label: "Retouren",
    value: `${returnsAsked} aangevraagd`,
    detail: "labels staan klaar",
    href: "/v2/retouren",
    tone: "neutral"
  },
  {
    id: "voorraad",
    glyph: Package,
    label: "Voorraad",
    value: "6 stuks",
    detail: "Coastline Bomber in M",
    href: "/v2/producten/coastline-bomber-jacket",
    tone: "warn"
  }
]

/* ── the first day (`?staat=leeg`): setup, and where to go next ──────────────────────────────────── */

export type SetupTask = {
  readonly id: string
  readonly label: string
  readonly href: string
  readonly glyph: Glyph
  /** Insyte knows this itself (a connected store); the rest the operator ticks. */
  readonly auto: boolean
  readonly done: boolean
}

/** The setup checklist of a new workspace: three facts Insyte knows, four the operator ticks. */
export const SETUP_TASKS: ReadonlyArray<SetupTask> = [
  {
    id: "store",
    label: "Een Shopify-winkel koppelen",
    href: "/v2/instellingen/winkels",
    glyph: Store,
    auto: true,
    done: true
  },
  {
    id: "inbox",
    label: "Je support-inbox koppelen",
    href: "/v2/instellingen/koppelingen",
    glyph: Mail,
    auto: true,
    done: false
  },
  {
    id: "team",
    label: "Een collega uitnodigen",
    href: "/v2/instellingen/team",
    glyph: UserPlus,
    auto: true,
    done: false
  },
  {
    id: "supplier",
    label: "Een leverancier koppelen",
    href: "/v2/leveranciers",
    glyph: Truck,
    auto: false,
    done: false
  },
  {
    id: "automation",
    label: "Een startautomatisering aanzetten",
    href: "/v2/automatiseringen",
    glyph: Workflow,
    auto: false,
    done: false
  },
  {
    id: "security",
    label: "Tweestapsverificatie voor iedereen aanzetten",
    href: "/v2/instellingen/beveiliging",
    glyph: ShieldCheck,
    auto: false,
    done: false
  },
  {
    id: "alerts",
    label: "Drempels voor meldingen kiezen",
    href: "/v2/instellingen/meldingen",
    glyph: BellRing,
    auto: false,
    done: false
  }
]

/** Where a new workspace goes in its first week. */
export const FIRST_WEEK: ReadonlyArray<
  { readonly title: string; readonly body: string; readonly href: string; readonly glyph: Glyph }
> = [
  {
    title: "Je catalogus importeren",
    body: "Producten en varianten uit Shopify, met foto's en voorraad.",
    href: "/v2/producten",
    glyph: Box
  },
  {
    title: "Je team uitnodigen",
    body: "Wie tickets beantwoordt en wie leveranciers aanspoort.",
    href: "/v2/instellingen/team",
    glyph: UserPlus
  },
  {
    title: "Een agent kiezen",
    body: "Bijvoorbeeld een die late bestellingen meldt voordat de klant vraagt.",
    href: "/v2/magnus/galerij",
    glyph: Workflow
  },
  {
    title: "Je inbox koppelen",
    body: "Dan stelt Magnus een antwoord op voor elke nieuwe vraag.",
    href: "/v2/instellingen/koppelingen",
    glyph: Inbox
  }
]

/* ── a proposal drawn again (R on Start): the agent's next version of the same draft ────────────── */

/**
 * What an agent writes when it is asked to draw a proposal again: the same decision, said another
 * way. Start cycles through these, the fixture's own draft first.
 */
export const REDRAFTS: Readonly<Record<string, ReadonlyArray<string>>> = {
  "korting-5146": [
    "Hoi Luca, sorry: je bestelling #5309 had er al vier dagen moeten zijn. PostNL bezorgt hem morgen tussen 10:00 en 13:00. Als excuus: met SORRY10 krijg je 10% korting op je volgende bestelling.",
    "Beste Luca, je bestelling #5309 is vertraagd en dat had niet mogen gebeuren. Morgen staat PostNL voor je deur. Gebruik SORRY10 bij je volgende bestelling voor 10% korting."
  ],
  "omruil-5321": [
    "Hoi Astrid, dank voor je retour. Zal ik de Aurora voor je omruilen naar maat M? Hij ligt klaar en gaat morgen op de post; het label voor de S zit bij deze mail.",
    "Hoi Astrid, de Aurora valt klein, dat horen we vaker. Maat M is op voorraad: zeg ja en we sturen hem morgen, met een gratis retourlabel voor de S."
  ],
  "mail-kestrel": [
    "Beste Kestrel Goods, we wachten nog op antwoord over zes zendingen; de oudste is acht dagen onderweg. Wilt u vandaag voor 16:00 per zending de status en de nieuwe verzenddatum sturen? Dan kunnen wij onze klanten informeren.",
    "Goedemiddag, zes van onze zendingen zijn langer dan vijf dagen onderweg, de oudste acht. Graag vandaag voor 16:00 per zending een status en een nieuwe datum. Lukt dat niet, bel dan even met Elena Hart."
  ]
}

/* ── Mijn werk: everything that is yours to do, from across Insyte ────────────────────────────── */

/** The kinds of dated things on Start (Mijn werk, Agenda, the board's "Agenda vandaag"). */
export type MomentKind =
  | "wachtrij"
  | "ticket"
  | "leverancier"
  | "chargeback"
  | "retour"
  | "uitnodiging"
  | "taak"
  | "automatisering"
  | "overzicht"
  | "afspraak"
  | "rapport"
  | "uitbetaling"

export const KIND_LABEL: Readonly<Record<MomentKind, string>> = {
  wachtrij: "Wachtrij",
  ticket: "Ticket",
  leverancier: "Leverancier",
  chargeback: "Chargeback",
  retour: "Retour",
  uitnodiging: "Uitnodiging",
  taak: "Taak",
  automatisering: "Automatisering",
  overzicht: "Overzicht",
  afspraak: "Afspraak",
  rapport: "Rapport",
  uitbetaling: "Uitbetaling"
}

/**
 * One thing on Mijn werk. `day` is days after the demo's Monday (−1 is yesterday, so late); without
 * it the item has no date. A proposal is not ticked here: deciding it is Start's, so its row opens it
 * there. `doneAt` is set for what was already done today.
 */
export type WorkSeed = {
  readonly id: string
  readonly kind: MomentKind
  readonly title: string
  readonly record?: string
  readonly where: string
  readonly href: string
  readonly day?: number
  readonly time?: string
  readonly doneAt?: string
}

/** What Mijn werk holds beyond Start's queue and the tickets assigned to you. */
export const WORK_SEEDS: ReadonlyArray<WorkSeed> = [
  {
    id: "w-maya",
    kind: "uitnodiging",
    title: "Uitnodiging van Maya Roy opvolgen",
    where: "Team",
    href: "/v2/instellingen/team",
    day: -1
  },
  {
    id: "w-r881",
    kind: "retour",
    title: "Retour beoordelen voor Astrid Berg",
    record: "R-881",
    where: "Retouren",
    href: "/v2/retouren/r-881",
    day: 0,
    time: "18:00"
  },
  {
    id: "w-kestrel-bel",
    kind: "leverancier",
    title: "Kestrel Goods bellen over de Cascade Puffer",
    where: "Leveranciers",
    href: "/v2/leveranciers/kestrel-goods",
    day: 1,
    time: "10:00"
  },
  {
    id: "w-cb2302",
    kind: "chargeback",
    title: "Verweer voor de PayPal-chargeback nalezen",
    where: "Chargebacks",
    href: "/v2/chargebacks",
    day: 2,
    time: "11:00"
  },
  {
    id: "w-bf",
    kind: "taak",
    title: "Black Friday-kortingen controleren in Shopify",
    where: "Producten",
    href: "/v2/producten",
    day: 3
  },
  {
    id: "w-maand",
    kind: "taak",
    title: "Kosten van november naar de boekhouder",
    where: "Kosten",
    href: "/v2/kosten",
    day: 8
  },
  {
    id: "w-sale",
    kind: "taak",
    title: "Prijzen van de Sale-collectie nagekeken",
    where: "Producten",
    href: "/v2/producten",
    day: 0,
    doneAt: "11:20"
  }
]

/** Your own list (the board's "Je lijst" and Mijn werk's quick add), as it stands this morning. */
export const TODO_SEEDS: ReadonlyArray<{ readonly id: string; readonly text: string; readonly day?: number }> = [
  { id: "t-foto", text: "Nieuwe foto's van de Field Pant Stone aanvragen" },
  { id: "t-retourbeleid", text: "Retourbeleid nalezen voor de feestdagen", day: 1 },
  { id: "t-allure", text: "Allure bellen over de maattabel", day: 4 }
]

/* ── the Agenda: every deadline and scheduled thing on one clock ──────────────────────────────── */

export type Tone = "bad" | "warn" | "accent" | "good" | "neutral"

export type Moment = {
  readonly id: string
  readonly kind: MomentKind
  /** Days after the demo's Monday, and the time ("16:00"); all-day moments have no time. */
  readonly day: number
  readonly time?: string
  readonly minutes: number
  readonly title: string
  readonly detail?: string
  readonly tone: Tone
  readonly href: string
  /** The queue row it belongs to: opening it selects that row on Overzicht. */
  readonly queueId?: string
}

/** The week of 23 November, from yesterday's report to Saturday's payout. */
export const MOMENTS: ReadonlyArray<Moment> = [
  {
    id: "m-week",
    kind: "rapport",
    day: -1,
    time: "20:00",
    minutes: 15,
    title: "Weekrapport 16–22 nov",
    tone: "neutral",
    href: "/v2/analyse/week"
  },
  {
    id: "m-sync",
    kind: "automatisering",
    day: 0,
    time: "07:00",
    minutes: 15,
    title: "Voorraad gelijkgezet met Shopify",
    tone: "neutral",
    href: "/v2/automatiseringen"
  },
  {
    id: "m-digest-0",
    kind: "overzicht",
    day: 0,
    time: "09:00",
    minutes: 15,
    title: "Ochtendoverzicht verstuurd",
    tone: "neutral",
    href: "/v2/start/meldingen"
  },
  {
    id: "m-kestrel-mail",
    kind: "leverancier",
    day: 0,
    time: "10:15",
    minutes: 20,
    title: "Mail aan Kestrel Goods",
    detail: "6 zendingen langer dan 5 dagen onderweg",
    tone: "neutral",
    href: "/v2/leveranciers/kestrel-goods"
  },
  {
    id: "m-inbox",
    kind: "wachtrij",
    day: 0,
    time: "14:30",
    minutes: 30,
    title: "3 tickets wachten langer dan 4 uur",
    tone: "bad",
    href: "/v2/inbox",
    queueId: "inbox"
  },
  {
    id: "m-kestrel-2",
    kind: "wachtrij",
    day: 0,
    time: "15:00",
    minutes: 30,
    title: "Tweede mail aan Kestrel Goods",
    detail: "Kantoor sluit om 16:00",
    tone: "warn",
    href: "/v2",
    queueId: "mail-kestrel"
  },
  {
    id: "m-korting",
    kind: "wachtrij",
    day: 0,
    time: "16:00",
    minutes: 30,
    title: "Kortingscode voor Luca Romano",
    detail: "Bestelling #5309 is 4 dagen te laat",
    tone: "warn",
    href: "/v2",
    queueId: "korting-5146"
  },
  {
    id: "m-dpd",
    kind: "ticket",
    day: 0,
    time: "17:00",
    minutes: 30,
    title: "DPD sluit claims voor Hannah Schmidt",
    detail: "Ticket #5141",
    tone: "bad",
    href: "/v2/inbox/5141",
    queueId: "dpd"
  },
  {
    id: "m-omruil",
    kind: "wachtrij",
    day: 0,
    time: "18:00",
    minutes: 30,
    title: "Omruiling voor Astrid Berg",
    tone: "warn",
    href: "/v2",
    queueId: "omruil-5321"
  },
  {
    id: "m-dagrapport",
    kind: "rapport",
    day: 0,
    time: "18:00",
    minutes: 15,
    title: "Dagrapport naar het team",
    tone: "neutral",
    href: "/v2/analyse/week"
  },
  {
    id: "m-payout-0",
    kind: "uitbetaling",
    day: 0,
    minutes: 0,
    title: "Uitbetaling Shopify Payments · € 18.420",
    tone: "good",
    href: "/v2/data"
  },
  {
    id: "m-digest-1",
    kind: "overzicht",
    day: 1,
    time: "09:00",
    minutes: 15,
    title: "Ochtendoverzicht",
    tone: "neutral",
    href: "/v2/start/meldingen"
  },
  {
    id: "m-allure",
    kind: "afspraak",
    day: 1,
    time: "10:00",
    minutes: 30,
    title: "Gesprek met Allure Fulfillment",
    detail: "De maattabel van de Aurora",
    tone: "accent",
    href: "/v2/leveranciers/allure-fulfillment"
  },
  {
    id: "m-cb2291",
    kind: "chargeback",
    day: 1,
    time: "12:00",
    minutes: 30,
    title: "Bewijs voor CB-2291 bij Klarna",
    detail: "€ 129,00 · bewijspakket staat klaar",
    tone: "bad",
    href: "/v2/chargebacks/cb-2291",
    queueId: "cb-2291"
  },
  {
    id: "m-dpc",
    kind: "leverancier",
    day: 1,
    time: "14:00",
    minutes: 15,
    title: "DPC Apparel draagt over aan PostNL",
    tone: "neutral",
    href: "/v2/leveranciers/dpc-apparel"
  },
  {
    id: "m-digest-2",
    kind: "overzicht",
    day: 2,
    time: "09:00",
    minutes: 15,
    title: "Ochtendoverzicht",
    tone: "neutral",
    href: "/v2/start/meldingen"
  },
  {
    id: "m-cb2302",
    kind: "chargeback",
    day: 2,
    time: "11:00",
    minutes: 30,
    title: "Verweer voor de PayPal-chargeback",
    tone: "warn",
    href: "/v2/chargebacks"
  },
  {
    id: "m-kestrel-dhl",
    kind: "leverancier",
    day: 2,
    time: "15:00",
    minutes: 15,
    title: "Kestrel Goods draagt over aan DHL",
    tone: "neutral",
    href: "/v2/leveranciers/kestrel-goods"
  },
  {
    id: "m-digest-3",
    kind: "overzicht",
    day: 3,
    time: "09:00",
    minutes: 15,
    title: "Ochtendoverzicht",
    tone: "neutral",
    href: "/v2/start/meldingen"
  },
  {
    id: "m-bf-mail",
    kind: "automatisering",
    day: 3,
    time: "20:00",
    minutes: 15,
    title: "Black Friday-mail via Klaviyo",
    detail: "Naar 18.240 abonnees",
    tone: "neutral",
    href: "/v2/automatiseringen"
  },
  {
    id: "m-bf",
    kind: "taak",
    day: 4,
    minutes: 0,
    title: "Black Friday: kortingen staan aan",
    tone: "accent",
    href: "/v2/producten"
  },
  {
    id: "m-digest-4",
    kind: "overzicht",
    day: 4,
    time: "09:00",
    minutes: 15,
    title: "Ochtendoverzicht",
    tone: "neutral",
    href: "/v2/start/meldingen"
  },
  {
    id: "m-payout-5",
    kind: "uitbetaling",
    day: 5,
    minutes: 0,
    title: "Uitbetaling Klarna · € 4.910",
    tone: "good",
    href: "/v2/data"
  }
]

/* ── where a figure comes from: the KPI breakdown ─────────────────────────────────────────────── */

/** Today's first replies, the median per channel and per person; the figure is the median of all 41. */
export const FIRST_REPLY = {
  replies: 41,
  byChannel: [
    { label: "Winkelchat", value: 2 },
    { label: "WhatsApp", value: 6 },
    { label: "Instagram", value: 9 },
    { label: "E-mail", value: 14 }
  ],
  byPerson: [
    { label: "Waar is mijn bestelling", value: 1, count: 17 },
    { label: "Sofía Kim", value: 8, count: 12 },
    { label: "Ethan Jeppesen", value: 13, count: 9 },
    { label: "Elena Hart", value: 22, count: 3 }
  ]
} as const

/**
 * What a refresh brings in: the orders placed since the page opened, one per refresh, excl. btw
 * (as Omzet counts). Today's figures on Start grow by them; the breakdown names them.
 */
export const ARRIVALS: ReadonlyArray<{ readonly amount: number; readonly what: string; readonly from: string }> = [
  { amount: 65, what: "Aurora Hooded Fleece", from: "Haarlem" },
  { amount: 40, what: "Drift Crewneck", from: "Amsterdam" },
  { amount: 98, what: "Harbor Raincoat", from: "Rotterdam" },
  { amount: 32, what: "Sailor Stripe Tee", from: "Gent" }
]

/* ── the board's other cards, where no area keeps the figure ──────────────────────────────────── */

/** The records you opened last (the board's "Recent"). */
export const RECENT: ReadonlyArray<
  { readonly label: string; readonly kind: string; readonly at: string; readonly href: string }
> = [
  { label: "Ticket #5141", kind: "Pakket kwijt bij DPD", at: "14:21", href: "/v2/inbox/5141" },
  { label: "Kestrel Goods", kind: "Leverancier", at: "13:58", href: "/v2/leveranciers/kestrel-goods" },
  { label: "Aurora Hooded Fleece", kind: "Product", at: "12:40", href: "/v2/producten/aurora-hooded-fleece" },
  { label: "CB-2291", kind: "Chargeback", at: "11:05", href: "/v2/chargebacks/cb-2291" },
  { label: "Bestelling #5309", kind: "Bestelling", at: "10:47", href: "/v2/bestellingen/5309" }
]

/** What you pinned (the board's "Bladwijzers"). */
export const BOOKMARKS: ReadonlyArray<{ readonly label: string; readonly detail: string; readonly href: string }> = [
  {
    label: "Vertraagde bestellingen",
    detail: "Bestellingen · opgeslagen weergave",
    href: "/v2/bestellingen?status=vertraagd"
  },
  { label: "Week 16–22 nov", detail: "Analyse · bord", href: "/v2/analyse/week" },
  { label: "Allure Fulfillment", detail: "Leverancier", href: "/v2/leveranciers/allure-fulfillment" },
  { label: "Retourbeleid", detail: "Instellingen", href: "/v2/instellingen/retouren" }
]

/** Orders this week by country, Monday 16 to today (the board's "Bestellingen per land"). */
export const ORDERS_BY_COUNTRY: ReadonlyArray<{ readonly label: string; readonly value: number }> = [
  { label: "Nederland", value: 612 },
  { label: "België", value: 388 },
  { label: "Duitsland", value: 142 },
  { label: "Frankrijk", value: 61 },
  { label: "Verenigde Staten", value: 87 }
]

/** The customer agent on the store chat today (the board's "Klantagent vandaag"). */
export const CUSTOMER_AGENT_TODAY = { chats: 23, settled: 17, handedOver: 6, minutesSaved: 85 } as const
