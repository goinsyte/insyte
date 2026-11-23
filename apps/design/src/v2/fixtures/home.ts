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
