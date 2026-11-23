import { useSyncExternalStore } from "react"
import type { Tone } from "../ui/badge.tsx"
import type { View } from "../view.ts"
import { ticket } from "./inbox.ts"
import { customerOrders, CUSTOMERS, euro, ORDERS } from "./records.ts"
import type { Customer, Order } from "./records.ts"
import { PEOPLE } from "./workspace.ts"

/**
 * Klanten: the profiles of `records.ts` as the customers area reads them. Their segment, what they
 * are worth over the profile and this fixture's orders, the duplicate pairs the review asks about,
 * and the few tickets, notes and a chargeback the story ties to a person. The tickets belong to the
 * inbox and the chargeback to Chargebacks; they are kept here by their story ids until those areas
 * expose them. What the operator changes in the demo (a merge, a label, a note, an erasure) lives in
 * the small store at the foot, so the list, the profile and the menu say the same thing.
 */

export type Segment = "trouw" | "nieuw" | "risico" | "dubbel"

export const SEGMENT: Readonly<Record<Segment, { readonly label: string; readonly tone: Tone }>> = {
  trouw: { label: "Trouw", tone: "good" },
  nieuw: { label: "Nieuw", tone: "accent" },
  risico: { label: "Risico", tone: "warn" },
  dubbel: { label: "Dubbel", tone: "neutral" }
}

export const COUNTRY: Readonly<Record<Customer["country"], string>> = {
  NL: "Nederland",
  BE: "België",
  DE: "Duitsland",
  FR: "Frankrijk",
  NO: "Noorwegen",
  SE: "Zweden",
  IT: "Italië",
  ES: "Spanje",
  GB: "Verenigd Koninkrijk",
  IE: "Ierland",
  PL: "Polen",
  PT: "Portugal"
}

/* ── the demo's own changes ────────────────────────────────────────────────────────────────────── */

export type Note = { readonly id: string; readonly by: string; readonly at: string; readonly text: string }

export type CustomerState = {
  /** A profile merged away, and the profile it lives on in now. */
  readonly merged: Readonly<Record<string, string>>
  /** Pairs the operator said are two people. */
  readonly apart: ReadonlyArray<string>
  /** Labels as the operator left them, where they changed them. */
  readonly tags: Readonly<Record<string, ReadonlyArray<string>>>
  readonly notes: Readonly<Record<string, ReadonlyArray<Note>>>
  /** Profiles whose personal data was wiped (AVG): amounts and dates stay. */
  readonly erased: ReadonlyArray<string>
  readonly klaviyo: Readonly<Record<string, string>>
}

const EMPTY_STATE: CustomerState = { merged: {}, apart: [], tags: {}, notes: {}, erased: [], klaviyo: {} }

let state: CustomerState = EMPTY_STATE
const listeners = new Set<() => void>()

export function setCustomerState(next: (s: CustomerState) => CustomerState) {
  state = next(state)
  for (const l of listeners) l()
}

export function useCustomerState(): CustomerState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state
  )
}

export const getCustomerState = () => state

/* ── duplicates ────────────────────────────────────────────────────────────────────────────────── */

export type DuplicateGroup = {
  readonly key: string
  readonly ids: ReadonlyArray<string>
  readonly match: "zelfde e-mail" | "zelfde naam en land"
}

export const MATCH_LABEL: Readonly<Record<DuplicateGroup["match"], string>> = {
  "zelfde e-mail": "Zelfde e-mailadres",
  "zelfde naam en land": "Zelfde naam en land"
}

/** The pairs `records.ts` marks with `duplicateOf` that nobody merged or kept apart yet. */
export function duplicateGroups(s: CustomerState = state): ReadonlyArray<DuplicateGroup> {
  return CUSTOMERS.filter((c) => c.duplicateOf !== undefined)
    .map((c): DuplicateGroup => {
      const first = CUSTOMERS.find((x) => x.id === c.duplicateOf)
      return {
        key: `${c.duplicateOf ?? ""}+${c.id}`,
        ids: [c.duplicateOf ?? "", c.id],
        match: first?.email === c.email ? "zelfde e-mail" : "zelfde naam en land"
      }
    })
    .filter((g) => !s.apart.includes(g.key) && g.ids.every((id) => s.merged[id] === undefined))
}

/* ── rows ──────────────────────────────────────────────────────────────────────────────────────── */

export type CustomerRow = {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly city: string
  readonly country: Customer["country"]
  readonly tags: ReadonlyArray<string>
  readonly since: string
  /** Everything they paid: the profile's history plus this fixture's orders, cancelled and refunded left out. */
  readonly value: number
  readonly orders: number
  readonly aov: number
  readonly lastOrder: Order | undefined
  readonly segment: Segment
  readonly erased: boolean
}

