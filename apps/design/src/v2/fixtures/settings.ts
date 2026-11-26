import { ASSISTANT } from "../assistant.ts"
import { paths } from "../router.tsx"
import type { Presence } from "../ui/avatar.tsx"
import type { Tone } from "../ui/badge.tsx"
import { LEVELS, ROLLEN } from "../view.ts"
import type { Level, PermArea, Rol, Staat } from "../view.ts"
import { openTicketsOf, TICKET_STATUS } from "./inbox.ts"
import { customer } from "./records.ts"
import { DEMO_NOW, PEOPLE, STORES } from "./workspace.ts"

/*
 * Instellingen's demo data: the same Northwind workspace as the rest of `/v2`, at Monday 23 November
 * 2026, 14:30. Rebuilt from the current demo's settings fixtures (`src/app/fixtures/mock-data/
 * members.ts`, `settings-depth.ts`, `autonomy.ts`, `customer-agent.ts`, `knowledge.ts`, `stores.ts`
 * and the screens' own seeds in `packages/ui/src/app/lib`), with their copy and fictional names, dates
 * moved to this clock and money in euros. Most lists have a first-day form (`leeg`) and a busy one
 * (`druk`); a list reads them through `byStaat`.
 */

const MIN = 60_000
const H = 60 * MIN
const D = 24 * H
const NOW = DEMO_NOW.date.getTime()
/** A moment before "now" in the demo, never the real clock. */
export const ago = (ms: number) => new Date(NOW - ms)
export const ahead = (ms: number) => new Date(NOW + ms)

const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"]
const MONTHS_LONG = [
  "januari",
  "februari",
  "maart",
  "april",
  "mei",
  "juni",
  "juli",
  "augustus",
  "september",
  "oktober",
  "november",
  "december"
]
const pad = (n: number) => String(n).padStart(2, "0")

