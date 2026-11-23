import type { Carrier, Order } from "./records.ts"
import { customer, order, product } from "./records.ts"
import { DEMO_NOW, PEOPLE } from "./workspace.ts"

/*
 * The pages a shopper or a supplier opens from a link, without an Insyte account: the return portal
 * (`/v2/retour/northwind`) and a quality check by link (`/v2/kwaliteit/qc-301`). The orders, the
 * customers and the products are the shared records'; what is here is what only these pages know:
 * the portal's settings, the requests that are already open, and the checks a brand asked for.
 */

const DAY = 86_400_000
const at = (days: number, hour = 12, minute = 0) => {
  const d = new Date(DEMO_NOW.date.getTime() + days * DAY)
  d.setHours(hour, minute, 0, 0)
  return d
}

/* ── the return portal ─────────────────────────────────────────────────────────────────────────── */

export type ReasonId =
  | "too_small"
  | "too_big"
  | "not_as_expected"
  | "damaged"
  | "wrong_item"
  | "quality"
  | "not_arrived"
export type ReturnKind = "return" | "claim"
export type Resolution = "refund" | "exchange" | "gift_card" | "replacement"

export type Reason = {
  readonly id: ReasonId
  readonly label: string
  readonly kind: ReturnKind
  readonly photo: boolean
}

export const REASONS: ReadonlyArray<Reason> = [
  { id: "too_small", label: "Te klein", kind: "return", photo: false },
  { id: "too_big", label: "Te groot", kind: "return", photo: false },
  { id: "not_as_expected", label: "Anders dan verwacht", kind: "return", photo: false },
  { id: "damaged", label: "Beschadigd aangekomen", kind: "claim", photo: true },
  { id: "wrong_item", label: "Verkeerd artikel", kind: "claim", photo: true },
  { id: "quality", label: "Kwaliteit", kind: "claim", photo: true },
  { id: "not_arrived", label: "Niet aangekomen", kind: "claim", photo: false }
]

export const RESOLUTION_LABEL: Readonly<Record<Resolution, string>> = {
  refund: "Terugbetalen",
  exchange: "Ruilen",
  gift_card: "Cadeaubon",
  replacement: "Nieuw artikel"
}

/** The clause after "Je krijgt". */
export const RESOLUTION_DETAIL: Readonly<Record<Resolution, string>> = {
  refund: "het geld terug op de oorspronkelijke betaalmethode",
  exchange: "een andere maat of kleur, zonder extra kosten",
  gift_card: "een cadeaubon voor het bedrag plus de bonus",
  replacement: "een nieuw exemplaar, zonder iets terug te sturen"
}

export type ReturnStatus = "review" | "awaiting_parcel" | "in_transit" | "received" | "resolved" | "rejected"

export const STATUS_LABEL: Readonly<Record<ReturnStatus, string>> = {
  review: "Te beoordelen",
  awaiting_parcel: "Wacht op pakket",
  in_transit: "Onderweg",
  received: "Ontvangen",
  resolved: "Afgehandeld",
  rejected: "Afgewezen"
}

/** Where a parcel goes back to, by the shopper's country; the carrier is the one that country uses. */
const RETURN_ADDRESS: Readonly<Record<string, { readonly carrier: Carrier; readonly lines: ReadonlyArray<string> }>> = {
  NL: { carrier: "PostNL", lines: ["Northwind Retouren", "Distributieweg 12", "3045 AB Rotterdam"] },
  BE: { carrier: "PostNL", lines: ["Northwind Retouren", "Distributieweg 12", "3045 AB Rotterdam"] },
  DE: { carrier: "DHL", lines: ["Northwind Retouren", "Lagerstraße 4", "47533 Kleve"] },
  FR: { carrier: "DPD", lines: ["Northwind Retours", "12 rue du Dépôt", "59000 Lille"] }
}
const ABROAD = { carrier: "UPS" as Carrier, lines: ["Northwind Returns", "Distributieweg 12", "3045 AB Rotterdam, NL"] }

