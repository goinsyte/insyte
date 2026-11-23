import { CreditCard, Factory, MessageCircle, MessageSquare, Package, Returns, Star, Truck } from "../ui/icons.tsx"
import { ACTIVITY } from "./agents.ts"
import type { Activity, Autonomy, Glyph } from "./agents.ts"
import { OPEN_STORE_CHATS } from "./live.ts"
import { CUSTOMERS, ORDERS } from "./records.ts"

/**
 * Magnus's own pages: what the log knows beyond Start's line (what each action read, what started it,
 * what it changed and whether it can still be taken back), what the scheduled runs are about, and the
 * gallery of agents to start from. Built on `fixtures/agents.ts` (the agents, ACTIVITY, SCHEDULED) and
 * the shared records, so a count here is the same count elsewhere.
 */

/* ── the log ───────────────────────────────────────────────────────────────────────────────────── */

/**
 * Where an action stands. `gedaan`: done. `wacht`: it prepared something a person still decides
 * (Eerst vragen). `ongedaan`: a person took it back. `mislukt`: it tried and the other side refused.
 */
export type LogStatus = "gedaan" | "wacht" | "ongedaan" | "mislukt"

export const LOG_STATUS: Readonly<Record<LogStatus, string>> = {
  gedaan: "Gedaan",
  wacht: "Wacht op jou",
  ongedaan: "Ongedaan gemaakt",
  mislukt: "Mislukt"
}

/**
 * One line of the log, in full. `undo`: "kan" can still be taken back in Insyte; "verstuurd" reached
 * someone outside and cannot; absent, nothing changed that could be reversed.
 */
export type LogLine = Activity & {
  readonly status: LogStatus
  /** What started it: a ticket coming in, a schedule, a person. */
  readonly trigger: string
  /** What it read before it acted: the sources of the action. */
  readonly read: ReadonlyArray<string>
  /** What it changed, as before and after, when it changed a field. */
  readonly change?: { readonly field: string; readonly before: string; readonly after: string }
  readonly undo?: "kan" | "verstuurd"
  /** Where the record lives. */
  readonly href: string
  /** Who took it back, or why it failed. */
  readonly after?: string
}

type Detail = Omit<LogLine, keyof Activity>

const DETAILS: Readonly<Record<string, Detail>> = {
  "act-5148": {
    status: "gedaan",
    trigger: "Astrid Berg vroeg in ticket #5148 waar haar pakket is",
    read: ["Ticket #5148", "Track & trace van DHL", "Verzendbeleid"],
    undo: "verstuurd",
    href: "/v2/inbox/5148"
  },
  "act-5141": {
    status: "gedaan",
    trigger: "DPD meldde pakket #5263 als zoek",
    read: ["Ticket #5141", "Bestelling #5263 · DPD-status", "Wie er vandaag in de inbox werkt"],
    change: { field: "Toegewezen aan", before: "Niemand", after: "Sofía Kim" },
    undo: "kan",
    href: "/v2/inbox/5141"
  },
  "act-cb": {
    status: "wacht",
    trigger: "Klarna opende geschil CB-2291 over bestelling #5318",
    read: ["Bestelling #5318", "Klarna-geschil CB-2291", "Track & trace van PostNL", "Retourbeleid"],
    href: "/v2/chargebacks/cb-2291"
  },
  "act-week": {
    status: "gedaan",
    trigger: "Elke maandag om 08:00",
    read: ["1.204 bestellingen", "318 tickets", "41 terugbetalingen"],
    change: { field: "Bord Weekoverzicht", before: "Week 9–15 nov", after: "Week 16–22 nov" },
    undo: "kan",
    href: "/v2/analyse/week"
  },
  "act-stock": {
    status: "gedaan",
    trigger: "Elke nacht om 02:00",
    read: ["Voorraad Coastline Bomber Jacket", "Verkoop van de afgelopen 14 dagen"],
    undo: "kan",
    href: "/v2/producten/coastline-bomber-jacket"
  },
  "act-label": {
    status: "gedaan",
    trigger: "Astrid Berg vroeg een retour aan voor bestelling #5296",
    read: ["Retour #R-879", "Bestelling #5296", "Retourbeleid"],
    undo: "verstuurd",
    href: "/v2/bestellingen/5296"
  }
}

/** Two lines the log has that Start leaves out: one a person took back, one that failed. */
const MORE: ReadonlyArray<LogLine> = [
  {
    id: "act-label-5139",
    at: "12:40",
    agentId: "waar-is-mijn-bestelling",
    text: "Label ‘Levering’ toegevoegd aan ticket #5139",
    record: "Ticket #5139",
    setting: "zelf",
    rule: "label toevoegen",
    status: "ongedaan",
    trigger: "Nieuw ticket van Maria Garcia",
    read: ["Ticket #5139"],
    change: { field: "Labels", before: "Geen", after: "Levering" },
    href: "/v2/inbox/5139",
    after: "Sofía Kim maakte het om 12:44 ongedaan: het ging om een retour."
  },
  {
    id: "act-note-5288",
    at: "10:22",
    agentId: "leveranciers",
    text: "Notitie bij bestelling #5288 niet geplaatst",
    record: "Bestelling #5288",
    setting: "zelf",
    rule: "interne notitie toevoegen",
    status: "mislukt",
    trigger: "DPC Apparel meldde een nieuwe verzenddatum",
    read: ["Mail van DPC Apparel", "Bestelling #5288"],
    href: "/v2/bestellingen/5288",
    after: "Shopify antwoordde niet binnen 30 seconden. Er is niets veranderd."
  }
]