/** "14:12", "gisteren 18:40", "20 nov 09:00", "2 okt 2025". */
export function stamp(at: Date, withTime = true): string {
  const today = new Date(2026, 10, 23).getTime()
  const day = new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime()
  const diff = Math.round((today - day) / D)
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`
  if (diff === 0) return withTime ? `vandaag ${time}` : "vandaag"
  if (diff === 1) return withTime ? `gisteren ${time}` : "gisteren"
  if (diff === -1) return withTime ? `morgen ${time}` : "morgen"
  const year = at.getFullYear() === 2026 ? "" : ` ${at.getFullYear()}`
  return `${at.getDate()} ${MONTHS[at.getMonth()]}${year}${withTime && year === "" ? ` ${time}` : ""}`
}

/** "14 december 2026". */
export const longDate = (at: Date) => `${at.getDate()} ${MONTHS_LONG[at.getMonth()]} ${at.getFullYear()}`

/** "12 min geleden", "3 uur geleden", "2 dagen geleden", or a date. */
export function relative(at: Date): string {
  const min = Math.round((NOW - at.getTime()) / MIN)
  if (min < 1) return "zojuist"
  if (min < 60) return `${min} min geleden`
  const hours = Math.round(min / 60)
  if (hours < 24) return `${hours} uur geleden`
  const days = Math.round(hours / 24)
  if (days < 8) return days === 1 ? "gisteren" : `${days} dagen geleden`
  return stamp(at, false)
}

/** A list in its first-day, normal and busy form. */
export function byStaat<T>(staat: Staat, forms: { readonly gewoon: T; readonly leeg?: T; readonly druk?: T }): T {
  if (staat === "leeg" && forms.leeg !== undefined) return forms.leeg
  if (staat === "druk" && forms.druk !== undefined) return forms.druk
  return forms.gewoon
}

/** The long names the busy week brings, as the current demo's `longName`. */
const LONG_NAMES = [
  "Annemarie van der Heijden-Oosterhout",
  "Maximiliaan Vandenbroucke",
  "Charlotte Rasmussen-Lindqvist",
  "Jean-Baptiste Delacroix-Moreau",
  "Wilhelmina Koopmans-Bakker"
]

/* ── the workspace ─────────────────────────────────────────────────────────────────────────────── */

export const ACCOUNT = {
  workspace: "Northwind Clothing Co.",
  legalEntity: "Northwind Clothing B.V.",
  vat: "NL862922088B01",
  billingEmail: "finance@northwind.co",
  country: "Nederland"
}

export const COUNTRIES = ["Nederland", "België", "Duitsland", "Frankrijk", "Verenigd Koninkrijk", "Verenigde Staten"]

/** When Insyte warns: an order not shipped after so many hours, a chargeback from this amount. */
export const ALERTS = { delayHours: 48, disputeAmount: 250 }

export const RETENTION_CHOICES = [
  { days: 30, detail: "Genoeg om de laatste terugbetalingen en retouren af te ronden." },
  { days: 90, detail: "Dekt de meeste termijnen voor kaartgeschillen. De standaard." },
  { days: 180, detail: "Dekt de langste chargeback-termijnen die kaartnetwerken toestaan." }
] as const

/* ── the team ──────────────────────────────────────────────────────────────────────────────────── */

export type TicketRef = {
  readonly id: string
  readonly title: string
  readonly customer: string
  readonly note: string
  readonly tone: Tone
}

export type Member = {
  readonly id: string
  readonly name: string
  readonly email: string
  /** The role's id: a system role (`view.ts`) or one of `CUSTOM_ROLES`. */
  readonly roleId: string
  readonly presence: Presence
  /** What the person is doing now, as Start's team list says it. */
  readonly doing: string
  readonly stores: "all" | ReadonlyArray<string>
  readonly invitedBy?: string
  readonly joined: Date
  readonly lastSeen: Date
  /** What they work on: the area, and the place it lives. */
  readonly focus: { readonly label: string; readonly href: string; readonly detail: string }
  /** Their open tickets, by the story's ticket ids. */
  readonly tickets: ReadonlyArray<TicketRef>
  readonly deactivated?: boolean
}

/** What a teammate page says beside a ticket of the story; any other ticket shows its status. */
const TICKET_NOTES: Readonly<Record<string, { readonly note: string; readonly tone: Tone }>> = {
  "5141": { note: "DPD sluit claims om 17:00", tone: "bad" },
  "5142": { note: "Terugbetaling buiten het beleid, wacht op Elena", tone: "warn" },
  "5148": { note: "Ruil naar M wacht op goedkeuring", tone: "neutral" }
}

/** A teammate's open tickets, as Inbox has them assigned (by the PEOPLE key). */
function ticketsOf(person: keyof typeof PEOPLE): ReadonlyArray<TicketRef> {
  return openTicketsOf()
    .filter((t) => t.assignee === person)
    .map((t) => ({
      id: t.number,
      title: t.subject,
      customer: customer(t.customerId)?.name ?? t.handle,
      note: TICKET_NOTES[t.number]?.note ?? TICKET_STATUS[t.status].label,
      tone: TICKET_NOTES[t.number]?.tone ?? "neutral"
    }))
}

const SEED_MEMBERS: ReadonlyArray<Member> = [
  {
    id: PEOPLE.elena.id,
    name: PEOPLE.elena.name,
    email: "elena@northwindclothing.co",
    roleId: "eigenaar",
    presence: PEOPLE.elena.presence,
    doing: "schrijft een document",
    stores: "all",
    joined: new Date(2024, 7, 12),
    lastSeen: ago(2 * MIN),
    focus: {
      label: "Chargebacks en goedkeuringen",
      href: paths.chargeback("CB-2291"),
      detail: "CB-2291 moet morgen 12:00 beantwoord"
    },
    tickets: ticketsOf("elena")
  },
  {
    id: PEOPLE.sofia.id,
    name: PEOPLE.sofia.name,
    email: "sofia@northwindclothing.co",
    roleId: "cx-lead",
    presence: PEOPLE.sofia.presence,
    doing: "beantwoordt ticket #5142",
    stores: "all",
    invitedBy: PEOPLE.elena.id,
    joined: new Date(2024, 8, 2),
    lastSeen: ago(4 * MIN),
    focus: {
      label: "De inbox",
      href: paths.inbox,
      detail: "Neemt de inbox; wijzigde op 20 nov de maattabel van de Aurora"
    },
    tickets: ticketsOf("sofia")
  },
  {
    id: PEOPLE.ethan.id,
    name: PEOPLE.ethan.name,
    email: "ethan@northwindclothing.co",
    roleId: "operations",
    presence: PEOPLE.ethan.presence,
    doing: "in de bestellingenwachtrij",
    stores: ["store_us", "store_eu"],
    invitedBy: PEOPLE.elena.id,
    joined: new Date(2024, 9, 14),
    lastSeen: ago(6 * MIN),
    focus: {
      label: "Bestellingen en Kestrel Goods",
      href: paths.supplier("kestrel-goods"),
      detail: "6 bestellingen langer dan 5 dagen onderweg; tweede mail staat klaar"
    },
    tickets: ticketsOf("ethan")
  },
  {
    id: PEOPLE.liam.id,
    name: PEOPLE.liam.name,
    email: "liam@northwindclothing.co",
    roleId: "operations",
    presence: PEOPLE.liam.presence,
    doing: "18 min geleden actief",
    stores: "all",
    invitedBy: PEOPLE.ethan.id,
    joined: new Date(2025, 0, 20),
    lastSeen: ago(18 * MIN),
    focus: {
      label: "Koppelingen en Meta Ads",
      href: paths.settings("koppelingen"),
      detail: "Koppelde Meta Ads op 19 nov"
    },
    tickets: []
  },
  {
    id: PEOPLE.maya.id,
    name: PEOPLE.maya.name,
    email: "maya@northwindclothing.co",
    roleId: "marketing",
    presence: PEOPLE.maya.presence,
    doing: "gisteren voor het laatst gezien",
    stores: ["store_eu"],
    invitedBy: PEOPLE.sofia.id,
    joined: new Date(2025, 3, 7),
    lastSeen: ago(20 * H),
    focus: {
      label: "Kennisbank: Maten en Over de producten",
      href: paths.settings("ai/kennisbank/kb_sizes"),
      detail: "Schreef de laatste versie van Maten op 14 nov"
    },
    tickets: ticketsOf("maya")
  }
]

const BUSY_ROLES = ["klantenservice", "klantenservice", "financien", "operations", "marketing"]

export const MEMBERS: ReadonlyArray<Member> = SEED_MEMBERS

export function membersFor(staat: Staat): ReadonlyArray<Member> {
  return byStaat(staat, {
    gewoon: SEED_MEMBERS,
    leeg: SEED_MEMBERS.slice(0, 1),
    druk: [
      ...SEED_MEMBERS,
      ...LONG_NAMES.map((name, i): Member => ({
        id: `busy-${i}`,
        name,
        email: `${name.toLowerCase().split(" ")[0]}.${i + 20}@northwindclothing-international.co`,
        roleId: BUSY_ROLES[i] ?? "alleen-lezen",
        presence: i % 2 === 0 ? "online" : "offline",
        doing: `${(i + 1) * 40} min geleden actief`,
        stores: i % 2 === 0 ? "all" : ["store_eu"],
        invitedBy: PEOPLE.sofia.id,
        joined: ago((40 + i * 9) * D),
        lastSeen: ago((i + 1) * 40 * MIN),
        focus: { label: "De inbox", href: paths.inbox, detail: "Tickets van de nachtploeg" },
        tickets: []
      }))
    ]
  })
}

export const member = (id: string) => SEED_MEMBERS.find((m) => m.id === id)

export type Invite = {
  readonly id: string
  readonly email: string
  readonly roleId: string
  readonly stores: "all" | ReadonlyArray<string>
  readonly invitedBy: string
  readonly sent: Date
  readonly expires: Date
  readonly message?: string
}

const SEED_INVITES: ReadonlyArray<Invite> = [
  {
    id: "inv_amber",
    email: "amber@northwindclothing.co",
    roleId: "klantenservice",
    stores: ["store_us", "store_eu"],
    invitedBy: PEOPLE.sofia.id,
    sent: ago(2 * D),
    expires: ahead(5 * D),
    message: "Begin met de tickets die aan jou zijn toegewezen, Sofía loopt de eerste week met je mee."
  },
  {
    id: "inv_jonas",
    email: "jonas.vermeulen@northwindclothing.co",
    roleId: "financien",
    stores: "all",
    invitedBy: PEOPLE.elena.id,
    sent: ago(10 * D),
    expires: ago(3 * D)
  }
]

export function invitesFor(staat: Staat): ReadonlyArray<Invite> {
  return byStaat(staat, {
    gewoon: SEED_INVITES,
    leeg: [],
    druk: [
      ...SEED_INVITES,
      ...LONG_NAMES.slice(0, 4).map((name, i): Invite => ({
        id: `inv_busy_${i}`,
        email: `${name.toLowerCase().replaceAll(" ", ".")}@northwindclothing-international.co`,
        roleId: ["klantenservice", "alleen-lezen", "financien", "beheerder"][i] ?? "alleen-lezen",
        stores: i % 2 === 0 ? "all" : ["store_eu"],
        invitedBy: PEOPLE.elena.id,
        sent: ago((i + 1) * D),
        expires: i === 0 ? ahead(6 * D) : ago(i * D)
      }))
    ]
  })
}

/** Seats on the plan: Scale has twelve. */
export const SEATS = { included: 12, extra: 0 }

export const INVITE_LINK = { token: "nw7k2q9d", roleId: "alleen-lezen", days: 7, joined: 1 }
export const LINK_DAYS = [
  { value: "1", label: "1 dag" },
  { value: "7", label: "7 dagen" },
  { value: "30", label: "30 dagen" }
] as const

/* ── roles ─────────────────────────────────────────────────────────────────────────────────────── */

export type SpecialId =
  | "refunds.write"
  | "disputes.write"
  | "data.export"
  | "customers.merge"
  | "automations.publish"
  | "billing.invoices"
  | "returns.approve"
  | "quality.approve"
  | "products.phase"
  | "ai.autonomy"
  | "costs.write"

export const SPECIALS: ReadonlyArray<{
  readonly id: SpecialId
  readonly label: string
  readonly detail: string
  readonly needs: { readonly area: PermArea; readonly level: Level }
}> = [
  {
    id: "refunds.write",
    label: "Terugbetalen",
    detail: "Geld teruggeven op een bestelling, tot het bedrag hieronder.",
    needs: { area: "orders", level: 2 }
  },
  {
    id: "disputes.write",
    label: "Chargeback-bewijs indienen",
    detail: "Een bewijspakket naar Stripe, Klarna of PayPal sturen. Dat kan niet terug.",
    needs: { area: "chargebacks", level: 2 }
  },
  {
    id: "data.export",
    label: "Exporteren",
    detail: "Bestellingen, klanten en producten als CSV downloaden.",
    needs: { area: "data", level: 1 }
  },
  {
    id: "customers.merge",
    label: "Klanten samenvoegen",
    detail: "Dubbele profielen tot één klant maken, met hun bestellingen en tickets.",
    needs: { area: "customers", level: 2 }
  },
  {
    id: "automations.publish",
    label: "Automatiseringen publiceren",
    detail: "Een flow live zetten, zodat hij uit naam van de werkruimte handelt.",
    needs: { area: "automations", level: 2 }
  },
  {
    id: "billing.invoices",
    label: "Facturen bekijken",
    detail: "Facturen van Insyte openen en downloaden.",
    needs: { area: "billing", level: 1 }
  },
  {
    id: "returns.approve",
    label: "Retouren goedkeuren",
    detail: "Een retour of claim goedkeuren of afwijzen. Terugbetalen blijft aan de terugbetaallimiet gebonden.",
    needs: { area: "returns", level: 2 }
  },
  {
    id: "quality.approve",
    label: "Kwaliteit goedkeuren",
    detail: "Een kwaliteitscontrole van een leverancier goedkeuren of afkeuren.",
    needs: { area: "products", level: 2 }
  },
  {
    id: "products.phase",
    label: "Productfase wijzigen",
    detail: "Een product op Test, Actief, Onder toezicht of Uitgefaseerd zetten.",
    needs: { area: "products", level: 2 }
  },
  {
    id: "ai.autonomy",
    label: `Zelfstandigheid van ${ASSISTANT} instellen`,
    detail: `Bepalen wat ${ASSISTANT} zelf mag doen, wat hij eerst vraagt, en het AI-budget.`,
    needs: { area: "settings", level: 3 }
  },
  {
    id: "costs.write",
    label: "Kosten bewerken",
    detail: "Kostenposten toevoegen, wijzigen en verwijderen, en bedragen per maand typen.",
    needs: { area: "analytics", level: 1 }
  }
]

const ALL_SPECIALS = SPECIALS.map((s) => s.id)

export type RoleDef = {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly system: boolean
  /** A custom role starts from a system role, and says how it differs. */
  readonly basedOn?: Rol
  readonly levels: Readonly<Record<PermArea, Level>>
  readonly specials: ReadonlyArray<SpecialId>
  /** The most one refund may be, in euros; `null` is no limit. */
  readonly refundLimit: number | null
  readonly stores: "all" | ReadonlyArray<string>
}

const SYSTEM_SPECIALS: Readonly<Record<Rol, { specials: ReadonlyArray<SpecialId>; refundLimit: number | null }>> = {
  eigenaar: { specials: ALL_SPECIALS, refundLimit: null },
  beheerder: { specials: ALL_SPECIALS, refundLimit: null },
  klantenservice: { specials: ["refunds.write", "disputes.write", "returns.approve"], refundLimit: 100 },
  financien: {
    specials: ["refunds.write", "disputes.write", "data.export", "billing.invoices", "costs.write"],
    refundLimit: null
  },
  "alleen-lezen": { specials: [], refundLimit: null }
}

export const SYSTEM_ROLES: ReadonlyArray<RoleDef> = ROLLEN.map((r) => ({
  id: r.id,
  label: r.label,
  description: r.detail,
  system: true,
  levels: LEVELS[r.id],
  specials: SYSTEM_SPECIALS[r.id].specials,
  refundLimit: SYSTEM_SPECIALS[r.id].refundLimit,
  stores: "all"
}))

const levels = (partial: Partial<Record<PermArea, Level>>): Record<PermArea, Level> => ({
  ...(Object.fromEntries(Object.keys(LEVELS.eigenaar).map((a) => [a, 0])) as Record<PermArea, Level>),
  ...partial
})

/** The roles the team made for itself, which the seeded people hold. */
export const CUSTOM_ROLES: ReadonlyArray<RoleDef> = [
  {
    id: "cx-lead",
    label: "CX-lead",
    description: "Beheert tickets, inbox en chats; financiën alleen lezen.",
    system: false,
    basedOn: "klantenservice",
    levels: levels({
      orders: 2,
      returns: 2,
      customers: 3,
      products: 1,
      support: 3,
      chargebacks: 2,
      suppliers: 1,
      automations: 1,
      analytics: 1,
      team: 2
    }),
    specials: ["refunds.write", "disputes.write", "customers.merge", "returns.approve"],
    refundLimit: 250,
    stores: "all"
  },
  {
    id: "operations",
    label: "Operations",
    description: "Bestellingen, leveranciers en producten; de flows die erbij horen.",
    system: false,
    basedOn: "beheerder",
    levels: levels({
      orders: 3,
      returns: 3,
      customers: 2,
      products: 3,
      support: 1,
      chargebacks: 1,
      suppliers: 3,
      automations: 3,
      analytics: 1,
      data: 2,
      settings: 1,
      team: 1,
      integrations: 1
    }),
    specials: [
      "refunds.write",
      "data.export",
      "automations.publish",
      "returns.approve",
      "quality.approve",
      "products.phase"
    ],
    refundLimit: 500,
    stores: ["store_us", "store_eu"]
  },
  {
    id: "marketing",
    label: "Marketing",
    description: "Klanten, producten en affiliates in de EU-winkel.",
    system: false,
    basedOn: "alleen-lezen",
    levels: levels({ orders: 1, customers: 2, products: 2, affiliates: 3, automations: 2, analytics: 1, data: 1 }),
    specials: ["data.export"],
    refundLimit: null,
    stores: ["store_eu"]
  }
]

export const ROLES: ReadonlyArray<RoleDef> = [...SYSTEM_ROLES, ...CUSTOM_ROLES]
export const roleLabel = (id: string) => ROLES.find((r) => r.id === id)?.label ?? "Verwijderde rol"

export const ACCESS_REQUESTS = [
  {
    id: "req_liam",
    who: PEOPLE.liam.id,
    roleId: "operations",
    area: "integrations" as PermArea,
    level: 2 as Level,
    why: "Ik wil de Google Ads-koppeling zelf aanzetten.",
    at: ago(3 * H)
  }
] as const

export const storeName = (id: string) => STORES.find((s) => s.id === id)?.name ?? id
export const storesLabel = (scope: "all" | ReadonlyArray<string>) =>
  scope === "all" ? "Alle winkels" : scope.map(storeName).join(", ")

/* ── notifications ─────────────────────────────────────────────────────────────────────────────── */

export type Channel = "app" | "email" | "push" | "slack"
export const CHANNELS: ReadonlyArray<{ readonly id: Channel; readonly label: string; readonly short: string }> = [
  { id: "app", label: "In de app", short: "App" },
  { id: "email", label: "E-mail", short: "E-mail" },
  { id: "push", label: "Mobiel push", short: "Push" },
  { id: "slack", label: "Slack", short: "Slack" }
]

export type NoteEvent = {
  readonly key: string
  readonly group: string
  readonly label: string
  readonly detail: string
  readonly mine?: boolean
  readonly threshold?: "delayHours" | "disputeAmount"
  readonly on: Readonly<Record<Channel, boolean>>
}

const ch = (app: boolean, email: boolean, push: boolean, slack: boolean) => ({ app, email, push, slack })

export const NOTE_EVENTS: ReadonlyArray<NoteEvent> = [
  {
    key: "order.late",
    group: "Bestellingen",
    label: "Bestelling te laat",
    detail: "Nog niet verzonden na de drempel.",
    mine: true,
    threshold: "delayHours",
    on: ch(true, true, false, false)
  },
  {
    key: "order.refund",
    group: "Bestellingen",
    label: "Terugbetaald of geannuleerd",
    detail: "Iemand uit het team heeft geld teruggegeven of een bestelling gestopt.",
    mine: true,
    on: ch(true, false, false, false)
  },
  {
    key: "return.new",
    group: "Retouren",
    label: "Nieuwe retour of claim",
    detail: "Een klant vraagt een retour aan of meldt een probleem in het retourportaal.",
    on: ch(true, false, false, false)
  },
  {
    key: "ticket.assigned",
    group: "Klantenservice",
    label: "Ticket aan jou toegewezen",
    detail: "Iemand legt een ticket bij jou neer.",
    on: ch(true, true, true, false)
  },
  {
    key: "ticket.sla",
    group: "Klantenservice",
    label: "Termijn dreigt te verlopen",
    detail: "Een ticket heeft binnen 4 uur een eerste antwoord nodig.",
    mine: true,
    on: ch(true, false, true, false)
  },
  {
    key: "chat.handover",
    group: "Klantenservice",
    label: "Websitechat overgedragen",
    detail: `${ASSISTANT} geeft een gesprek op de website door aan het team.`,
    on: ch(true, false, true, false)
  },
  {
    key: "chargeback.new",
    group: "Chargebacks",
    label: "Nieuwe chargeback",
    detail: "Een klant betwist een betaling.",
    threshold: "disputeAmount",
    on: ch(true, true, false, false)
  },
  {
    key: "chargeback.deadline",
    group: "Chargebacks",
    label: "Bewijsdeadline nadert",
    detail: "Nog 24 uur om bewijs in te dienen.",
    on: ch(true, true, true, false)
  },
  {
    key: "supplier.delay",
    group: "Leveranciers",
    label: "Vertraging gemeld",
    detail: "Een leverancier verschuift een overdrachtsdatum.",
    mine: true,
    on: ch(true, true, false, false)
  },
  {
    key: "supplier.message",
    group: "Leveranciers",
    label: "Bericht van een leverancier",
    detail: "In het gedeelde kanaal met die leverancier.",
    on: ch(true, false, false, true)
  },
  {
    key: "automation.failed",
    group: "Automatiseringen",
    label: "Uitvoering mislukt",
    detail: "Een stap in een flow kon niet worden uitgevoerd.",
    on: ch(true, true, false, true)
  },
  {
    key: "chat.mention",
    group: "Team",
    label: "Vermelding",
    detail: "Iemand noemt je met @ in een chat of reactie.",
    on: ch(true, false, true, true)
  },
  {
    key: "team.access",
    group: "Team",
    label: "Toegangsverzoeken",
    detail: "Iemand vraagt om meer rechten, of er komt antwoord op een verzoek.",
    on: ch(true, false, false, false)
  },
  {
    key: "integration.disconnected",
    group: "Koppelingen",
    label: "Koppeling verbroken",
    detail: "Een dienst geeft Insyte geen toegang meer.",
    on: ch(true, true, false, false)
  },
  {
    key: "insyte.proposal",
    group: ASSISTANT,
    label: "Voorstel klaar",
    detail: `${ASSISTANT} heeft iets klaargezet dat jij kunt uitvoeren of negeren.`,
    on: ch(true, false, true, false)
  },
  {
    key: "insyte.action",
    group: ASSISTANT,
    label: "Actie mislukt of teruggedraaid",
    detail: `Iets wat ${ASSISTANT} zelf deed, mislukte of werd door een collega ongedaan gemaakt.`,
    on: ch(true, false, false, false)
  },
  {
    key: "insyte.budget",
    group: ASSISTANT,
    label: "AI-budget bijna op",
    detail: "Bij 80% en 100% van het maandbudget, voor de werkruimte of voor jou.",
    on: ch(true, true, false, false)
  }
]

export const SLACK_CHANNELS = ["#northwind-ops", "#klantenservice", "#financien"]

/* ── shortcuts ─────────────────────────────────────────────────────────────────────────────────── */

export const GOTO_DEFAULTS: ReadonlyArray<{ readonly id: string; readonly label: string; readonly key: string }> = [
  { id: "home", label: "Start", key: "D" },
  { id: "orders", label: "Bestellingen", key: "B" },
  { id: "tickets", label: "Tickets", key: "T" },
  { id: "inbox", label: "Inbox", key: "I" },
  { id: "customers", label: "Klanten", key: "K" },
  { id: "products", label: "Producten", key: "P" },
  { id: "returns", label: "Retouren", key: "R" },
  { id: "analytics", label: "Analyse", key: "A" },
  { id: "sheets", label: "Rekenbladen", key: "S" },
  { id: "courses", label: "Cursussen", key: "U" },
  { id: "live", label: "Live", key: "L" },
  { id: "notifications", label: "Meldingen", key: "N" },
  { id: "settings", label: "Instellingen", key: "," }
]

export const SCREEN_KEYS: ReadonlyArray<{
  readonly group: string
  readonly keys: ReadonlyArray<{ readonly keys: ReadonlyArray<string>; readonly what: string }>
}> = [
  {
    group: "Overal",
    keys: [
      { keys: ["⌘", "K"], what: "Opdrachtenpalet en zoeken" },
      { keys: ["⌘", "J"], what: `Vraag ${ASSISTANT}` },
      { keys: ["Esc"], what: "Sluit wat open staat" }
    ]
  },
  {
    group: "Meldingen",
    keys: [
      { keys: ["G", "N"], what: "Naar alle meldingen" },
      { keys: ["J", "K"], what: "Volgende of vorige melding" },
      { keys: ["E"], what: "Wissen" },
      { keys: ["S"], what: "Later" },
      { keys: ["U"], what: "Gelezen of ongelezen" }
    ]
  },
  {
    group: "Wachtrij op Start",
    keys: [
      { keys: ["J"], what: "Volgende rij" },
      { keys: ["K"], what: "Vorige rij" },
      { keys: ["E"], what: "Voorstel uitvoeren" },
      { keys: ["R"], what: "Opnieuw opstellen" },
      { keys: ["D"], what: "Negeren" }
    ]
  },
  {
    group: "Lijsten met geselecteerde rijen",
    keys: [
      { keys: ["⌘", "K"], what: "Acties voor de geselecteerde rijen" },
      { keys: ["Esc"], what: "Selectie wissen" }
    ]
  }
]

/* ── stores ────────────────────────────────────────────────────────────────────────────────────── */

export type StoreRow = {
  readonly id: string
  readonly name: string
  readonly domain: string
  readonly currency: string
  readonly connected: boolean
  readonly synced: string
  readonly incidents: ReadonlyArray<{
    readonly id: string
    readonly finding: string
    readonly next: string | null
    readonly since: string
    readonly told: string | null
    readonly resolved: string | null
    readonly tried: ReadonlyArray<{ readonly at: string; readonly text: string }>
  }>
}

const DOMAINS: Readonly<Record<string, { domain: string; currency: string }>> = {
  store_eu: { domain: "northwind-eu.myshopify.com", currency: "EUR" },
  store_us: { domain: "northwind-clothing.myshopify.com", currency: "USD" },
  store_uk: { domain: "northwind-uk.myshopify.com", currency: "GBP" }
}

/** Every connected store read through this quarter hour, except US, whose order webhooks stopped at 03:12. */
export const STORE_ROWS: ReadonlyArray<StoreRow> = STORES.map((s) => ({
  id: s.id,
  name: s.name,
  domain: DOMAINS[s.id]?.domain ?? "",
  currency: DOMAINS[s.id]?.currency ?? "EUR",
  connected: s.connected,
  synced: s.connected ? "Gesynchroniseerd om 14:15" : "Ontkoppeld op 18 nov",
  incidents: s.id === "store_us"
    ? [
      {
        id: "inc_gap",
        finding: "Er komen sinds 03:12 geen webhooks van Shopify binnen.",
        next: `${ASSISTANT} haalt de wijzigingen zelf op`,
        since: "Sinds 05:15",
        told: "Gemeld aan jou",
        resolved: null,
        tried: [{ at: "05:15", text: "Haalt de wijzigingen sinds 03:12 zelf op bij Shopify" }]
      },
      {
        id: "inc_rate",
        finding: "De limiet van Shopify voor verzoeken was bijna bereikt.",
        next: null,
        since: "Sinds vr 11:30",
        told: null,
        resolved: "Opgelost vr 12:00",
        tried: [{ at: "11:30", text: "Remde zijn eigen verzoeken af en las de rest het volgende kwartier" }]
      }
    ]
    : []
}))

/* ── billing ───────────────────────────────────────────────────────────────────────────────────── */

/** The demo's plans, as the current demo shows them. Not Insyte's public pricing, which is undecided. */
export const PLANS = [
  {
    id: "starter",
    name: "Starter",
    pitch: "Eén winkel en een klein team.",
    price: 149,
    seats: 3,
    stores: 1,
    replies: 1000
  },
  {
    id: "growth",
    name: "Growth",
    pitch: "Een paar winkels en een supportteam.",
    price: 299,
    seats: 6,
    stores: 3,
    replies: 2500
  },
  {
    id: "scale",
    name: "Scale",
    pitch: "Elke winkel, elk kanaal, het hele team.",
    price: 499,
    seats: 12,
    stores: 5,
    replies: 5000
  }
] as const
export type PlanId = (typeof PLANS)[number]["id"]

export const RENEWAL = new Date(2026, 11, 14)
export const CARD = { brand: "Visa", last4: "4242", expiry: "06/2028" }
export const USAGE = [
  { label: "Gebruikte plekken", value: 6, max: 12 },
  { label: "Gekoppelde winkels", value: 3, max: 5 },
  { label: "AI-antwoorden (deze periode)", value: 1284, max: 5000 },
  { label: "Actieve automatiseringen", value: 14, max: 50 }
] as const
export const INVOICES = [
  { id: "INV-2026-11", date: new Date(2026, 10, 14), amount: 499 },
  { id: "INV-2026-10", date: new Date(2026, 9, 14), amount: 499 },
  { id: "INV-2026-09", date: new Date(2026, 8, 14), amount: 499 },
  { id: "INV-2026-08", date: new Date(2026, 7, 14), amount: 499 }
] as const
export const CANCEL_REASONS = [
  "Het is te duur",
  "We missen een functie",
  "We sluiten de winkel",
  "We zijn overgestapt op een andere tool",
  "Iets anders"
]

/* ── regional and VAT ──────────────────────────────────────────────────────────────────────────── */

export const REGIONAL = {
  language: "nl-NL",
  currency: "EUR",
  dateFormat: "DD MMM YYYY",
  timeFormat: "24h",
  weekStart: "mon",
  timezone: "Europe/Amsterdam"
}
export const REGIONAL_OPTIONS = {
  language: [
    { value: "nl-NL", label: "Nederlands" },
    { value: "en-US", label: "English (United States)" },
    { value: "en-GB", label: "English (United Kingdom)" },
    { value: "de-DE", label: "Deutsch" },
    { value: "fr-FR", label: "Français" }
  ],
  currency: [
    { value: "EUR", label: "EUR · euro" },
    { value: "USD", label: "USD · Amerikaanse dollar" },
    { value: "GBP", label: "GBP · Brits pond" }
  ],
  dateFormat: [
    { value: "DD MMM YYYY", label: "23 nov 2026" },
    { value: "MMM DD, YYYY", label: "nov 23, 2026" },
    { value: "YYYY-MM-DD", label: "2026-11-23" }
  ],
  timeFormat: [
    { value: "24h", label: "24 uur (14:30)" },
    { value: "12h", label: "12 uur (2:30 pm)" }
  ],
  weekStart: [
    { value: "mon", label: "Maandag" },
    { value: "sun", label: "Zondag" },
    { value: "sat", label: "Zaterdag" }
  ],
  timezone: [
    { value: "Europe/Amsterdam", label: "Europe/Amsterdam (UTC+1)" },
    { value: "Europe/London", label: "Europe/London (UTC+0)" },
    { value: "America/New_York", label: "America/New_York (UTC-5)" }
  ]
} as const

export const VAT_STORES: ReadonlyArray<{
  readonly storeId: string
  readonly currency: string
  readonly vatOnShipping: boolean
  readonly refundInclVat: boolean
}> = [
  { storeId: "store_eu", currency: "EUR", vatOnShipping: true, refundInclVat: true },
  { storeId: "store_us", currency: "USD", vatOnShipping: false, refundInclVat: false }
]
export const OSS = { on: true, number: "NL123456789B01" }

/* ── the store's own: returns, shipping, templates, brand, domain ─────────────────────────────── */

export const RETURN_SETTINGS = {
  returnDays: 30,
  claimDays: 60,
  specialWindows: [{ id: "feestdagen", label: "Feestdagen", days: 60, from: "15 nov", to: "24 dec" }],
  reasons: [
    { id: "too_small", label: "Te klein", claim: false, photo: false, quality: false },
    { id: "too_big", label: "Te groot", claim: false, photo: false, quality: false },
    { id: "not_as_expected", label: "Anders dan verwacht", claim: false, photo: false, quality: false },
    { id: "damaged", label: "Beschadigd aangekomen", claim: true, photo: true, quality: true, days: 14 },
    { id: "wrong_item", label: "Verkeerd artikel", claim: true, photo: true, quality: false, days: 14 },
    { id: "quality", label: "Kwaliteit", claim: true, photo: true, quality: true }
  ],
  rules: [
    {
      id: "rule_sale",
      target: "Label “sale”",
      kind: "Niet retourneerbaar",
      note: "Sale-artikelen kun je niet retourneren. Ruilen kan wel."
    },
    {
      id: "rule_beanie",
      target: "Mariner Wool Beanie",
      href: paths.product("mariner-wool-beanie"),
      kind: "Niet retourneerbaar",
      note: "Mutsen nemen we om hygiënische redenen niet terug."
    },
    {
      id: "rule_belt",
      target: "Anchor Belt · Tan",
      href: paths.product("anchor-belt-tan"),
      kind: "Alleen geld terug",
      note: "Riemen ruilen we niet; je krijgt je geld terug."
    }
  ],
  offered: ["refund", "exchange", "gift_card", "replacement", "discount"],
  giftCardBonus: 10,
  exchangeFee: 0,
  addresses: [
    {
      country: "NL",
      label: "Nederland en België",
      address: "Northwind Retouren, Distributieweg 12, 3045 AB Rotterdam",
      carrier: "PostNL"
    },
    {
      country: "DE",
      label: "Duitsland en Oostenrijk",
      address: "Northwind Returns c/o Allure Fulfillment, Lagerstraße 4, 41460 Neuss",
      carrier: "DHL"
    },
    {
      country: "FR",
      label: "Frankrijk",
      address: "Northwind Retours, 18 rue des Entrepôts, 59000 Lille",
      carrier: "DPD"
    },
    {
      country: "US",
      label: "Verenigde Staten",
      address: "Northwind Returns, 410 Harbor Blvd, Newark NJ 07114",
      carrier: "UPS"
    }
  ],
  claimSteps: ["Wat is er mis", "Foto's van het artikel en de verpakking", "Wat wil je dat we doen"],
  portal: {
    handle: "northwind-eu",
    intro: "Iets terugsturen of een probleem melden? Vul je bestelnummer en e-mailadres in.",
    done:
      "We bekijken je aanvraag binnen twee werkdagen. Je krijgt een mail met het retourlabel zodra we hem hebben goedgekeurd."
  }
} as const

export const RESOLUTION_LABEL: Readonly<Record<string, string>> = {
  refund: "Terugbetalen",
  exchange: "Ruilen",
  gift_card: "Cadeaubon",
  replacement: "Nieuw artikel",
  discount: "Kortingscode"
}

export type ShipStatus = {
  readonly id: string
  readonly carrier: string
  readonly label: string
  readonly show: "all" | "line" | "hidden"
  readonly orders: number
}

export const SHIP_STATUSES: ReadonlyArray<ShipStatus> = [
  { id: "info", carrier: "Label aangemaakt", label: "Je bestelling is verzonden", show: "all", orders: 3 },
  { id: "supplier", carrier: "Bij de leverancier", label: "We maken je bestelling klaar", show: "line", orders: 6 },
  { id: "country", carrier: "Onderweg naar het land", label: "Onderweg", show: "line", orders: 4 },
  { id: "local", carrier: "Bij de lokale vervoerder", label: "Onderweg met {vervoerder}", show: "all", orders: 9 },
  { id: "noinfo", carrier: "Nog geen info van de vervoerder", label: "Verzonden", show: "all", orders: 2 },
  { id: "transit", carrier: "Onderweg", label: "Onderweg", show: "all", orders: 14 },
  { id: "pickup", carrier: "Klaar om op te halen", label: "Ligt klaar om op te halen", show: "all", orders: 1 },
  { id: "out", carrier: "Wordt vandaag bezorgd", label: "Wordt vandaag bezorgd", show: "all", orders: 5 },
  { id: "failed", carrier: "Bezorging mislukt", label: "Bezorgpoging mislukt", show: "all", orders: 1 },
  { id: "exception", carrier: "Probleem met de zending", label: "We kijken naar je zending", show: "all", orders: 2 },
  { id: "stale", carrier: "Geen updates meer", label: "Onderweg", show: "line", orders: 3 },
  { id: "delivered", carrier: "Bezorgd", label: "Bezorgd", show: "all", orders: 41 }
]
export const SHOW_LABEL = { all: "Overal", line: "Alleen in de statusregel", hidden: "Niet tonen" } as const

export const TEMPLATE_LINKS = {
  review: "https://northwind.store/pages/review",
  unsubscribe: "",
  restock: ""
}
export const TEMPLATE_FIELDS = [
  {
    key: "review",
    label: "Reviewlink",
    variable: "{review_link}",
    uses: 3,
    hint: "Na een bezorging en bij een tevreden antwoord."
  },
  {
    key: "unsubscribe",
    label: "Uitschrijflink",
    variable: "{uitschrijf_link}",
    uses: 2,
    hint: "Onder elke mail die geen antwoord op een vraag is."
  },
  {
    key: "restock",
    label: "Weer-op-voorraad-link",
    variable: "{voorraad_link}",
    uses: 1,
    hint: "Als een klant vraagt wanneer iets terug is."
  }
] as const

/** Northwind's own colour: data the operator chose, drawn only on the preview of their own mail. */
export const BRAND = {
  color: "#24443C",
  font: "Systeem",
  sender: "Northwind",
  website: "https://northwind.store",
  support: "support@northwind.store",
  widget: "right"
}

export type DnsRecord = {
  readonly id: string
  readonly type: string
  readonly name: string
  readonly value: string
  readonly found: boolean
  readonly why?: string
}

export const DOMAIN = {
  domain: "northwind.store",
  checked: ago(2 * D),
  from: "service@northwind.store",
  replyTo: "support@northwind.store",
  records: [
    {
      id: "mx",
      type: "MX",
      name: "send",
      value: "feedback-smtp.eu-west-1.amazonses.com",
      found: false,
      why: "Er staat nog geen MX-record op send.northwind.store."
    },
    { id: "spf", type: "TXT", name: "send", value: "v=spf1 include:amazonses.com ~all", found: true },
    {
      id: "dkim",
      type: "TXT",
      name: "resend._domainkey",
      value: "p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC8…",
      found: false,
      why: "De sleutel staat er nog niet. Een nieuw record kan tot 24 uur duren."
    },
    { id: "dmarc", type: "TXT", name: "_dmarc", value: "v=DMARC1; p=none;", found: true }
  ] as ReadonlyArray<DnsRecord>
}

/* ── Magnus: autonomy, customer agent, knowledge, limits ──────────────────────────────────────── */

export type AutonomyLevel = "auto" | "ask" | "never"
export const AUTONOMY_LABEL: Readonly<Record<AutonomyLevel, string>> = {
  auto: "Zelf doen",
  ask: "Eerst vragen",
  never: "Nooit"
}

export type AutonomyAction = {
  readonly id: string
  readonly group: string
  readonly label: string
  /** What Magnus does at Zelf doen, as the clause after his name. */
  readonly does: string
  readonly sensitive?: "money" | "contact"
  /** Cannot be Zelf doen, and why. */
  readonly locked?: string
}

export const AUTONOMY_ACTIONS: ReadonlyArray<AutonomyAction> = [
  {
    id: "SetTicketStatus",
    group: "Tickets en gesprekken",
    label: "Ticketstatus wijzigen",
    does: "zet een ticket op Bezig, Wacht op antwoord of Klaar"
  },
  {
    id: "SetPriority",
    group: "Tickets en gesprekken",
    label: "Prioriteit en deadline zetten",
    does: "zet de prioriteit en de deadline van een ticket"
  },
  {
    id: "AssignTicket",
    group: "Tickets en gesprekken",
    label: "Toewijzen",
    does: "wijst tickets en gesprekken toe aan een collega"
  },
  {
    id: "AddNote",
    group: "Tickets en gesprekken",
    label: "Interne notitie toevoegen",
    does: "schrijft een interne notitie bij een record"
  },
  {
    id: "ApplyLabel",
    group: "Tickets en gesprekken",
    label: "Label toevoegen",
    does: "labelt tickets, gesprekken en bestellingen"
  },
  {
    id: "CreateTicket",
    group: "Tickets en gesprekken",
    label: "Ticket aanmaken",
    does: "maakt een ticket aan uit een mail of een gesprek"
  },
  {
    id: "SnoozeThread",
    group: "Tickets en gesprekken",
    label: "Gesprek uitstellen",
    does: "stelt een gesprek uit tot het weer aandacht vraagt"
  },
  {
    id: "SendReply",
    group: "Tickets en gesprekken",
    label: "Klant beantwoorden",
    does: "stuurt een antwoord aan een klant",
    sensitive: "contact"
  },
  {
    id: "ForwardOrder",
    group: "Bestellingen",
    label: "Bestelling doorsturen naar leverancier",
    does: "stuurt betaalde bestellingen door naar hun leverancier"
  },
  {
    id: "CancelOrder",
    group: "Bestellingen",
    label: "Bestelling annuleren",
    does: "annuleert een bestelling",
    sensitive: "money",
    locked: "Na betaling kan Shopify een annulering niet terugdraaien"
  },
  {
    id: "ApproveReturn",
    group: "Retouren",
    label: "Retour goedkeuren",
    does: "keurt een retour of claim goed die aan de regels voldoet"
  },
  {
    id: "SendReturnLabel",
    group: "Retouren",
    label: "Retourlabel versturen",
    does: "stuurt de klant een retourlabel",
    sensitive: "contact"
  },
  {
    id: "MessageSupplier",
    group: "Leveranciers",
    label: "Leverancier berichten",
    does: "stuurt een leverancier een bericht",
    sensitive: "contact"
  },
  {
    id: "RequestQualityCheck",
    group: "Leveranciers",
    label: "Kwaliteitscontrole aanvragen",
    does: "vraagt een leverancier om foto's of een monster van een batch",
    sensitive: "contact"
  },
  {
    id: "PostChatMessage",
    group: "Team",
    label: "Bericht in teamchat plaatsen",
    does: "plaatst een bericht in een kanaal van het team",
    sensitive: "contact"
  },
  {
    id: "RefundOrder",
    group: "Geld",
    label: "Terugbetalen",
    does: "betaalt een klant terug",
    sensitive: "money",
    locked: "Terugbetalingen vragen altijd, tot er een grens per bedrag is"
  },
  {
    id: "SubmitEvidence",
    group: "Geld",
    label: "Chargeback-bewijs indienen",
    does: "dient een bewijspakket in",
    sensitive: "money",
    locked: "Kan bij Klarna, Stripe en PayPal niet worden teruggedraaid"
  },
  {
    id: "AcceptDispute",
    group: "Geld",
    label: "Geschil accepteren",
    does: "accepteert een geschil",
    sensitive: "money",
    locked: "Een geaccepteerd geschil is verloren en komt niet terug"
  }
]

export const NEVER_REACHABLE = [
  "records verwijderen",
  "rollen, teamleden, sleutels, facturatie of koppelingen wijzigen",
  "deze instellingen zelf aanpassen"
]

export type Policy = Readonly<Record<string, AutonomyLevel>>

/** Out of the box everything asks first. */
export const DEFAULT_POLICY: Policy = Object.fromEntries(AUTONOMY_ACTIONS.map((a) => [a.id, "ask"]))

/** Elena let Magnus assign, note, label and snooze on his own (versions 2 and 3). */
export function policyFor(staat: Staat): Policy {
  return byStaat(staat, {
    gewoon: { ...DEFAULT_POLICY, AssignTicket: "auto", AddNote: "auto", ApplyLabel: "auto", SnoozeThread: "auto" },
    leeg: DEFAULT_POLICY,
    druk: {
      ...DEFAULT_POLICY,
      AssignTicket: "auto",
      AddNote: "auto",
      ApplyLabel: "auto",
      SnoozeThread: "auto",
      SetTicketStatus: "auto",
      SetPriority: "auto",
      CreateTicket: "auto",
      PostChatMessage: "never"
    }
  })
}

export function policyHistory(staat: Staat) {
  return byStaat(staat, {
    gewoon: [
      {
        id: "pol_3",
        at: ago(4 * D),
        by: "Elena Hart",
        version: 3,
        changes: [{ id: "SnoozeThread", from: "ask", to: "auto" }, { id: "ApplyLabel", from: "ask", to: "auto" }]
      },
      {
        id: "pol_2",
        at: ago(19 * D),
        by: "Elena Hart",
        version: 2,
        changes: [{ id: "AssignTicket", from: "ask", to: "auto" }, { id: "AddNote", from: "ask", to: "auto" }]
      },
      { id: "pol_1", at: ago(62 * D), by: "Insyte", version: 1, changes: [] }
    ] as ReadonlyArray<
      {
        id: string
        at: Date
        by: string
        version: number
        changes: ReadonlyArray<{ id: string; from: AutonomyLevel; to: AutonomyLevel }>
      }
    >,
    leeg: [{ id: "pol_1", at: ago(2 * H), by: "Insyte", version: 1, changes: [] }]
  })
}

export const BUDGET = { limit: 120, used: 38.4, background: 4 } as const
export function budgetFor(staat: Staat) {
  return byStaat(staat, {
    gewoon: {
      limit: 120 as number | null,
      used: 38.4,
      background: 4,
      people: [
        { id: PEOPLE.elena.id, limit: null as number | null, used: 11.8 },
        { id: PEOPLE.sofia.id, limit: 30 as number | null, used: 9.6 },
        { id: PEOPLE.liam.id, limit: 20 as number | null, used: 17 },
        { id: PEOPLE.ethan.id, limit: 20 as number | null, used: 4.1 },
        { id: PEOPLE.maya.id, limit: 10 as number | null, used: 1.9 }
      ]
    },
    leeg: {
      limit: 120 as number | null,
      used: 0,
      background: 0,
      people: [{ id: PEOPLE.elena.id, limit: null as number | null, used: 0 }]
    },
    druk: {
      limit: 500 as number | null,
      used: 410,
      background: 115.8,
      people: [
        { id: PEOPLE.elena.id, limit: null as number | null, used: 64 },
        { id: PEOPLE.sofia.id, limit: 60 as number | null, used: 60 },
        { id: PEOPLE.liam.id, limit: 40 as number | null, used: 22.5 },
        { id: PEOPLE.ethan.id, limit: 40 as number | null, used: 31 },
        { id: PEOPLE.maya.id, limit: 20 as number | null, used: 8.2 }
      ]
    }
  })
}

export type ChannelMode = "auto" | "drafts" | "off"
export const MODE_LABEL: Readonly<Record<ChannelMode, string>> = {
  auto: "Zelf antwoorden",
  drafts: "Alleen concepten",
  off: "Uit"
}
export const WEEKDAYS = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"] as const

const week = (sat: boolean) => [
  ...Array.from({ length: 5 }, () => ({ open: true, from: "09:00", to: "18:00" })),
  { open: sat, from: "10:00", to: "16:00" },
  { open: false, from: "10:00", to: "16:00" }
]

export type AgentSettings = {
  readonly on: boolean
  readonly channels: Readonly<Record<string, ChannelMode>>
  readonly hours: ReadonlyArray<{ readonly open: boolean; readonly from: string; readonly to: string }>
  readonly outside: "take" | "answer"
  readonly unsure: boolean
  readonly asksPerson: boolean
  readonly topics: ReadonlyArray<string>
  readonly afterMessages: number | null
  readonly tone: "brand" | "short" | "formal"
  readonly handover: string
}

export type AgentToday = {
  readonly conversations: number
  readonly handled: number
  readonly handedOver: number
  readonly waiting: number
  readonly avgSeconds: number
}

export function customerAgentFor(staat: Staat): { readonly settings: AgentSettings; readonly today: AgentToday } {
  const settings: AgentSettings = {
    on: true,
    channels: { webchat: "auto", whatsapp: "drafts", instagram: "off", email: "drafts" },
    hours: week(false),
    outside: "take",
    unsure: true,
    asksPerson: true,
    topics: ["klachten", "chargebacks", "juridisch"],
    afterMessages: 8,
    tone: "brand",
    handover: "Hier kijkt een collega graag even naar. Je hoort {wanneer} van ons, hier in de chat of per mail."
  }
  return byStaat(staat, {
    gewoon: { settings, today: { conversations: 23, handled: 17, handedOver: 4, waiting: 2, avgSeconds: 4 } },
    leeg: {
      settings: {
        ...settings,
        on: false,
        channels: { webchat: "off", whatsapp: "off", instagram: "off", email: "drafts" }
      },
      today: { conversations: 0, handled: 0, handedOver: 0, waiting: 0, avgSeconds: 0 }
    },
    druk: {
      settings: { ...settings, hours: week(true), outside: "answer", afterMessages: 6, tone: "short" },
      today: { conversations: 412, handled: 331, handedOver: 64, waiting: 17, avgSeconds: 6 }
    }
  })
}

export type Audience = "customer_agent" | "assistant" | "both"
export const AUDIENCE_LABEL: Readonly<Record<Audience, string>> = {
  customer_agent: "Klantagent",
  assistant: `Vraag ${ASSISTANT}`,
  both: "Beide"
}
/** The most a chapter may hold. */
export const KNOWLEDGE_LIMIT = 40_000

export type Version = {
  readonly n: number
  readonly at: Date
  readonly by: string
  readonly body: string
  readonly published: boolean
}
export type Article = {
  readonly id: string
  readonly title: string
  readonly audience: Audience
  readonly uses7d: number
  readonly versions: ReadonlyArray<Version>
}

const SHIPPING = `## Levertijden

We versturen op werkdagen vóór 15:00 besteld dezelfde dag.

- Nederland: 1–2 werkdagen
- België en Luxemburg: 2–3 werkdagen
- Duitsland en Oostenrijk: 2–4 werkdagen
- Frankrijk, Polen en de rest van de EU: 4–6 werkdagen

## Verzendkosten

Gratis vanaf € 75. Daaronder € 4,95 in Nederland en België, € 6,95 in de rest van de EU.

## Track & trace

Je krijgt de track & trace per mail zodra het pakket bij de vervoerder is. In Nederland is dat PostNL, in Duitsland DHL.`

const RETURNS_OLD = `## Termijn

Je kunt binnen 30 dagen na bezorging retourneren.

## Hoe

1. Ga naar het retourportaal via de link in je verzendmail
2. Vul je bestelnummer en e-mailadres in
3. Kies wat je terugstuurt, waarom, en of je ruilt of je geld terug wilt

Retourneren is gratis binnen Nederland en België.`

const RETURNS = `${RETURNS_OLD}

## Wat niet terug kan

- Mutsen, om hygiënische redenen
- Artikelen met het label sale: ruilen kan wel, geld terug niet

## Geld terug

Binnen 5 werkdagen nadat we je pakket hebben ontvangen, op dezelfde betaalmethode.`

type Spec = readonly [
  id: string,
  title: string,
  audience: Audience,
  uses: number,
  versions: ReadonlyArray<readonly [days: number, by: string, body: string, published: boolean]>
]

const SPECS: ReadonlyArray<Spec> = [
  ["kb_shipping", "Verzending en levertijden", "both", 41, [
    [90, "Elena Hart", SHIPPING.split("## Track")[0] ?? SHIPPING, true],
    [60, "Sofía Kim", SHIPPING.replace("Polen en ", ""), true],
    [30, "Sofía Kim", SHIPPING.replace("Polen en ", "").replace("15:00", "14:00"), true],
    [6, "Sofía Kim", SHIPPING, true]
  ]],
  ["kb_returns", "Retourneren", "both", 23, [
    [120, "Elena Hart", RETURNS_OLD.replace("30", "14"), true],
    [100, "Elena Hart", RETURNS_OLD, true],
    [40, "Sofía Kim", `${RETURNS_OLD}\n\n## Geld terug\n\nBinnen 5 werkdagen.`, true],
    [
      4,
      "Sofía Kim",
      `${RETURNS_OLD}\n\n## Geld terug\n\nBinnen 5 werkdagen nadat we je pakket hebben ontvangen.`,
      true
    ],
    [2, "Elena Hart", RETURNS, true]
  ]],
  ["kb_sizes", "Maten", "customer_agent", 12, [
    [80, "Maya Roy", "## Hoe valt het?\n\nOnze jassen vallen normaal.", true],
    [50, "Maya Roy", "## Hoe valt het?\n\nOnze jassen vallen normaal. Twijfel je, neem de grotere maat.", true],
    [
      9,
      "Maya Roy",
      "## Hoe valt het?\n\nOnze jassen vallen normaal. Twijfel je tussen twee maten, neem dan de grotere: dan past er een trui onder.\n\n## Broeken\n\nDe Field Pant valt een halve maat klein in de taille.\n\n## Cascade Puffer\n\nValt ruim. Neem je gewone maat, of een kleiner als je hem strak wilt.",
      true
    ]
  ]],
  ["kb_payment", "Betalen", "customer_agent", 7, [
    [100, "Elena Hart", "## Betaalmethoden\n\niDEAL, creditcard en PayPal.", true],
    [
      20,
      "Elena Hart",
      "## Betaalmethoden\n\niDEAL, creditcard, Klarna (achteraf betalen binnen 30 dagen) en PayPal.\n\n## Kortingscodes\n\nEén code per bestelling. Vul hem in bij het afrekenen.",
      true
    ]
  ]],
  ["kb_products", "Over de producten", "both", 9, [
    [60, "Maya Roy", "## Wassen\n\nWas op 30 graden, binnenstebuiten.", true],
    [
      14,
      "Maya Roy",
      "## Wassen\n\nWas op 30 graden, binnenstebuiten. De Aurora fleece niet in de droger.\n\n## Materialen\n\nDe Coastline Bomber Jacket is van gerecycled nylon. De Mariner Wool Beanie is merinowol.",
      true
    ]
  ]],
  ["kb_brand", "Over het merk", "assistant", 2, [[
    150,
    "Elena Hart",
    "## Wie we zijn\n\nNorthwind maakt jassen en basics die lang meegaan, ontworpen in Amsterdam en gemaakt bij vier vaste leveranciers.",
    true
  ]]],
  ["kb_giftcards", "Cadeaubonnen en kortingscodes", "customer_agent", 4, [
    [45, "Sofía Kim", "## Cadeaubonnen\n\nEen cadeaubon is een jaar geldig en kun je in delen besteden.", true],
    [
      16,
      "Sofía Kim",
      "## Cadeaubonnen\n\nEen cadeaubon is een jaar geldig en kun je in delen besteden.\n\n## Kortingscodes\n\nEén code per bestelling.",
      true
    ]
  ]],
  ["kb_complaints", "Klachten en garantie", "both", 0, [[
    3,
    "Sofía Kim",
    "## Garantie\n\nOp naden en ritsen geven we een jaar garantie.\n\n## Een probleem melden\n\nMeld het via het retourportaal, met een foto.",
    false
  ]]],
  ["kb_wholesale", "Groothandel", "assistant", 0, [[
    1,
    "Elena Hart",
    "## Minimale afname\n\n50 stuks per model, gemengde maten.",
    false
  ]]]
]

