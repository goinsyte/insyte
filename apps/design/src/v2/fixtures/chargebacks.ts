import { useSyncExternalStore } from "react"
import type { Tone } from "../ui/badge.tsx"
import { customerOrders, order } from "./records.ts"
import type { Payment } from "./records.ts"
import { DEMO_NOW, PEOPLE } from "./workspace.ts"

/**
 * Chargebacks: the disputes a payment provider opened against Northwind, after `/app`'s
 * `mock-data/chargebacks.ts`, on the shared customers and orders. CB-2291 is the story's: Felix
 * Muller's Klarna dispute on #5318 (the Coastline Bomber Jacket, € 129,00), to be answered by
 * tomorrow 12:00; the Chargeback-assistent drafted the evidence pack at 11:05 and submitting it waits
 * for a person, because what goes to Klarna cannot be taken back. The older cases are closed or with
 * the provider; the ones from before 16 November point at orders that are older than this demo's
 * window, so their number is shown but not linked.
 */

const HOUR = 3_600_000
const DAY = 24 * HOUR
const NOW = DEMO_NOW.date.getTime()

export type Channel = "klarna" | "paypal" | "stripe"
export type CaseStatus = "wacht-op-bewijs" | "ingediend" | "gewonnen" | "verloren"

export const CHANNEL_LABEL: Readonly<Record<Channel, string>> = { klarna: "Klarna", paypal: "PayPal", stripe: "Stripe" }

export const CASE_STATUS: Readonly<Record<CaseStatus, { readonly label: string; readonly tone: Tone }>> = {
  "wacht-op-bewijs": { label: "Wacht op bewijs", tone: "warn" },
  ingediend: { label: "Ingediend", tone: "accent" },
  gewonnen: { label: "Gewonnen", tone: "good" },
  verloren: { label: "Verloren", tone: "bad" }
}

export type EvidenceFile = { readonly id: string; readonly name: string; readonly bytes: number; readonly what: string }

export type CaseEvent = { readonly at: number; readonly who: string; readonly text: string; readonly tone?: Tone }

export type Chargeback = {
  /** "CB-2291"; the URL holds it in lower case (`paths.chargeback`). */
  readonly id: string
  readonly channel: Channel
  readonly customerId: string
  readonly orderNumber: string
  /** Whether the order is inside this demo's window (and so has a page). */
  readonly linked: boolean
  readonly amount: number
  readonly reason: string
  /** What the provider passed on from the customer. */
  readonly claim: string
  readonly status: CaseStatus
  readonly openedAt: number
  readonly dueAt: number
  readonly files: ReadonlyArray<EvidenceFile>
  /** The answer to the provider, as the agent drafted it or a person wrote it. */
  readonly statement: string
  /** Set when an agent drafted the pack: who and when. */
  readonly draftedBy?: { readonly agentId: string; readonly agent: string; readonly at: number }
  readonly events: ReadonlyArray<CaseEvent>
}

const PAYMENT_CHANNEL: Readonly<Partial<Record<Payment, Channel>>> = {
  Klarna: "klarna",
  PayPal: "paypal",
  Kaart: "stripe"
}

/** A real order of the customer paid through the channel, else their latest order. */
function orderFor(customerId: string, channel: Channel): string {
  const mine = customerOrders(customerId)
  return (mine.find((o) => PAYMENT_CHANNEL[o.payment] === channel) ?? mine[0])?.number ?? ""
}

const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute).getTime()

const felix = order("5318")