export const returnAddress = (country: string) => RETURN_ADDRESS[country] ?? ABROAD

export type PortalStore = {
  readonly handle: string
  readonly name: string
  readonly on: boolean
  readonly returnDays: number
  readonly claimDays: number
  readonly giftCardBonus: number
  readonly intro: string
  readonly done: string
  readonly claimSteps: ReadonlyArray<string>
  readonly email: string
}

const NORTHWIND: PortalStore = {
  handle: "northwind",
  name: "Northwind",
  on: true,
  returnDays: 30,
  claimDays: 60,
  giftCardBonus: 10,
  intro: "Iets terugsturen of een probleem melden? Vul je bestelnummer en e-mailadres in.",
  done:
    "We bekijken je aanvraag binnen twee werkdagen. Je krijgt een mail met het retourlabel zodra we hem hebben goedgekeurd.",
  claimSteps: ["Wat is er mis", "Foto's", "Oplossing"],
  email: "service@northwind.co"
}

/** The handles the portal answers on; `northwind-eu` is the old link from the first shipping mails. */
export function portalStore(handle: string): PortalStore | undefined {
  return handle === "northwind" || handle === "northwind-eu" ? NORTHWIND : undefined
}

/** A line that cannot go back, in the shopper's words, or null. */
export type LineRule = { readonly productId: string; readonly note: string }
export const NOT_RETURNABLE: ReadonlyArray<LineRule> = [
  { productId: "mariner-wool-beanie", note: "Mutsen nemen we om hygiënische redenen niet terug." }
]

export type OpenRequest = {
  readonly number: string
  readonly kind: ReturnKind
  readonly status: ReturnStatus
  readonly requestedAt: Date
  readonly productIds: ReadonlyArray<string>
  readonly reason: ReasonId
  readonly resolution: Resolution
  readonly exchangeTo?: string
  /** Approved: the label the shopper got by mail, and the last day to hand the parcel in. */
  readonly label?: { readonly carrier: Carrier; readonly code: string; readonly dropBy: Date }
}

/** Requests already made on the records' two `retour` orders, by Retouren's numbers. */
export const OPEN_REQUESTS: Readonly<Record<string, OpenRequest>> = {
  "5296": {
    number: "R-881",
    kind: "return",
    status: "review",
    requestedAt: at(0, 1, 30),
    productIds: ["aurora-hooded-fleece"],
    reason: "too_small",
    resolution: "exchange",
    exchangeTo: "M"
  },
  "5301": {
    number: "R-883",
    kind: "return",
    status: "awaiting_parcel",
    requestedAt: at(0, 13, 55),
    productIds: ["skyline-tote"],
    reason: "not_as_expected",
    resolution: "refund",
    label: { carrier: "UPS", code: "1Z 4R8 7W2 68 5301 3315", dropBy: at(14, 23, 59) }
  }
}

/** When the parcel arrived: a day after it was placed for a delivered order, never after now. */
export function deliveredAt(o: Order): Date | null {
  if (o.status !== "bezorgd" && o.status !== "retour") return null
  return new Date(Math.min(o.placedAt.getTime() + DAY, DEMO_NOW.date.getTime() - 2 * 3_600_000))
}

export type PortalLine = {
  readonly id: string
  readonly productId: string
  readonly title: string
  readonly size: string
  readonly price: number
  /** Why it cannot go back as a return / a claim, or null when it can. */
  readonly noReturn: string | null
  readonly noClaim: string | null
  /** Other sizes to swap to. */
  readonly exchange: ReadonlyArray<string>
}

export type PortalOrder = {
  readonly number: string
  readonly firstName: string
  readonly email: string
  readonly country: string
  readonly carrier: Carrier
  readonly delivered: Date | null
  readonly promisedAt: Date | null
  readonly total: number
  readonly lines: ReadonlyArray<PortalLine>
  readonly open: OpenRequest | null
}

const dayMonth = (d: Date) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long" }).format(d)