const build = (specs: ReadonlyArray<Spec>): ReadonlyArray<Article> =>
  specs.map(([id, title, audience, uses7d, versions]) => ({
    id,
    title,
    audience,
    uses7d,
    versions: versions.map(([days, by, body, published], i) => ({
      n: i + 1,
      at: ago(days * D + 2 * H),
      by,
      body,
      published
    }))
  }))

export const ARTICLES: ReadonlyArray<Article> = build(SPECS)

export function articlesFor(staat: Staat): ReadonlyArray<Article> {
  return byStaat(staat, {
    gewoon: ARTICLES,
    leeg: [],
    druk: [
      ...ARTICLES,
      ...build([
        "Zakelijke bestellingen en facturen voor bedrijven in de Benelux",
        "Verzending buiten de EU",
        "Onderhoud van wol en merino",
        "Pre-orders en wachtlijsten",
        "Klantenservice tijdens de feestdagen"
      ].map((title, i): Spec => [
        `kb_extra_${i}`,
        title,
        (["both", "customer_agent", "assistant"] as const)[i % 3] ?? "both",
        (i * 7) % 30,
        [[10 + i, LONG_NAMES[i] ?? "Elena Hart", "## Uitleg\n\nUitleg voor klanten en het team.", i % 4 !== 3]]
      ]))
    ]
  })
}