export const CHARGEBACKS: ReadonlyArray<Chargeback> = [
  {
    id: "CB-2291",
    channel: "klarna",
    customerId: "felix-muller",
    orderNumber: "5318",
    linked: true,
    amount: 129,
    reason: "Artikel niet ontvangen",
    claim: "Ik heb de jas nooit ontvangen. Het pakket is niet bij mij afgeleverd en de winkel reageert niet.",
    status: "wacht-op-bewijs",
    openedAt: at(20, 9, 14),
    dueAt: at(24, 12),
    files: [
      {
        id: "f1",
        name: `Bezorgbewijs ${felix?.carrier ?? "DHL"} #5318.pdf`,
        bytes: 412_000,
        what: "Bezorgd op 18 nov 13:22, handtekening bij de voordeur"
      },
      {
        id: "f2",
        name: "Bestelbevestiging #5318.pdf",
        bytes: 96_000,
        what: "Coastline Bomber Jacket, maat L, € 129,00 met Klarna"
      },
      {
        id: "f3",
        name: "Track & trace-verloop.pdf",
        bytes: 188_000,
        what: "Elke scan van ophalen tot bezorgd, op het adres in Düsseldorf"
      },
      {
        id: "f4",
        name: "Mails met Felix Muller.pdf",
        bytes: 74_000,
        what: "Twee mails van 19 nov; het team antwoordde binnen 2 uur"
      }
    ],
    statement:
      "De Coastline Bomber Jacket van bestelling #5318 is op 18 november om 13:22 bezorgd op het adres dat de klant bij het afrekenen opgaf, met een handtekening als bewijs. De track & trace laat elke scan zien. De klant mailde op 19 november; we antwoordden binnen twee uur en boden aan een onderzoek bij de vervoerder te starten. Daar is niet op gereageerd. We vragen Klarna het geschil af te wijzen.",
    draftedBy: { agentId: "chargebacks", agent: "Chargeback-assistent", at: at(23, 11, 5) },
    events: [
      { at: at(20, 9, 14), who: "Klarna", text: "Geschil geopend: artikel niet ontvangen", tone: "bad" },
      { at: at(20, 9, 15), who: "Insyte", text: "Bestelling #5318 gekoppeld en € 129,00 vastgezet door Klarna" },
      {
        at: at(23, 11, 5),
        who: "Chargeback-assistent",
        text: "Bewijspakket opgesteld: 4 documenten en een verweer; indienen wacht op jou"
      }
    ]
  },
  {
    id: "CB-2290",
    channel: "paypal",
    customerId: "daniel-brown",
    orderNumber: orderFor("daniel-brown", "paypal"),
    linked: true,
    amount: 59,
    reason: "Niet zoals beschreven",
    claim: "De trui is van een andere stof dan op de website staat.",
    status: "wacht-op-bewijs",
    openedAt: at(22, 16, 40),
    dueAt: at(29, 23, 59),
    files: [],
    statement: "",
    events: [{ at: at(22, 16, 40), who: "PayPal", text: "Geschil geopend: niet zoals beschreven", tone: "bad" }]
  },
  {
    id: "CB-2289",
    channel: "stripe",
    customerId: "yuki-tanaka",
    orderNumber: orderFor("yuki-tanaka", "stripe"),
    linked: true,
    amount: 94,
    reason: "Niet-geautoriseerde transactie",
    claim: "De kaarthouder herkent deze betaling niet.",
    status: "ingediend",
    openedAt: at(17, 10),
    dueAt: at(27, 23, 59),
    files: [
      { id: "f1", name: "Bestelbevestiging.pdf", bytes: 90_000, what: "Besteld vanaf het vaste adres van de klant" },
      {
        id: "f2",
        name: "Eerdere bestellingen Yuki Tanaka.pdf",
        bytes: 120_000,
        what: "14 eerdere bestellingen met dezelfde kaart"
      }
    ],
    statement:
      "De bestelling is geplaatst vanaf het account van de klant, met dezelfde kaart als veertien eerdere bestellingen, en bezorgd op het vaste adres.",
    events: [
      { at: at(17, 10), who: "Stripe", text: "Geschil geopend: niet-geautoriseerde transactie", tone: "bad" },
      { at: at(18, 15, 20), who: PEOPLE.elena.name, text: "Bewijs ingediend bij Stripe: 2 documenten" }
    ]
  },
  {
    id: "CB-2286",
    channel: "klarna",
    customerId: "chris-lee",
    orderNumber: "5188",
    linked: false,
    amount: 179,
    reason: "Terugbetaling niet ontvangen",
    claim: "Ik heb de puffer teruggestuurd maar mijn geld niet teruggekregen.",
    status: "gewonnen",
    openedAt: at(2, 11),
    dueAt: at(12, 12),
    files: [{ id: "f1", name: "Terugbetaling R-802.pdf", bytes: 70_000, what: "Terugbetaald op 30 okt" }],
    statement: "Het bedrag is op 30 oktober terugbetaald na ontvangst van de retour.",
    events: [
      { at: at(2, 11), who: "Klarna", text: "Geschil geopend", tone: "bad" },
      { at: at(3, 9), who: PEOPLE.sofia.name, text: "Bewijs ingediend bij Klarna" },
      { at: at(14, 10), who: "Klarna", text: "Uitspraak in het voordeel van Northwind", tone: "good" }
    ]
  },
  {
    id: "CB-2284",
    channel: "paypal",
    customerId: "emily-white",
    orderNumber: "5102",
    linked: false,
    amount: 65,
    reason: "Artikel niet ontvangen",
    claim: "Nooit aangekomen.",
    status: "verloren",
    openedAt: at(-2, 14),
    dueAt: at(8, 12),
    files: [],
    statement: "",
    events: [
      { at: at(-2, 14), who: "PayPal", text: "Geschil geopend", tone: "bad" },
      { at: at(8, 12), who: "PayPal", text: "Termijn verlopen zonder bewijs; zaak verloren", tone: "bad" }
    ]
  },
  {
    id: "CB-2281",
    channel: "stripe",
    customerId: "maria-garcia",
    orderNumber: "5071",
    linked: false,
    amount: 89,
    reason: "Dubbel afgeschreven",
    claim: "Ik ben twee keer gefactureerd.",
    status: "gewonnen",
    openedAt: at(-6, 9),
    dueAt: at(4, 12),
    files: [{
      id: "f1",
      name: "Betaaloverzicht.pdf",
      bytes: 52_000,
      what: "Eén betaling, één terugboeking door de bank"
    }],
    statement: "Er is één betaling ontvangen; de tweede regel was een voorlopige reservering van de bank.",
    events: [
      { at: at(-6, 9), who: "Stripe", text: "Geschil geopend", tone: "bad" },
      { at: at(-5, 11), who: PEOPLE.elena.name, text: "Bewijs ingediend bij Stripe" },
      { at: at(6, 10), who: "Stripe", text: "Uitspraak in het voordeel van Northwind", tone: "good" }
    ]
  }
]