const night = (line: { readonly at: string }) => line.at.startsWith("vannacht")
const byTime = (a: { readonly at: string }, b: { readonly at: string }) =>
  Number(night(a)) - Number(night(b)) || b.at.replace("vannacht ", "").localeCompare(a.at.replace("vannacht ", ""))

/** Everything the agents did, newest first: Start's ACTIVITY in full, and the two lines it leaves out. */
export const LOG: ReadonlyArray<LogLine> = [
  ...ACTIVITY.map((line): LogLine => ({
    ...line,
    ...(DETAILS[line.id] ?? { status: "gedaan", trigger: "—", read: [], href: "/v2/magnus/logboek" })
  })),
  ...MORE
].toSorted(byTime)

/** Today's tally for the log's head: done, taken back, failed. */
export const logTally = (lines: ReadonlyArray<LogLine>) => ({
  total: lines.length,
  undone: lines.filter((l) => l.status === "ongedaan").length,
  failed: lines.filter((l) => l.status === "mislukt").length
})

export const SETTING_LABEL: Readonly<Record<Autonomy, string>> = {
  zelf: "Zelf doen",
  vragen: "Eerst vragen",
  nooit: "Nooit"
}

/* ── the scheduled runs ────────────────────────────────────────────────────────────────────────── */

/** What each scheduled run will look at and what it may do, by SCHEDULED id. */
export const SCHEDULE_DETAIL: Readonly<
  Record<string, { readonly kind: "eenmalig" | "terugkerend"; readonly next: string; readonly does: string }>
> = {
  "plan-kestrel": {
    kind: "eenmalig",
    next: "vandaag 16:30",
    does: "Leest of Kestrel Goods antwoordde op de tweede mail; zo niet, legt hij een derde mail aan je voor."
  },
  "plan-stock": {
    kind: "terugkerend",
    next: "morgen 02:00",
    does: "Loopt de voorraad van de twintig bestsellers na en waarschuwt het team onder de tien stuks."
  },
  "plan-week": {
    kind: "terugkerend",
    next: "maandag 30 nov 08:00",
    does: "Zet de afgelopen week op het bord Weekoverzicht en schrijft erbij wat er veranderde."
  },
  "plan-reviews": {
    kind: "terugkerend",
    next: "gepauzeerd sinds 20 nov",
    does: "Beantwoordt nieuwe productreviews in de Northwind-toon; wat negatief is, legt hij eerst voor."
  }
}

/* ── the gallery ───────────────────────────────────────────────────────────────────────────────── */

export type GalleryGroup = "klanten" | "bestellingen" | "producten" | "geld"

export const GALLERY_GROUPS: ReadonlyArray<{ readonly value: GalleryGroup | "alle"; readonly label: string }> = [
  { value: "alle", label: "Alle" },
  { value: "klanten", label: "Klanten" },
  { value: "bestellingen", label: "Bestellingen" },
  { value: "producten", label: "Producten" },
  { value: "geld", label: "Geld" }
]

export type AgentTemplate = {
  readonly id: string
  readonly name: string
  readonly purpose: string
  readonly glyph: Glyph
  readonly group: GalleryGroup
  /** What starts it. */
  readonly trigger: string
  /** The rules it arrives with: what it does alone, what it asks first, what never. */
  readonly zelf: ReadonlyArray<string>
  readonly vragen: ReadonlyArray<string>
  readonly nooit: ReadonlyArray<string>
  /** What the workspace's own records say it would have to do now. */
  readonly evidence?: string
  /** The agent the workspace already runs from this template. */
  readonly agentId?: string
}