export const article = (id: string) => ARTICLES.find((a) => a.id === id)
export const latest = (a: Article) => a.versions.at(-1)
export const publishedVersion = (a: Article) => a.versions.findLast((v) => v.published)

export type Gap = {
  readonly id: string
  readonly question: string
  readonly at: Date
  readonly customer: string
  readonly customerId?: string
  readonly channel: string
}

const GAPS: ReadonlyArray<Gap> = [
  {
    id: "gap_1",
    question: "Kan ik een sale-artikel retourneren?",
    at: ago(7 * H),
    customer: "Liam O'Connor",
    customerId: "liam-oconnor",
    channel: "Websitechat"
  },
  {
    id: "gap_2",
    question: "Versturen jullie ook naar Zwitserland?",
    at: ago(D),
    customer: "Soren Nilsson",
    customerId: "soren-nilsson",
    channel: "Websitechat"
  },
  {
    id: "gap_3",
    question: "Kan ik een cadeaubon combineren met een kortingscode?",
    at: ago(2 * D),
    customer: "Maria Garcia",
    customerId: "maria-garcia",
    channel: "Websitechat"
  },
  {
    id: "gap_4",
    question: "Kan ik mijn bestelling nog wijzigen nadat ik heb betaald?",
    at: ago(3 * D),
    customer: "Hannah Schmidt",
    customerId: "hannah-schmidt",
    channel: "WhatsApp"
  },
  {
    id: "gap_5",
    question: "Kan ik laten bezorgen bij een DHL-punt?",
    at: ago(5 * D),
    customer: "Felix Muller",
    customerId: "felix-muller",
    channel: "E-mail"
  }
]