const COUNTS: ReadonlySet<Order["status"]> = new Set(["geannuleerd", "terugbetaald"])

/** The orders of a profile and of every profile merged into it, newest first. */
export function ordersOf(id: string, s: CustomerState = state): ReadonlyArray<Order> {
  const absorbed = Object.entries(s.merged).filter(([, into]) => into === id).map(([from]) => from)
  if (absorbed.length === 0) return customerOrders(id)
  const ids = new Set([id, ...absorbed])
  return ORDERS.filter((o) => ids.has(o.customerId))
}

/** Profiles merged into this one. */
export const absorbedInto = (id: string, s: CustomerState = state) =>
  Object.entries(s.merged).filter(([, into]) => into === id).map(([from]) => CUSTOMERS.find((c) => c.id === from))
    .filter((c): c is Customer => c !== undefined)

/** Who is at risk: an open chargeback, or one order in twelve refunded since 16 November. */
const RISK = new Set(
  CUSTOMERS.filter((c) => {
    const own = customerOrders(c.id)
    const refunded = own.filter((o) => o.status === "terugbetaald").length
    return c.id === "felix-muller" || (own.length > 0 && refunded / own.length >= 0.08)
  }).map((c) => c.id)
)

function rowOf(c: Customer, s: CustomerState, dup: ReadonlySet<string>): CustomerRow {
  const absorbed = absorbedInto(c.id, s)
  const own = ordersOf(c.id, s)
  const paid = own.filter((o) => !COUNTS.has(o.status)).reduce((sum, o) => sum + o.total, 0)
  const value = Math.round(c.lifetimeValue + absorbed.reduce((n, x) => n + x.lifetimeValue, 0) + paid)
  const orders = c.ordersCount + absorbed.reduce((n, x) => n + x.ordersCount, 0) + own.length
  const segment: Segment = dup.has(c.id)
    ? "dubbel"
    : RISK.has(c.id)
    ? "risico"
    : c.ordersCount <= 2
    ? "nieuw"
    : "trouw"
  const erased = s.erased.includes(c.id)
  return {
    id: c.id,
    name: erased ? "Gewiste klant" : c.name,
    email: erased ? "—" : c.email,
    city: erased ? "—" : c.city,
    country: c.country,
    tags: erased ? [] : s.tags[c.id] ?? c.tags,
    since: c.since,
    value,
    orders,
    aov: orders === 0 ? 0 : value / orders,
    lastOrder: own[0],
    segment,
    erased
  }
}