const late = ORDERS.filter((o) => o.status === "vertraagd").length
const onTheWay = ORDERS.filter((o) => o.status === "verzonden").length
const vips = CUSTOMERS.filter((c) => c.duplicateOf === undefined && c.lifetimeValue > 1000).length
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("nl-NL")} ${n === 1 ? one : many}`

export const GALLERY: ReadonlyArray<AgentTemplate> = [
  {
    id: "klantagent",
    name: "Klantagent voor de winkelchat",
    purpose: "Beantwoordt shoppers op de winkelchat zelf, uit je kennisbank, binnen je openingstijden.",
    glyph: MessageCircle,
    group: "klanten",
    trigger: "Een nieuwe winkelchat",
    zelf: ["Antwoorden op de winkelchat, ma–vr 9–18"],
    vragen: ["Antwoorden per e-mail"],
    nooit: ["Terugbetalen of annuleren"],
    evidence: `${plural(OPEN_STORE_CHATS.length, "winkelchat staat", "winkelchats staan")} nu open.`
  },
  {
    id: "vertraagd",
    name: "Vertraagde bestellingen melden",
    purpose: "Ziet een bestelling vastlopen en schrijft de klant voordat die erom vraagt.",
    glyph: Truck,
    group: "bestellingen",
    trigger: "Een bestelling staat 2 dagen na de belofte nog niet bezorgd",
    zelf: ["Label ‘Vertraagd’ toevoegen", "Interne notitie schrijven"],
    vragen: ["De klant mailen"],
    nooit: ["Korting geven"],
    evidence: `${plural(late, "bestelling staat", "bestellingen staan")} nu op Vertraagd.`
  },
  {
    id: "verzonden",
    name: "Verzendbevestiging met track & trace",
    purpose: "Mailt de klant zodra een bestelling onderweg is, met de link van de vervoerder.",
    glyph: Package,
    group: "bestellingen",
    trigger: "De leverancier meldt een bestelling als verzonden",
    zelf: [],
    vragen: ["De klant mailen, tot je de tekst vertrouwt"],
    nooit: ["Een bezorgdatum beloven die de vervoerder niet geeft"],
    evidence: `${plural(onTheWay, "bestelling is", "bestellingen zijn")} nu onderweg.`
  },
  {
    id: "vip",
    name: "Vaste klanten herkennen",
    purpose: "Labelt klanten die meer dan € 1.000 uitgaven en zet hun tickets bovenaan bij de CX-lead.",
    glyph: Star,
    group: "klanten",
    trigger: "Een nieuw ticket of een nieuwe bestelling",
    zelf: ["Label ‘VIP’ toevoegen", "Ticket toewijzen aan de CX-lead"],
    vragen: [],
    nooit: ["De klant iets sturen"],
    evidence: `${plural(vips, "klant gaf", "klanten gaven")} meer dan € 1.000 uit.`
  },
  {
    id: "waar-is-mijn-bestelling",
    name: "Waar is mijn bestelling",
    purpose: "Beantwoordt vragen over track & trace in de inbox.",
    glyph: Truck,
    group: "klanten",
    trigger: "Een klant vraagt waar de bestelling is",
    zelf: ["Ticket toewijzen aan het team"],
    vragen: ["Een track & trace-antwoord sturen", "Een kortingscode van 10% geven"],
    nooit: ["Terugbetalen of annuleren"],
    agentId: "waar-is-mijn-bestelling"
  },
  {
    id: "retouren",
    name: "Retouren afhandelen",
    purpose: "Beoordeelt retourvragen tegen je beleid, maakt het label en stelt een omruiling voor.",
    glyph: Returns,
    group: "klanten",
    trigger: "Een klant vraagt een retour aan",
    zelf: ["Retourlabel maken"],
    vragen: ["Een omruiling aanbieden", "Een retour goedkeuren"],
    nooit: ["Terugbetalen"],
    agentId: "retouragent"
  },
  {
    id: "leveranciers",
    name: "Leveranciers aansporen",
    purpose: "Mailt een leverancier als zendingen langer onderweg zijn dan beloofd.",
    glyph: Factory,
    group: "bestellingen",
    trigger: "Een zending is langer onderweg dan de levertijd van de leverancier",
    zelf: ["Bestellingen labelen"],
    vragen: ["De leverancier mailen"],
    nooit: ["Een bestelling annuleren"],
    agentId: "leveranciers"
  },
  {
    id: "voorraad",
    name: "Lage voorraad bewaken",
    purpose: "Waarschuwt het team als een bestseller bijna op is.",
    glyph: Package,
    group: "producten",
    trigger: "Elke nacht om 02:00",
    zelf: ["Het team waarschuwen"],
    vragen: ["Bijbestellen bij de leverancier"],
    nooit: ["Een product offline halen"],
    agentId: "voorraad"
  },
  {
    id: "reviews",
    name: "Productreviews beantwoorden",
    purpose: "Beantwoordt reviews in de Northwind-toon; een negatieve legt hij eerst voor.",
    glyph: MessageSquare,
    group: "producten",
    trigger: "Een nieuwe productreview",
    zelf: ["Een positieve review beantwoorden"],
    vragen: ["Een negatieve review beantwoorden"],
    nooit: ["Korting beloven"],
    agentId: "reviews"
  },
  {
    id: "chargebacks",
    name: "Chargeback-bewijs verzamelen",
    purpose: "Stelt het bewijspakket op uit bestelling, track & trace en gesprekken.",
    glyph: CreditCard,
    group: "geld",
    trigger: "Klarna, Stripe of PayPal opent een geschil",
    zelf: ["Het bewijspakket opstellen"],
    vragen: [],
    nooit: ["Bewijs indienen zonder jou: dat kan niet terug"],
    agentId: "chargebacks"
  }
]