const closedNote = (closes: Date | null, days: number, claim: boolean) =>
  closes !== null && closes < DEMO_NOW.date
    ? `De ${claim ? "termijn om een probleem te melden" : "retourtermijn"} van ${days} dagen sloot op ${
      dayMonth(closes)
    }.`
    : null

export type LookupResult =
  | { readonly ok: true; readonly order: PortalOrder }
  | { readonly ok: false; readonly problem: "not_found" }

/** The lookup the server would do: the number and the address together, or nothing. */
export function lookupOrder(store: PortalStore, number: string, email: string): LookupResult {
  const o = order(number.trim().replace(/^#/, ""))
  const c = o === undefined ? undefined : customer(o.customerId)
  if (o === undefined || c === undefined || c.email.toLowerCase() !== email.trim().toLowerCase()) {
    return { ok: false, problem: "not_found" }
  }
  const delivered = deliveredAt(o)
  const open = OPEN_REQUESTS[o.number] ?? null
  const returnCloses = delivered === null ? null : new Date(delivered.getTime() + store.returnDays * DAY)
  const claimCloses = delivered === null ? null : new Date(delivered.getTime() + store.claimDays * DAY)
  const lines = o.lines.map((l, i): PortalLine => {
    const p = product(l.productId)
    const taken = open !== null && open.productIds.includes(l.productId)
      ? `Al aangevraagd in ${open.number}: ${STATUS_LABEL[open.status].toLowerCase()}.`
      : null
    const notDelivered = delivered === null
      ? "Nog niet bezorgd. Zodra het pakket binnen is, kun je hier terecht."
      : null
    const rule = NOT_RETURNABLE.find((r) => r.productId === l.productId)?.note ?? null
    return {
      id: `${o.number}-${i}`,
      productId: l.productId,
      title: p?.name ?? l.productId,
      size: l.size,
      price: l.price,
      noReturn: taken ?? notDelivered ?? rule ?? closedNote(returnCloses, store.returnDays, false),
      noClaim: taken ?? closedNote(claimCloses, store.claimDays, true),
      exchange: (p?.sizes ?? []).filter((s) => s !== l.size && s !== "Eén maat")
    }
  })
  return {
    ok: true,
    order: {
      number: `#${o.number}`,
      firstName: c.name.split(" ")[0] ?? c.name,
      email: c.email,
      country: c.country,
      carrier: o.carrier,
      delivered,
      promisedAt: o.promisedAt ?? null,
      total: o.total,
      lines,
      open
    }
  }
}

/** The orders the demo can look up, and what each shows. */
export const PORTAL_DEMO: ReadonlyArray<{ readonly number: string; readonly email: string; readonly shows: string }> = [
  { number: "6288", email: "yuki@example.com", shows: "ruilen of terugsturen, de muts mag niet terug" },
  { number: "5988", email: "emma.jansen@example.com", shows: "een probleem melden met foto" },
  { number: "5309", email: "luca.r@example.com", shows: "nog niet bezorgd" },
  { number: "5296", email: "astrid@example.com", shows: "aanvraag al in behandeling" },
  { number: "5301", email: "soren@example.com", shows: "goedgekeurd, met label en QR-code" }
]

/* ── quality checks by link ────────────────────────────────────────────────────────────────────── */

export type CheckKind = "sample" | "batch" | "test_order"
export type CheckStatus = "requested" | "submitted" | "approved" | "rejected"
export type Deliverable = "photos" | "video" | "batch" | "sizes"

export const CHECK_KIND_LABEL: Readonly<Record<CheckKind, string>> = {
  sample: "Monstercontrole",
  batch: "Wekelijkse batchcontrole",
  test_order: "Testbestelling dropship"
}

export const DELIVERABLE_LABEL: Readonly<Record<Deliverable, string>> = {
  photos: "Foto's",
  video: "Video",
  batch: "Batchnummer",
  sizes: "Maten gemeten"
}

export const CHECK_STATUS_LABEL: Readonly<Record<CheckStatus, string>> = {
  requested: "Aangevraagd",
  submitted: "Ingestuurd",
  approved: "Goedgekeurd",
  rejected: "Afgekeurd"
}

export type QualityCheck = {
  readonly id: string
  readonly brand: string
  readonly kind: CheckKind
  readonly productId: string
  readonly supplierId: string
  readonly contact: string
  readonly requestedBy: string
  readonly status: CheckStatus
  readonly due: Date
  readonly deliverables: ReadonlyArray<Deliverable>
  /** The sizes to measure, when `sizes` is asked. */
  readonly sizes?: ReadonlyArray<string>
  readonly note?: string
  readonly submitted?: {
    readonly at: Date
    readonly photos: number
    readonly video: boolean
    readonly batch?: string
    readonly note?: string
  }
  readonly decision?: { readonly at: Date; readonly by: string; readonly reason?: string }
}

export const QUALITY_CHECKS: ReadonlyArray<QualityCheck> = [
  {
    id: "qc-301",
    brand: "Northwind",
    kind: "batch",
    productId: "aurora-hooded-fleece",
    supplierId: "allure-fulfillment",
    contact: "Marco Rossi",
    requestedBy: PEOPLE.elena.name,
    status: "requested",
    due: at(4, 17, 0),
    deliverables: ["photos", "batch", "sizes"],
    sizes: ["S", "M", "L"],
    note:
      "De laatste batch viel klein in S. Meet de borstwijdte en de lengte van S, M en L, en fotografeer het label met het batchnummer."
  },
  {
    id: "qc-302",
    brand: "Northwind",
    kind: "batch",
    productId: "harbor-raincoat",
    supplierId: "kestrel-goods",
    contact: "Noor Visser",
    requestedBy: PEOPLE.elena.name,
    status: "rejected",
    due: at(-5, 17, 0),
    deliverables: ["photos", "batch"],
    submitted: { at: at(-6, 15, 20), photos: 4, video: false, batch: "AL-2609" },
    decision: {
      at: at(-5, 9, 45),
      by: PEOPLE.elena.name,
      reason: "De naad bij de schouder is niet getapet, dus de jas is daar niet waterdicht. Stuur een nieuwe batch."
    }
  },
  {
    id: "qc-303",
    brand: "Northwind",
    kind: "batch",
    productId: "harbor-raincoat",
    supplierId: "kestrel-goods",
    contact: "Noor Visser",
    requestedBy: PEOPLE.elena.name,
    status: "approved",
    due: at(-1, 17, 0),
    deliverables: ["photos", "video", "batch"],
    submitted: { at: at(-2, 11, 5), photos: 6, video: true, batch: "AL-2614", note: "Naden nu getapet, zie video." },
    decision: { at: at(-1, 8, 50), by: PEOPLE.elena.name }
  },
  {
    id: "qc-304",
    brand: "Northwind",
    kind: "sample",
    productId: "harbor-raincoat",
    supplierId: "kestrel-goods",
    contact: "Noor Visser",
    requestedBy: PEOPLE.sofia.name,
    status: "approved",
    due: at(-40, 17, 0),
    deliverables: ["photos", "sizes"],
    sizes: ["S", "M", "L", "XL"],
    submitted: { at: at(-42, 14, 0), photos: 8, video: false },
    decision: { at: at(-41, 10, 15), by: PEOPLE.sofia.name }
  },
  {
    id: "qc-305",
    brand: "Northwind",
    kind: "test_order",
    productId: "meridian-daypack",
    supplierId: "kestrel-goods",
    contact: "Noor Visser",
    requestedBy: PEOPLE.ethan.name,
    status: "requested",
    due: at(-3, 17, 0),
    deliverables: ["photos", "video"],
    note: "Verstuur de testbestelling zoals een klant hem krijgt, en film het uitpakken."
  }
]

export const qualityCheck = (id: string) => QUALITY_CHECKS.find((c) => c.id === id)