/* The busy week: forty more profiles with the long names and addresses that break a layout. */
const LONG = [
  "Maximiliaan van der Westhuizen-Oosterhuis",
  "Anne-Sophie de la Croix-Vandenberghe",
  "Konstantinos Papadopoulos-Alexandridis",
  "Wilhelmina Theodora Schimmelpenninck",
  "Jean-Baptiste Hoogstraten van Leeuwen",
  "Gwendolyn Fitzgerald-Montgomery"
]
const BUSY: ReadonlyArray<Customer> = Array.from({ length: 40 }, (_, i): Customer => {
  const base = CUSTOMERS[i % 30] as Customer
  const name = `${LONG[i % LONG.length] ?? "Klant"} ${i + 1}`
  return {
    ...base,
    id: `druk-${i + 1}`,
    name,
    email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@heel-lang-bedrijfsdomein.example.com`,
    tags: ["vaste klant", "nieuwsbrief", "vip", "groothandel"].slice(0, (i % 4) + 1)
  }
})
const busyRows = (s: CustomerState) => BUSY.map((c) => ({ ...rowOf(c, s, new Set()), lastOrder: ORDERS[i0(c.id)] }))
const i0 = (id: string) => (Number(id.replace(/\D/g, "")) * 7) % 200

/** The list as the view draws it: every profile not merged away, the busy week's on top of them. */
export function customerRows(view: View, s: CustomerState = state): ReadonlyArray<CustomerRow> {
  if (view.staat === "leeg") return []
  const dup = new Set(duplicateGroups(s).flatMap((g) => g.ids))
  const rows = CUSTOMERS.filter((c) => s.merged[c.id] === undefined).map((c) => rowOf(c, s, dup))
  return view.staat === "druk" ? [...rows, ...busyRows(s)] : rows
}

export function findCustomer(id: string, view: View, s: CustomerState = state): CustomerRow | undefined {
  const c = CUSTOMERS.find((x) => x.id === id) ?? (view.staat === "druk" ? BUSY.find((x) => x.id === id) : undefined)
  if (c === undefined) return undefined
  const dup = new Set(duplicateGroups(s).flatMap((g) => g.ids))
  return rowOf(c, s, dup)
}

/** The counts the menu and the page both show. */
export function customerCounts(view: View, s: CustomerState = state) {
  const rows = customerRows(view, s)
  const groups = view.staat === "leeg" ? [] : duplicateGroups(s)
  return {
    all: rows.length,
    vip: rows.filter((r) => r.tags.includes("vip")).length,
    nieuw: rows.filter((r) => r.segment === "nieuw").length,
    risico: rows.filter((r) => r.segment === "risico").length,
    dubbel: groups.length,
    dubbelProfielen: groups.reduce((n, g) => n + g.ids.length, 0)
  }
}

/* ── what the story ties to a customer ─────────────────────────────────────────────────────────── */

export type CustomerCase = {
  readonly kind: "ticket" | "chargeback"
  readonly id: string
  readonly customerId: string
  readonly title: string
  readonly status: string
  readonly tone: Tone
  readonly order: string
  readonly assignee: keyof typeof PEOPLE | null
  readonly detail: string
}

/** The open tickets and the chargeback of the story, by their ids in Inbox and Chargebacks. */
const STORY_CASES: ReadonlyArray<CustomerCase> = [
  {
    kind: "ticket",
    id: "5141",
    customerId: "hannah-schmidt",
    title: "Pakket kwijt bij DPD",
    status: "Open",
    tone: "bad",
    order: "5263",
    assignee: "elena",
    detail: "Door de agent aan Elena toegewezen · DPD sluit claims om 17:00"
  },
  {
    kind: "ticket",
    id: "5146",
    customerId: "luca-romano",
    title: "Bestelling #5309 is vier dagen te laat",
    status: "Wacht op goedkeuring",
    tone: "warn",
    order: "5309",
    assignee: "sofia",
    detail: "PostNL, beloofd op 19 nov · voorstel: 10% korting met SORRY10"
  },
  {
    kind: "ticket",
    id: "5148",
    customerId: "astrid-berg",
    title: "Aurora Hooded Fleece valt te klein",
    status: "Wacht op goedkeuring",
    tone: "warn",
    order: "5296",
    assignee: "sofia",
    detail: "Maat S · de Retouragent wil omruilen naar M aanbieden"
  },
  {
    kind: "chargeback",
    id: "CB-2291",
    customerId: "felix-muller",
    title: "Klarna-geschil over de Coastline Bomber Jacket",
    status: "Antwoord vóór morgen 12:00",
    tone: "bad",
    order: "5318",
    assignee: "elena",
    detail: `${euro(129)} · bewijspakket opgesteld door een agent, indienen wacht op jou`
  }
]

/** Tickets read their subject and assignee from Inbox, so the two never tell it differently. */
export const CASES: ReadonlyArray<CustomerCase> = STORY_CASES.map((c) => {
  const t = c.kind === "ticket" ? ticket(c.id) : undefined
  return t === undefined ? c : { ...c, title: t.subject, assignee: t.assignee }
})

export const casesOf = (customerId: string) => CASES.filter((c) => c.customerId === customerId)

/** Notes the team left on a profile before today's demo. */
export const NOTES: Readonly<Record<string, ReadonlyArray<Note>>> = {
  "astrid-berg": [
    {
      id: "n-astrid",
      by: PEOPLE.sofia.name,
      at: "13:52",
      text: "Wil liever omruilen dan haar geld terug. Maat M is op voorraad."
    }
  ],
  "hannah-schmidt": [
    {
      id: "n-hannah",
      by: PEOPLE.elena.name,
      at: "gisteren 16:10",
      text: "Vaste klant sinds januari 2025. Bij een verloren pakket meteen opnieuw versturen, niet wachten op DPD."
    }
  ],
  "felix-muller": [
    {
      id: "n-felix",
      by: PEOPLE.sofia.name,
      at: "zo 22 nov",
      text:
        "Zegt de jas nooit te hebben ontvangen, maar PostNL heeft een foto bij de voordeur. Tweede profiel via gastafrekenen."
    }
  ]
}

export const notesOf = (id: string, s: CustomerState = state) => [...(s.notes[id] ?? []), ...(NOTES[id] ?? [])]

/** The labels the operator already uses, for the label dialog's suggestions. */
export const KNOWN_TAGS = ["vip", "vaste klant", "nieuwsbrief", "terugwinnen", "groothandel"] as const

export const KLAVIYO_LISTS = ["Nieuwsbrief", "VIP", "Terugwinnen"] as const

/** "4 bestellingen", "1 klant". */
export const counted = (n: number, one: string, many: string) => `${n.toLocaleString("nl-NL")} ${n === 1 ? one : many}`

export const isOpen = (o: Order) => ["betaald", "bij-leverancier", "verzonden", "vertraagd"].includes(o.status)

export const EMPTY_CUSTOMER_STATE = EMPTY_STATE