export const gapsFor = (staat: Staat): ReadonlyArray<Gap> => byStaat(staat, { gewoon: GAPS, leeg: [] })

/* ── connections: integrations, apps, API keys, webhooks ──────────────────────────────────────── */

export type Integration = {
  readonly key: string
  readonly name: string
  readonly description: string
  readonly category: string
  readonly status: "connected" | "action" | "off"
  readonly synced?: string
}

export const INTEGRATIONS: ReadonlyArray<Integration> = [
  {
    key: "shopify",
    name: "Shopify",
    description: "Bestellingen, producten en klanten",
    category: "Commerce",
    status: "connected",
    synced: "14:12"
  },
  {
    key: "stripe",
    name: "Stripe",
    description: "Kaartbetalingen, terugbetalingen en geschillen",
    category: "Betalingen",
    status: "connected",
    synced: "14:10"
  },
  {
    key: "klarna",
    name: "Klarna",
    description: "Geschillen en betalingen",
    category: "Betalingen",
    status: "connected",
    synced: "13:55"
  },
  { key: "paypal", name: "PayPal", description: "Geschillen en betalingen", category: "Betalingen", status: "action" },
  {
    key: "gmail",
    name: "Gmail",
    description: "Inbox en gesprekken",
    category: "E-mail",
    status: "connected",
    synced: "14:14"
  },
  { key: "outlook", name: "Outlook", description: "Inbox en gesprekken", category: "E-mail", status: "off" },
  {
    key: "whatsapp",
    name: "WhatsApp Business",
    description: "WhatsApp Business via Meta · +31 20 808 44 11",
    category: "Kanalen",
    status: "connected",
    synced: "14:26"
  },
  {
    key: "instagram",
    name: "Instagram",
    description: "Berichten van je Instagram-bedrijfsaccount · @northwindclothing",
    category: "Kanalen",
    status: "connected",
    synced: "14:26"
  },
  {
    key: "webchat",
    name: "Websitechat",
    description: "Chat op je Shopify-winkel · Northwind EU",
    category: "Kanalen",
    status: "connected",
    synced: "14:26"
  },
  {
    key: "klaviyo",
    name: "Klaviyo",
    description: "E-mail- en sms-campagnes",
    category: "Marketing",
    status: "connected",
    synced: "12:40"
  },
  {
    key: "meta",
    name: "Meta Ads",
    description: "Advertentiekosten en resultaten per campagne",
    category: "Marketing",
    status: "connected",
    synced: "13:30"
  },
  {
    key: "google-ads",
    name: "Google Ads",
    description: "Advertentiekosten en resultaten per campagne",
    category: "Marketing",
    status: "off"
  },
  {
    key: "anthropic",
    name: "Anthropic",
    description: `Claude, het taalmodel achter ${ASSISTANT}`,
    category: "AI",
    status: "connected",
    synced: "14:14"
  }
]