/* ── the visit's changes ───────────────────────────────────────────────────────────────────────── */

type CaseState = { readonly patch: Readonly<Record<string, Partial<Chargeback>>> }

let state: CaseState = { patch: {} }
const listeners = new Set<() => void>()
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const useCases = () => useSyncExternalStore(subscribe, () => state)

export function changeCase(id: string, fields: (c: Chargeback) => Partial<Chargeback>): CaseState {
  const before = state
  const current = casesOf().find((c) => c.id === id)
  if (current === undefined) return before
  state = { patch: { ...state.patch, [id]: { ...state.patch[id], ...fields(current) } } }
  for (const l of listeners) l()
  return before
}

export function restoreCases(to: CaseState) {
  state = to
  for (const l of listeners) l()
}

let tick = 0
export const casesNow = () => NOW + ++tick * 1000

const cache = new WeakMap<CaseState, ReadonlyArray<Chargeback>>()
export function casesOf(s: CaseState = state): ReadonlyArray<Chargeback> {
  const hit = cache.get(s)
  if (hit !== undefined) return hit
  const all = CHARGEBACKS.map((c) => (s.patch[c.id] === undefined ? c : { ...c, ...s.patch[c.id] }))
  cache.set(s, all)
  return all
}

export const findCase = (id: string, s: CaseState = state) =>
  casesOf(s).find((c) => c.id.toLowerCase() === id.toLowerCase())
export const orderCases = (orderNumber: string, s: CaseState = state) =>
  casesOf(s).filter((c) => c.orderNumber === orderNumber)

/* ── the counts ────────────────────────────────────────────────────────────────────────────────── */

export const isOpenCase = (c: Chargeback) => c.status === "wacht-op-bewijs" || c.status === "ingediend"
export const openCases = (s: CaseState = state) => casesOf(s).filter(isOpenCase)
/** Waiting for the team's evidence with the provider's deadline inside 48 hours. */
export const dueSoon = (s: CaseState = state) =>
  casesOf(s).filter((c) => c.status === "wacht-op-bewijs" && c.dueAt - NOW < 2 * DAY)
export const waitingOnEvidence = (s: CaseState = state) => casesOf(s).filter((c) => c.status === "wacht-op-bewijs")

/** "nog 21 u 30 min", "nog 6 dagen", "verlopen". */
export function timeLeft(due: number): string {
  const ms = due - NOW
  if (ms <= 0) return "verlopen"
  const h = Math.floor(ms / HOUR)
  if (h < 48) return `nog ${h} u ${Math.floor((ms % HOUR) / 60_000)} min`
  return `nog ${Math.floor(ms / DAY)} dagen`
}