export const APPS = [
  {
    id: "klaviyo",
    name: "Klaviyo",
    kind: "Koppeling",
    tagline: "Synchroniseer segmenten en e-mailflows direct naar klantprofielen.",
    installed: ago(84 * D),
    opened: ago(3 * H)
  },
  {
    id: "recharge",
    name: "Recharge",
    kind: "App",
    tagline: "Abonnementen, verlengingen en betalingsherinneringen, direct in Insyte.",
    installed: ago(61 * D),
    opened: ago(2 * D)
  },
  {
    id: "gorgias",
    name: "Gorgias",
    kind: "Import",
    tagline: "Importeer oude tickets en macro's om inbox en tickets direct op te starten.",
    installed: ago(140 * D),
    opened: null
  },
  {
    id: "aftership",
    name: "AfterShip",
    kind: "Koppeling",
    tagline: "Track & trace-pagina's in je huisstijl en proactieve bezorgmeldingen.",
    installed: ago(33 * D),
    opened: ago(6 * D)
  }
] as const

export type ApiAccess = 0 | 1 | 2
export type ApiKey = {
  readonly id: string
  readonly label: string
  readonly prefix: string
  readonly createdBy: string
  readonly created: Date
  readonly lastUsed: Date | null
  readonly status: "active" | "revoked"
  readonly access: { readonly kind: "role"; readonly roleId: string } | {
    readonly kind: "custom"
    readonly scopes: Readonly<Partial<Record<PermArea, ApiAccess>>>
  }
  readonly stores: "all" | ReadonlyArray<string>
  readonly expires: Date | null
  readonly ips: ReadonlyArray<string>
  readonly rotatedUntil?: Date
  readonly agent?: boolean
}

const SEED_KEYS: ReadonlyArray<ApiKey> = [
  {
    id: "key_live",
    label: "Magazijnsynchronisatie",
    prefix: "ins_live_8f2c",
    createdBy: "Ethan Jeppesen",
    created: new Date(2026, 5, 2),
    lastUsed: ago(14 * MIN),
    status: "active",
    access: { kind: "custom", scopes: { orders: 2, products: 2, suppliers: 1 } },
    stores: ["store_us", "store_eu"],
    expires: ahead(9 * D),
    ips: ["185.43.12.0/24"]
  },
  {
    id: "key_zap",
    label: "Zapier",
    prefix: "ins_live_31ad",
    createdBy: "Elena Hart",
    created: new Date(2026, 7, 19),
    lastUsed: ago(3 * H),
    status: "active",
    access: { kind: "role", roleId: "alleen-lezen" },
    stores: "all",
    expires: null,
    ips: []
  },
  {
    id: "key_bi",
    label: "Looker Studio rapportage",
    prefix: "ins_live_c90e",
    createdBy: "Sofía Kim",
    created: new Date(2026, 8, 4),
    lastUsed: ago(26 * H),
    status: "active",
    access: { kind: "role", roleId: "financien" },
    stores: "all",
    expires: ahead(220 * D),
    ips: [],
    rotatedUntil: ahead(18 * H)
  },
  {
    id: "key_old",
    label: "Oude Shopify-app",
    prefix: "ins_live_04fa",
    createdBy: "Elena Hart",
    created: new Date(2025, 10, 10),
    lastUsed: new Date(2026, 6, 30),
    status: "revoked",
    access: { kind: "role", roleId: "beheerder" },
    stores: "all",
    expires: null,
    ips: []
  }
]

export const keysFor = (staat: Staat): ReadonlyArray<ApiKey> =>
  byStaat(staat, {
    gewoon: SEED_KEYS,
    leeg: [],
    druk: [
      ...SEED_KEYS,
      ...["Voorraadfeed Allure Fulfillment", "Boekhouding Exact Online koppeling (productie)", "Retourlogica staging"]
        .map((
          label,
          i
        ): ApiKey => ({
          id: `key_busy_${i}`,
          label,
          prefix: `ins_live_${(0x1a2b + i * 977).toString(16).slice(-4)}`,
          createdBy: "Ethan Jeppesen",
          created: ago((30 + i * 11) * D),
          lastUsed: ago((i + 1) * 5 * H),
          status: "active",
          access: { kind: "custom", scopes: { orders: 1, products: 2 } },
          stores: "all",
          expires: i === 1 ? ago(D) : null,
          ips: []
        }))
    ]
  })

export const API_EXPIRY = [
  { value: "30", label: "30 dagen" },
  { value: "90", label: "90 dagen" },
  { value: "365", label: "1 jaar" },
  { value: "never", label: "Nooit" }
] as const
export const API_LEVEL_LABEL: Readonly<Record<ApiAccess, string>> = { 0: "Geen", 1: "Lezen", 2: "Lezen en schrijven" }
/** What a key can reach: team, billing and the API itself never. */
export const API_AREAS: ReadonlyArray<PermArea> = [
  "orders",
  "returns",
  "customers",
  "products",
  "support",
  "chargebacks",
  "suppliers",
  "automations",
  "analytics",
  "data"
]

/** The API's names for the areas, as a scope reads: `orders.read`, `orders.write`. */
const API_NAME: Readonly<Partial<Record<PermArea, string>>> = {
  orders: "orders",
  returns: "returns",
  customers: "customers",
  products: "products",
  support: "tickets",
  chargebacks: "disputes",
  suppliers: "suppliers",
  automations: "automations",
  analytics: "analytics",
  data: "exports"
}

/** What a key may reach, as scopes: from its own rights, or from the role it follows. */
export function keyScopes(k: ApiKey): ReadonlyArray<string> {
  const reach: Partial<Record<PermArea, ApiAccess>> = k.access.kind === "custom"
    ? k.access.scopes
    : (() => {
      const role = ROLES.find((r) => r.id === (k.access as { roleId: string }).roleId)
      return Object.fromEntries(
        API_AREAS.map((a) => [a, Math.min(2, role?.levels[a] ?? 0) as ApiAccess])
      ) as Partial<Record<PermArea, ApiAccess>>
    })()
  return API_AREAS.flatMap((a) => {
    const l = reach[a] ?? 0
    const name = API_NAME[a] ?? a
    return l === 0 ? [] : l === 1 ? [`${name}.read`] : [`${name}.read`, `${name}.write`]
  })
}

type ApiRequest = {
  readonly id: string
  readonly method: "GET" | "POST" | "PATCH" | "DELETE"
  readonly path: string
  readonly status: number
  readonly ms: number
  readonly ip: string
  readonly at: Date
}

/** A small deterministic generator, so a key reads the same each time it is opened. */
function seeded(text: string) {
  let h = 2166136261
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0
  return () => {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0
    return (h % 10_000) / 10_000
  }
}

const KEY_PATHS: Readonly<Record<string, ReadonlyArray<string>>> = {
  orders: ["/v1/orders", "/v1/orders/1043", "/v1/orders/1043/fulfillments"],
  products: ["/v1/products", "/v1/products/aurora-fleece/inventory"],
  customers: ["/v1/customers", "/v1/customers/cus_4821"],
  suppliers: ["/v1/suppliers/allure/prices"],
  analytics: ["/v1/analytics/revenue?period=week"],
  tickets: ["/v1/tickets?status=open"],
  returns: ["/v1/returns"],
  disputes: ["/v1/disputes"],
  exports: ["/v1/exports"],
  automations: ["/v1/automations"]
}

/**
 * A key's use: requests per day over the last 14 days (with how many failed), and its latest
 * requests, newest first. A revoked key stops on the day it was revoked; one never used has none.
 */
export function keyActivity(k: ApiKey): {
  readonly days: ReadonlyArray<{ readonly label: string; readonly requests: number; readonly errors: number }>
  readonly requests: ReadonlyArray<ApiRequest>
} {
  const rnd = seeded(k.id)
  const scopes = keyScopes(k)
  const base = k.id === "key_live" ? 1800 : k.id === "key_bi" ? 96 : k.id === "key_zap" ? 340 : 120
  const ips = k.ips.length > 0 ? ["185.43.12.7", "185.43.12.19"] : ["52.14.88.201", "34.201.17.4", "3.120.44.92"]
  const last = k.lastUsed?.getTime() ?? 0
  const days = Array.from({ length: 14 }, (_, i) => {
    const at = new Date(NOW - (13 - i) * D)
    const live = k.lastUsed !== null && at.getTime() <= last + D
    const weekend = at.getDay() === 0 || at.getDay() === 6
    const requests = live ? Math.round(base * (weekend ? 0.55 : 1) * (0.8 + rnd() * 0.4)) : 0
    return {
      label: `${at.getDate()} ${MONTHS[at.getMonth()] ?? ""}`,
      requests,
      errors: Math.round(requests * (k.id === "key_live" && i === 11 ? 0.06 : rnd() * 0.012))
    }
  })
  const writes = scopes.filter((x) => x.endsWith(".write")).map((x) => x.split(".")[0] ?? "")
  const reads = scopes.filter((x) => x.endsWith(".read")).map((x) => x.split(".")[0] ?? "")
  const requests = k.lastUsed === null ? [] : Array.from({ length: 40 }, (_, i): ApiRequest => {
    const write = writes.length > 0 && rnd() < 0.3
    const area = (write ? writes : reads)[Math.floor(rnd() * (write ? writes : reads).length)] ?? "orders"
    const list = KEY_PATHS[area] ?? ["/v1/orders"]
    const r = rnd()
    return {
      id: `req_${k.id}_${i}`,
      method: write ? (rnd() < 0.7 ? "POST" : "PATCH") : "GET",
      path: list[Math.floor(rnd() * list.length)] ?? "/v1/orders",
      status: r < 0.03 ? 429 : r < 0.05 ? 401 : write ? 201 : 200,
      ms: Math.round(40 + rnd() * (write ? 380 : 180)),
      ip: ips[Math.floor(rnd() * ips.length)] ?? ips[0] ?? "",
      at: new Date(last - i * (k.id === "key_live" ? 47_000 : 9 * MIN) - Math.round(rnd() * 20_000))
    }
  })
  return { days, requests }
}

export type Delivery = {
  readonly id: string
  readonly event: string
  readonly at: Date
  readonly status: number | null
  readonly ms: number
  readonly attempts: number
  /** Of how many the endpoint's retry setting allows. */
  readonly max: number
  readonly test?: boolean
  readonly nextRetry?: Date
  /** What Insyte sent, and what came back (`null` when nothing came back). */
  readonly body: Readonly<Record<string, unknown>>
  readonly response: string | null
}

/** The payload of one event, as Insyte signs and sends it. */
export function payloadFor(event: string, id: string, at: Date): Readonly<Record<string, unknown>> {
  const [kind] = event.split(".")
  const object: Record<string, unknown> = kind === "order"
    ? { id: "ord_1043", name: "#1043", total: 89.95, currency: "EUR", customer: "cus_4821", store: "store_eu" }
    : kind === "chargeback"
    ? { id: "dp_2291", order: "ord_0988", amount: 129, currency: "EUR", reason: "product_not_received" }
    : kind === "customer"
    ? { id: "cus_4821", email: "lotte.devries@example.nl", orders: 4, country: "NL" }
    : kind === "ticket"
    ? { id: "tk_5142", subject: "Waar blijft mijn pakket?", assignee: "sofia-kim", status: "open" }
    : { id: "rt_311", order: "ord_1021", amount: 59, currency: "EUR", status: "requested" }
  return { id: `evt_${id.replace(/^dl_/, "")}`, type: event, created: at.toISOString(), data: { object } }
}

export type Header = { readonly key: string; readonly value: string }

export type Endpoint = {
  readonly id: string
  readonly url: string
  readonly description: string
  /** Sent along with every delivery; the value never comes back from the server. */
  readonly headers: ReadonlyArray<Header>
  readonly events: ReadonlyArray<string>
  readonly stores: "all" | ReadonlyArray<string>
  readonly apiVersion: string
  readonly retry: number
  readonly active: boolean
  readonly failures: number
  readonly createdBy: string
  readonly secret: string
  readonly deliveries: ReadonlyArray<Delivery>
}

const deliveries = (events: ReadonlyArray<string>, failing: number, retry: number): ReadonlyArray<Delivery> =>
  Array.from({ length: 8 }, (_, i) => {
    const id = `dl_${events[0]?.split(".")[0] ?? "x"}_${i}`
    const event = events[i % events.length] ?? "order.created"
    const at = ago((i * 47 + 9) * MIN)
    const failed = i < failing
    return {
      id,
      event,
      at,
      status: failed ? (i === 0 ? null : 502) : 200,
      ms: failed ? 10_000 : 120 + ((i * 53) % 260),
      attempts: failed ? (i === 0 ? 2 : retry) : 1,
      max: Math.max(retry, 1),
      ...(failed && i === 0 ? { nextRetry: ahead(52 * MIN) } : {}),
      body: payloadFor(event, id, at),
      response: failed ? (i === 0 ? null : "<html><body><h1>502 Bad Gateway</h1></body></html>") : "{\"ok\":true}"
    }
  })

const SEED_HOOKS: ReadonlyArray<Endpoint> = [
  {
    id: "we_orders",
    url: "https://hooks.northwind.co/insyte/orders",
    description: "Magazijn: nieuwe en betaalde bestellingen naar de pakbon-printer.",
    events: ["order.created", "order.paid", "order.fulfilled", "order.refunded"],
    stores: "all",
    apiVersion: "2026-10-01",
    retry: 5,
    active: true,
    failures: 0,
    createdBy: "Ethan Jeppesen",
    secret: "whsec_9Rk2mQ7xLp4Vt8nZ3bWc6Yh1",
    headers: [{ key: "X-Northwind-Env", value: "productie" }],
    deliveries: deliveries(["order.created", "order.paid", "order.fulfilled"], 0, 5)
  },
  {
    id: "we_disputes",
    url: "https://hooks.northwind.co/insyte/disputes",
    description: "Chargebacks naar het financiële kanaal in Slack.",
    events: ["chargeback.opened", "chargeback.evidence_due", "chargeback.won", "chargeback.lost"],
    stores: "all",
    apiVersion: "2026-10-01",
    retry: 3,
    active: true,
    failures: 3,
    createdBy: "Elena Hart",
    secret: "whsec_4Hq8sDn2Kv6Tm1Xr7Lp3Jw9",
    headers: [{ key: "Authorization", value: "" }],
    deliveries: deliveries(["chargeback.opened", "chargeback.evidence_due"], 3, 3)
  },
  {
    id: "we_klaviyo",
    url: "https://a.klaviyo.com/api/webhooks/insyte/northwind",
    description: "Klantsegmenten bijwerken na samenvoegen en nieuwe bestellingen.",
    events: ["customer.created", "customer.updated", "customer.merged", "order.created"],
    stores: ["store_eu"],
    apiVersion: "2026-07-01",
    retry: 5,
    active: true,
    failures: 0,
    createdBy: "Maya Roy",
    secret: "whsec_7Bt3nVc8Qx1Mz5Rk2Wp6Hd4",
    headers: [],
    deliveries: deliveries(["customer.updated", "order.created"], 0, 5)
  }
]

export const hooksFor = (staat: Staat): ReadonlyArray<Endpoint> =>
  byStaat(staat, {
    gewoon: SEED_HOOKS,
    leeg: [],
    druk: [
      ...SEED_HOOKS,
      {
        ...SEED_HOOKS[0],
        id: "we_busy_1",
        url: "https://exact-koppeling.brinkman-hoogendoorn-administratie.nl/insyte/inbound",
        description: "Boekhouding: betaalde bestellingen en terugbetalingen per dag.",
        events: ["order.paid", "refund.created"],
        apiVersion: "2026-04-01",
        createdBy: "Sofía Kim"
      } as Endpoint,
      {
        ...SEED_HOOKS[0],
        id: "we_busy_2",
        url: "https://hooks.zapier.com/hooks/catch/1840213/b7xq2m/",
        description: "Tickets naar het teambord.",
        events: ["ticket.created", "ticket.assigned", "ticket.closed"],
        failures: 1,
        createdBy: "Ethan Jeppesen"
      } as Endpoint
    ]
  })

export const WEBHOOK_EVENTS: ReadonlyArray<{ readonly area: string; readonly events: ReadonlyArray<string> }> = [
  {
    area: "Bestellingen",
    events: ["order.created", "order.paid", "order.fulfilled", "order.cancelled", "order.refunded"]
  },
  { area: "Klanten", events: ["customer.created", "customer.updated", "customer.merged"] },
  { area: "Tickets", events: ["ticket.created", "ticket.assigned", "ticket.closed"] },
  { area: "Retouren", events: ["return.requested", "return.approved", "refund.created", "refund.failed"] },
  { area: "Chargebacks", events: ["chargeback.opened", "chargeback.evidence_due", "chargeback.won", "chargeback.lost"] }
]
export const RETRY_OPTIONS = [
  { value: "0", label: "Geen", detail: "Eén poging. Mislukt is mislukt." },
  { value: "3", label: "3 pogingen", detail: "Na 1 min, 10 min en 1 uur." },
  { value: "5", label: "5 pogingen", detail: "Tot 6 uur na de eerste poging." },
  { value: "8", label: "8 pogingen", detail: "Tot 3 dagen na de eerste poging." }
] as const

/* ── security, privacy, data, log, trash ──────────────────────────────────────────────────────── */

export const SESSIONS = [
  { id: "mac-chrome", device: "MacBook Pro · Chrome", location: "Amsterdam, NL", last: "Nu actief", current: true },
  {
    id: "iphone-safari",
    device: "iPhone 15 · Safari",
    location: "Amsterdam, NL",
    last: "2 uur geleden",
    current: false
  },
  { id: "linux-firefox", device: "Linux · Firefox", location: "Berlijn, DE", last: "Gisteren", current: false }
] as const

export const AUDIT = [
  {
    at: "22 nov 18:42",
    who: "Elena Hart",
    action: "Rol gewijzigd",
    detail: "Financiën kan nu chargeback-bewijs indienen"
  },
  { at: "22 nov 09:15", who: "Elena Hart", action: "API-sleutel aangemaakt", detail: "Magazijnsynchronisatie" },
  { at: "21 nov 16:03", who: "Ethan Jeppesen", action: "Bestelling terugbetaald", detail: "Bestelling #5288, € 89,00" },
  { at: "20 nov 11:20", who: "Elena Hart", action: "App geïnstalleerd", detail: "Klaviyo" },
  {
    at: "19 nov 14:58",
    who: "Sofía Kim",
    action: "Teamlid uitgenodigd",
    detail: "amber@northwindclothing.co als Klantenservice"
  },
  { at: "17 nov 08:31", who: "Elena Hart", action: "Tweestapsverificatie ingeschakeld", detail: "Hele werkruimte" }
] as const

export const RETENTION_PERIODS = [
  { value: "3", label: "3 maanden" },
  { value: "6", label: "6 maanden" },
  { value: "12", label: "1 jaar" },
  { value: "24", label: "2 jaar" },
  { value: "36", label: "3 jaar" },
  { value: "never", label: "Niet verwijderen" }
] as const

export const PRIVACY_CLASSES = [
  {
    id: "contact",
    label: "Klantcontact",
    detail: "E-mails, chats en WhatsApp-berichten met klanten, met hun tickets en notities.",
    months: "24",
    count: 312
  },
  {
    id: "uploads",
    label: "Bijlagen",
    detail: "Foto's uit het retourportaal en bijlagen bij e-mails.",
    months: "24",
    count: 87
  },
  {
    id: "logs",
    label: "Logboeken",
    detail: `Inlogpogingen, webhookverzoeken en wat ${ASSISTANT} deed.`,
    months: "3",
    count: 1940
  },
  {
    id: "ads",
    label: "Advertentielog",
    detail: "Wat een automatisering met Meta Ads deed: budgetten, pauzes, de cijfers erbij.",
    months: "24",
    count: 0
  },
  {
    id: "courses",
    label: "Cursusvoortgang",
    detail: "Antwoorden, scores en herkansingen per teamlid.",
    months: "12",
    count: 4
  },
  {
    id: "customers",
    label: "Klantgegevens",
    detail: "Naam, adres en e-mail van klanten zonder bestelling in deze periode.",
    months: "36",
    count: 58
  }
] as const

export const INVENTORY = [
  {
    id: "customers",
    label: "Klanten",
    detail: "Namen, e-mailadressen, adressen en telefoonnummers uit je winkels",
    count: 4812
  },
  { id: "orders", label: "Bestellingen", detail: "Regels, bedragen, verzending en terugbetalingen", count: 1290 },
  { id: "products", label: "Producten", detail: "Titels, varianten, prijzen en voorraad", count: 19 },
  { id: "support", label: "Klantcontact", detail: "Tickets en e-mails met klanten", count: 2316 },
  { id: "chats", label: "Teamchat", detail: "Berichten tussen collega's", count: 1408 },
  { id: "returns", label: "Retouren", detail: "Aanvragen, redenen, labels en pakketten", count: 133 },
  { id: "chargebacks", label: "Chargebacks", detail: "Geschillen en het bewijs dat erbij hoort", count: 14 },
  { id: "files", label: "Bestanden", detail: "Pakbonnen, labels, bewijsstukken, logo's en exports", count: 3940 },
  { id: "team", label: "Team", detail: "Collega's, hun rol en de winkels die ze zien", count: 5 },
  { id: "log", label: "Logboek", detail: "Wie wat veranderde, en wanneer", count: 6230 }
] as const

export const PLACES = [
  { what: "Database", where: "Frankfurt, Duitsland (Neon, AWS eu-central-1)" },
  { what: "Bestanden en exports", where: "Europese Unie (Cloudflare R2, EU-jurisdictie)" },
  { what: "Wachtrijen en achtergrondtaken", where: "Europese Unie (Cloudflare, EU-jurisdictie)" },
  { what: "Versleuteling", where: "Alles versleuteld opgeslagen; winkelsleutels nog eens apart verzegeld" }
] as const

export const SUB_PROCESSORS = [
  {
    name: "Cloudflare",
    purpose: "Hosting en het netwerk waarover Insyte draait",
    where: "Opslag in de EU; verkeer wordt wereldwijd doorgegeven",
    outsideEu: true
  },
  { name: "Neon", purpose: "De database", where: "Frankfurt, Duitsland", outsideEu: false },
  {
    name: "Resend",
    purpose: "E-mail die Insyte namens je verstuurt",
    where: "Verzending vanuit de EU; gegevens over verzending in de VS",
    outsideEu: true
  },
  {
    name: "Anthropic",
    purpose: `Het taalmodel achter concepten en ${ASSISTANT}`,
    where: "Verenigde Staten",
    outsideEu: true
  },
  { name: "Stripe", purpose: "Abonnement en betalingen", where: "Verenigde Staten en EU", outsideEu: true },
  {
    name: "Google en Microsoft",
    purpose: "Alleen je eigen gekoppelde accounts, zoals een mailbox",
    where: "Waar je eigen account staat",
    outsideEu: true
  }
] as const

export const EXPORTS = [
  {
    id: "exp_2",
    title: "Export van 21 nov",
    who: "Automatisch",
    size: "18,4 MB",
    state: "ready" as const,
    until: "Te downloaden tot 28 nov"
  },
  {
    id: "exp_1",
    title: "Export van 31 okt",
    who: "Door Elena Hart",
    size: "16,9 MB",
    state: "expired" as const,
    until: "Verlopen op 7 nov"
  }
]

export const SHOPPER_REQUESTS = [
  {
    id: "gdpr_3",
    kind: "Inzage",
    subject: "m.jansen@example.nl",
    via: "Via Shopify",
    received: "vandaag 11:30",
    state: "open" as const,
    due: "Uiterlijk 23 dec"
  },
  {
    id: "gdpr_2",
    kind: "Wissen",
    subject: "Shopify-klant 7481920563",
    via: "Via Shopify",
    received: "14 nov",
    state: "done" as const,
    due: "Gewist op 14 nov"
  },
  {
    id: "gdpr_1",
    kind: "Inzage",
    subject: "lotte.bakker@example.nl",
    via: "Door Elena Hart",
    received: "9 nov",
    state: "done" as const,
    due: "Afgehandeld op 9 nov"
  }
]

export type AuditRow = {
  readonly id: string
  readonly at: Date
  readonly who: string
  readonly page: string
  readonly slug: string
  readonly field: string
  readonly before: string
  readonly after: string
}

const SEED_AUDIT: ReadonlyArray<AuditRow> = [
  {
    id: "a1",
    at: ago(5 * H),
    who: "Elena Hart",
    page: "Team",
    slug: "team",
    field: "Uitnodiging",
    before: "—",
    after: "jesse@northwind.co"
  },
  {
    id: "a2",
    at: ago(D - 2 * H),
    who: "Elena Hart",
    page: "Zelfstandigheid",
    slug: "ai/zelfstandigheid",
    field: "Toewijzen",
    before: "Eerst vragen",
    after: "Zelf doen"
  },
  {
    id: "a3",
    at: ago(D + 3 * H),
    who: "Sofía Kim",
    page: "Retouren",
    slug: "retouren",
    field: "Termijn voor een retour",
    before: "14 dagen",
    after: "30 dagen"
  },
  {
    id: "a4",
    at: ago(3 * D),
    who: "Elena Hart",
    page: "Regio",
    slug: "regio",
    field: "Valuta",
    before: "USD",
    after: "EUR"
  },
  {
    id: "a5",
    at: ago(3 * D + H),
    who: "Elena Hart",
    page: "Regio",
    slug: "regio",
    field: "Valuta",
    before: "EUR",
    after: "USD"
  },
  {
    id: "a6",
    at: ago(4 * D),
    who: "Liam Tucker",
    page: "Koppelingen",
    slug: "koppelingen",
    field: "Meta Ads",
    before: "Niet gekoppeld",
    after: "Gekoppeld"
  },
  {
    id: "a7",
    at: ago(6 * D),
    who: "Sofía Kim",
    page: "Klantagent",
    slug: "ai/klantagent",
    field: "Openingstijden",
    before: "9:00–17:00",
    after: "9:00–18:00"
  },
  {
    id: "a8",
    at: ago(9 * D),
    who: "Elena Hart",
    page: "Limieten",
    slug: "ai/limieten",
    field: "Maandlimiet",
    before: "€ 80",
    after: "€ 120"
  }
]

export const auditFor = (staat: Staat): ReadonlyArray<AuditRow> => byStaat(staat, { gewoon: SEED_AUDIT, leeg: [] })

export type TrashItem = {
  readonly id: string
  readonly kind: string
  readonly title: string
  readonly by: string
  readonly at: Date
}

const SEED_TRASH: ReadonlyArray<TrashItem> = [
  { id: "t1", kind: "Ticket", title: "Dubbele bestelling #5274", by: "Sofía Kim", at: ago(D) },
  { id: "t2", kind: "Sjabloon", title: "Black Friday: kortingscode verlopen", by: "Elena Hart", at: ago(3 * D) },
  { id: "t3", kind: "Automatisering", title: "Oude retourflow (2025)", by: "Elena Hart", at: ago(6 * D) },
  { id: "t4", kind: "Notitie", title: "Notitie bij Lena Vos: belt liever", by: "Sofía Kim", at: ago(8 * D) },
  { id: "t5", kind: "Rekenblad", title: "Test marge Q1", by: "Liam Tucker", at: ago(19 * D) },
  { id: "t6", kind: "Klant", title: "test@northwind.store", by: "Elena Hart", at: ago(27 * D) }
]

export const trashFor = (staat: Staat): ReadonlyArray<TrashItem> => byStaat(staat, { gewoon: SEED_TRASH, leeg: [] })
export const TRASH_DAYS = 30

/* ── counts the menu, the overview and the shell read ─────────────────────────────────────────── */

const isExpired = (i: Invite) => i.expires.getTime() < NOW

/** Invitations still open (not lapsed): the Team row's count. */
export const pendingInvites = (staat: Staat = "gewoon") => invitesFor(staat).filter((i) => !isExpired(i)).length
/** Questions the customer agent could not answer: the Kennisbank row's count. */
export const knowledgeGaps = (staat: Staat = "gewoon") => gapsFor(staat).length
/** Endpoints with failed deliveries in a row. */
export const failingWebhooks = (staat: Staat = "gewoon") => hooksFor(staat).filter((h) => h.failures > 0).length
/** Stores that lost their connection. */
export const disconnectedStores = () => STORE_ROWS.filter((s) => !s.connected).length
/** DNS records of the sending domain still missing. */
export const missingDnsRecords = () => DOMAIN.records.filter((r) => !r.found).length
/** Integrations that need someone to reconnect. */
export const integrationsNeedingAction = () => INTEGRATIONS.filter((i) => i.status === "action").length

/** What the settings menu counts beside a row, from the same functions as the pages. */
export function menuCount(slug: string, staat: Staat): number | undefined {
  switch (slug) {
    case "team":
      return pendingInvites(staat)
    case "winkels":
      return disconnectedStores()
    case "ai/kennisbank":
      return knowledgeGaps(staat)
    case "webhooks":
      return failingWebhooks(staat)
    case "koppelingen":
      return integrationsNeedingAction()
    case "e-mail-en-domein":
      return staat === "leeg" ? undefined : missingDnsRecords()
    default:
      return undefined
  }
}
