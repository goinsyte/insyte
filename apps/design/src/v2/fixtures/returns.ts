import { useSyncExternalStore } from "react"
import type { Tone } from "../ui/badge.tsx"
import { customer, ORDERS, product } from "./records.ts"
import type { Carrier, Order } from "./records.ts"
import { DEMO_NOW, PEOPLE } from "./workspace.ts"

/**
 * Retouren: returns and claims on Northwind's real orders (`records.ts`), after `/app`'s
 * `mock-data/returns.ts` and `lib/returns.ts`. A RETURN is the shopper sending something back; a
 * CLAIM is a problem with what arrived, where nothing may need to come back.
 *
 * The week agrees with Analyse (`fixtures/analytics.ts`): every one of the 41 refunded orders has its
 * return here, resolved as a refund (26 with an Aurora in them), with the reasons Analyse ranks
 * (23 valt te klein, 21 of them the Aurora; 6 niet zoals op de foto; 5 te groot; 4 anders; 3
 * beschadigd), and the 7 exchanges. Open today: Astrid Berg's Aurora in S (#5296, R-881), where the
 * Retouragent's exchange proposal waits on Start (`home.ts`, `omruil-5321`), Soren Nilsson's
 * (#5301), and a handful in every later state.
 */

const DAY = 86_400_000
const HOUR = 3_600_000
const NOW = DEMO_NOW.date.getTime()
/** Sunday 22 November, evening: the week's resolutions close before Analyse's week does. */
const WEEK_END = new Date(2026, 10, 22, 20, 0).getTime()

export type ReturnKind = "retour" | "claim"
export type ReturnStatus =
  | "te-beoordelen"
  | "wacht-op-pakket"
  | "onderweg"
  | "ontvangen"
  | "klaar"
  | "afgehandeld"
  | "afgewezen"
export type Resolution = "terugbetalen" | "ruilen" | "cadeaubon" | "nieuw-artikel"
export type Reason = "te-klein" | "te-groot" | "niet-zoals-foto" | "anders" | "beschadigd" | "verkeerd-artikel"

export const STATUS: Readonly<Record<ReturnStatus, { readonly label: string; readonly tone: Tone }>> = {
  "te-beoordelen": { label: "Te beoordelen", tone: "warn" },
  "wacht-op-pakket": { label: "Wacht op pakket", tone: "neutral" },
  onderweg: { label: "Onderweg", tone: "neutral" },
  ontvangen: { label: "Ontvangen", tone: "accent" },
  klaar: { label: "Klaar om af te handelen", tone: "accent" },
  afgehandeld: { label: "Afgehandeld", tone: "good" },
  afgewezen: { label: "Afgewezen", tone: "neutral" }
}

export const RESOLUTION_LABEL: Readonly<Record<Resolution, string>> = {
  terugbetalen: "Terugbetalen",
  ruilen: "Ruilen",
  cadeaubon: "Cadeaubon",
  "nieuw-artikel": "Nieuw artikel"
}

/** What a resolution gives the shopper, as the clause after "De klant krijgt". */
export const RESOLUTION_DETAIL: Readonly<Record<Resolution, string>> = {
  terugbetalen: "het geld terug op de oorspronkelijke betaalmethode",
  ruilen: "een andere maat of kleur, zonder extra kosten",
  cadeaubon: "een cadeaubon voor het bedrag plus 10% bonus",
  "nieuw-artikel": "een nieuw exemplaar, zonder iets terug te sturen"
}

export const REASON_LABEL: Readonly<Record<Reason, string>> = {
  "te-klein": "Valt te klein",
  "te-groot": "Valt te groot",
  "niet-zoals-foto": "Niet zoals op de foto",
  anders: "Anders",
  beschadigd: "Beschadigd",
  "verkeerd-artikel": "Verkeerd artikel"
}

/** The reasons that count toward a product's complaint rate. */
export const QUALITY: ReadonlySet<Reason> = new Set(["beschadigd", "verkeerd-artikel"])

export const REJECT_REASONS: ReadonlyArray<string> = [
  "Buiten de retourtermijn",
  "Artikel is niet retourneerbaar (sale of hygiëne)",
  "Gedragen of gewassen",
  "Geen foto's van het probleem"
]

/** The settings the screens read (Instellingen → Retouren owns them). */
export const RETURN_SETTINGS = {
  returnDays: 30,
  claimDays: 60,
  reviewHours: 48,
  giftCardBonus: 10,
  portalHandle: "northwind-eu",
  address: "Northwind Retouren, Distributieweg 12, 3045 AB Rotterdam",
  addressAbroad: "Northwind Returns c/o Allure Fulfillment, Lagerstraße 4, 41460 Neuss"
} as const

/** A photo the shopper added in the portal. */
type ReturnPhoto = { readonly id: string; readonly name: string; readonly caption: string }

/** One line coming back, when a return has more than one. */
type ReturnItem = {
  readonly productId: string
  readonly size: string
  readonly qty: number
  readonly unitPrice: number
}

/** What the resolution made in Shopify: a gift card or code, a new order, or why it could not. */
export type InShopify =
  | { readonly state: "maken" }
  | { readonly state: "gemaakt"; readonly code?: string; readonly order?: string }
  | { readonly state: "mislukt"; readonly reason: string }

export type ReturnEvent = { readonly at: number; readonly who: string; readonly text: string; readonly tone?: Tone }

export type ReturnRecord = {
  /** The URL id: `/v2/retouren/r-881`. */
  readonly id: string
  /** "R-881". */
  readonly number: string
  readonly kind: ReturnKind
  readonly orderNumber: string
  readonly customerId: string
  readonly productId: string
  readonly size: string
  readonly qty: number
  readonly unitPrice: number
  readonly reason: Reason
  /** The shopper's own words. */
  readonly note: string
  readonly requested: Resolution
  readonly exchangeTo?: string
  readonly status: ReturnStatus
  readonly createdAt: number
  readonly deliveredAt: number
  readonly label?: {
    readonly carrier: Carrier
    readonly tracking: string
    readonly madeAt: number
    readonly sentAt?: number
    /** Set when the carrier refused to make it. */
    readonly failed?: string
    /** Sent by the shopper with their own carrier: the tracking they gave. */
    readonly byShopper?: boolean
  }
  readonly resolution?: {
    readonly kind: Resolution
    readonly amount: number
    readonly at: number
    readonly by: string
    readonly shopify?: InShopify
  }
  readonly rejectReason?: string
  readonly assignee?: string
  readonly events: ReadonlyArray<ReturnEvent>
  /** The agent's proposal on Start that decides this return (`home.ts`). */
  readonly proposalId?: string
  readonly photos?: ReadonlyArray<ReturnPhoto>
  /** Every line coming back, when there is more than the one above. */
  readonly items?: ReadonlyArray<ReturnItem>
}

/** The lines coming back: the return's own, or each of several. */
export const itemsOf = (r: ReturnRecord): ReadonlyArray<ReturnItem> =>
  r.items ?? [{ productId: r.productId, size: r.size, qty: r.qty, unitPrice: r.unitPrice }]

export const amountOf = (r: ReturnRecord) => itemsOf(r).reduce((n, i) => n + i.unitPrice * i.qty, 0)

/** The reasons the portal asks a photo for: damage, the wrong item, and "not like the picture". */
const PHOTO_REASONS: ReadonlySet<Reason> = new Set(["beschadigd", "verkeerd-artikel", "niet-zoals-foto"])
export const photoRequired = (r: ReturnRecord) => PHOTO_REASONS.has(r.reason)
export const photoMissing = (r: ReturnRecord) => photoRequired(r) && (r.photos ?? []).length === 0

/** A tracking number as carriers write it: letters, digits and dashes. */
export const validTracking = (v: string) => /^[A-Z0-9-]{4,40}$/.test(v.trim().toUpperCase())

/** A gift card code as Shopify makes it: four groups of four. */
export function giftCardCode(r: ReturnRecord): string {
  const seed = Number(r.number.slice(2)) * 7919
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const pick = (i: number) => chars[(seed * (i + 3) + i * 131) % chars.length] ?? "X"
  return [0, 1, 2, 3].map((g) => [0, 1, 2, 3].map((i) => pick(g * 4 + i)).join("")).join("-")
}
export const deadlineOf = (r: ReturnRecord) => r.createdAt + RETURN_SETTINGS.reviewHours * HOUR
export const pastDeadline = (r: ReturnRecord) => r.status === "te-beoordelen" && deadlineOf(r) < NOW
export const windowDays = (
  r: ReturnRecord
) => (r.kind === "claim" ? RETURN_SETTINGS.claimDays : RETURN_SETTINGS.returnDays)

export function windowOf(
  r: ReturnRecord
): { readonly inside: boolean; readonly day: number; readonly days: number; readonly closes: Date } {
  const days = windowDays(r)
  const day = Math.max(1, Math.ceil((r.createdAt - r.deliveredAt) / DAY))
  return { inside: day <= days, day, days, closes: new Date(r.deliveredAt + days * DAY) }
}

/** The next size up, for an exchange: "S" becomes "M". */
export function sizeUp(productId: string, size: string): string {
  const sizes = product(productId)?.sizes ?? []
  const at = sizes.indexOf(size)
  return sizes[at + 1] ?? size
}

const TRACK: Readonly<Record<Carrier, string>> = {
  PostNL: "3SNWD00182",
  DHL: "JJD00039000712",
  DPD: "052229473",
  UPS: "1Z999AA101"
}
const trackOf = (carrier: Carrier, n: number) => `${TRACK[carrier]}${String(n * 4127 + 3301).slice(-5)}`

/* ── building the week ─────────────────────────────────────────────────────────────────────────── */

const TEAM = [PEOPLE.sofia.name, PEOPLE.ethan.name, PEOPLE.elena.name, PEOPLE.liam.name] as const
const AURORA = "aurora-hooded-fleece"

/** The 41 refunds' reasons, in order: the Aurora's 26, then the 15 others (Analyse's ranking). */
const AURORA_REASONS: ReadonlyArray<Reason> = [
  ...Array.from({ length: 21 }, () => "te-klein" as const),
  "niet-zoals-foto",
  "niet-zoals-foto",
  "te-groot",
  "te-groot",
  "anders"
]
const OTHER_REASONS: ReadonlyArray<Reason> = [
  "te-klein",
  "te-klein",
  "niet-zoals-foto",
  "niet-zoals-foto",
  "niet-zoals-foto",
  "niet-zoals-foto",
  "te-groot",
  "te-groot",
  "te-groot",
  "anders",
  "anders",
  "anders",
  "beschadigd",
  "beschadigd",
  "beschadigd"
]

const NOTES: Readonly<Record<Reason, ReadonlyArray<string>>> = {
  "te-klein": [
    "Valt kleiner dan verwacht, vooral over de schouders.",
    "Mouwen te kort, de maattabel klopt niet.",
    "Te strak, ik heb normaal altijd S."
  ],
  "te-groot": ["Te ruim in de taille.", "Valt erg groot."],
  "niet-zoals-foto": ["De kleur is in het echt veel grijzer dan op de foto.", "Stof dunner dan ik dacht."],
  anders: ["Twee keer dezelfde besteld, ik stuur er één terug."],
  beschadigd: ["Een naad bij de schouder was open bij aankomst.", "Er zat een vlek op de voorkant."],
  "verkeerd-artikel": ["Ik kreeg een zwarte in plaats van de olijfgroene."]
}

type Draft = Omit<ReturnRecord, "id" | "number">

function lineOf(o: Order, preferAurora: boolean) {
  return (preferAurora ? o.lines.find((l) => l.productId === AURORA) : undefined) ?? o.lines[0]
}

function draft(o: Order, spec: {
  readonly kind?: ReturnKind
  readonly reason: Reason
  readonly requested: Resolution
  readonly status: ReturnStatus
  readonly createdAt: number
  readonly preferAurora?: boolean
  readonly noteAt?: number
  readonly events?: ReadonlyArray<ReturnEvent>
  readonly exchange?: boolean
  readonly label?: ReturnRecord["label"]
  readonly resolution?: ReturnRecord["resolution"]
  readonly rejectReason?: string
  readonly assignee?: string
  readonly proposalId?: string
}): Draft {
  const line = lineOf(o, spec.preferAurora === true)
  const name = customer(o.customerId)?.name ?? "De klant"
  const notes = NOTES[spec.reason]
  const kind = spec.kind ?? (QUALITY.has(spec.reason) ? "claim" : "retour")
  return {
    kind,
    orderNumber: o.number,
    customerId: o.customerId,
    productId: line?.productId ?? AURORA,
    size: line?.size ?? "M",
    qty: 1,
    unitPrice: line?.price ?? 0,
    reason: spec.reason,
    note: notes[(spec.noteAt ?? Number(o.number)) % notes.length] ?? "",
    requested: spec.requested,
    ...(spec.exchange === true && line !== undefined ? { exchangeTo: sizeUp(line.productId, line.size) } : {}),
    status: spec.status,
    createdAt: spec.createdAt,
    deliveredAt: o.placedAt.getTime() + 60 * HOUR,
    ...(spec.label === undefined ? {} : { label: spec.label }),
    ...(spec.resolution === undefined ? {} : { resolution: spec.resolution }),
    ...(spec.rejectReason === undefined ? {} : { rejectReason: spec.rejectReason }),
    ...(spec.assignee === undefined ? {} : { assignee: spec.assignee }),
    ...(spec.proposalId === undefined ? {} : { proposalId: spec.proposalId }),
    events: [
      {
        at: spec.createdAt,
        who: name,
        text: kind === "claim" ? "Claim gemeld in het retourportaal" : "Retour aangevraagd in het retourportaal"
      },
      ...(spec.events ?? [])
    ]
  }
}

function build(): ReadonlyArray<ReturnRecord> {
  const drafts: Array<Draft> = []
  const used = new Set<string>()

  // The week's 41 refunds, one per refunded order.
  let a = 0
  let b = 0
  for (const o of ORDERS.toReversed()) {
    if (o.status !== "terugbetaald") continue
    used.add(o.number)
    const aurora = o.lines.some((l) => l.productId === AURORA)
    const reason = aurora ? AURORA_REASONS[a++] ?? "te-klein" : OTHER_REASONS[b++] ?? "anders"
    const created = Math.min(o.placedAt.getTime() + 66 * HOUR, WEEK_END - 30 * HOUR)
    const by = TEAM[Number(o.number) % TEAM.length] ?? PEOPLE.sofia.name
    const line = lineOf(o, aurora)
    const amount = line?.price ?? 0
    const resolved = Math.min(created + 28 * HOUR, WEEK_END)
    const carrier = o.carrier
    drafts.push(draft(o, {
      reason,
      requested: "terugbetalen",
      status: "afgehandeld",
      createdAt: created,
      preferAurora: aurora,
      label: { carrier, tracking: trackOf(carrier, Number(o.number)), madeAt: created + HOUR, sentAt: created + HOUR },
      resolution: { kind: "terugbetalen", amount, at: resolved, by },
      events: [
        { at: created + HOUR, who: by, text: `Goedgekeurd en retourlabel van ${carrier} verstuurd` },
        { at: resolved - 4 * HOUR, who: carrier, text: "Bezorgd bij het retouradres" },
        { at: resolved, who: by, text: `Terugbetaald op de oorspronkelijke betaalmethode · € ${amount}` }
      ]
    }))
  }

  // Delivered last week and not refunded: the exchanges and the returns still open.
  const pool = ORDERS.toReversed().filter((o) =>
    o.status === "bezorgd" && !used.has(o.number) && o.placedAt.getTime() < NOW - 4 * DAY &&
    !["5318", "5322"].includes(o.number) && o.lines.some((l) => (product(l.productId)?.sizes.length ?? 0) > 1)
  )
  const take = (step: number, at: number) => {
    const o = pool[(at * step) % pool.length] as Order
    pool.splice(pool.indexOf(o), 1)
    return o
  }

  // The week's 7 exchanges, each to the next size up.
  for (let i = 0; i < 7; i++) {
    const o = take(7, i + 1)
    const created = Math.min(o.placedAt.getTime() + 70 * HOUR, WEEK_END - 40 * HOUR)
    const by = TEAM[i % TEAM.length] ?? PEOPLE.sofia.name
    const resolved = Math.min(created + 36 * HOUR, WEEK_END)
    drafts.push(draft(o, {
      reason: i % 3 === 2 ? "te-groot" : "te-klein",
      requested: "ruilen",
      exchange: true,
      status: "afgehandeld",
      createdAt: created,
      noteAt: i,
      label: {
        carrier: o.carrier,
        tracking: trackOf(o.carrier, Number(o.number)),
        madeAt: created + 2 * HOUR,
        sentAt: created + 2 * HOUR
      },
      resolution: { kind: "ruilen", amount: 0, at: resolved, by },
      events: [
        { at: created + 2 * HOUR, who: by, text: `Goedgekeurd en retourlabel van ${o.carrier} verstuurd` },
        { at: resolved, who: by, text: "Afgehandeld: ruilbestelling gemaakt in Shopify" }
      ]
    }))
  }

  // Still open, one or more in every later state.
  const open = (
    status: ReturnStatus,
    reason: Reason,
    requested: Resolution,
    hoursAgo: number,
    events: (created: number, carrier: Carrier, n: number) => ReadonlyArray<ReturnEvent>,
    extra: Partial<Parameters<typeof draft>[1]> = {}
  ) => {
    const created = NOW - hoursAgo * HOUR
    // An order delivered well before the return was asked for.
    const o = pool.find((x) => x.placedAt.getTime() + 66 * HOUR < created) ?? take(5, drafts.length)
    pool.splice(pool.indexOf(o), 1)
    const n = Number(o.number)
    drafts.push(draft(o, {
      reason,
      requested,
      status,
      createdAt: created,
      ...(status === "te-beoordelen" || status === "afgewezen" ? {} : {
        label: { carrier: o.carrier, tracking: trackOf(o.carrier, n), madeAt: created + HOUR, sentAt: created + HOUR }
      }),
      events: events(created, o.carrier, n),
      ...extra
    }))
  }
  open("wacht-op-pakket", "te-groot", "terugbetalen", 30, (c, carrier) => [
    { at: c + 0.5 * HOUR, who: PEOPLE.sofia.name, text: "Goedgekeurd" },
    { at: c + HOUR, who: PEOPLE.sofia.name, text: `Retourlabel van ${carrier} verstuurd` }
  ])
  open("wacht-op-pakket", "niet-zoals-foto", "cadeaubon", 8, (c, carrier) => [
    { at: c + 0.5 * HOUR, who: "Retouragent", text: `Toegewezen aan ${PEOPLE.sofia.name}` },
    { at: c + HOUR, who: PEOPLE.sofia.name, text: `Goedgekeurd en retourlabel van ${carrier} verstuurd` }
  ], { assignee: PEOPLE.sofia.name })
  open("onderweg", "te-klein", "ruilen", 70, (c, carrier) => [
    { at: c + 2 * HOUR, who: PEOPLE.ethan.name, text: `Goedgekeurd en retourlabel van ${carrier} verstuurd` },
    { at: NOW - 20 * HOUR, who: carrier, text: `Pakket aangenomen bij een ${carrier}-punt` }
  ], { exchange: true })
  open("ontvangen", "te-groot", "terugbetalen", 100, (c, carrier) => [
    { at: c + HOUR, who: PEOPLE.ethan.name, text: `Goedgekeurd en retourlabel van ${carrier} verstuurd` },
    { at: NOW - 40 * HOUR, who: carrier, text: "Bezorgd bij het retouradres" },
    { at: NOW - 6 * HOUR, who: PEOPLE.liam.name, text: "Ontvangen gemarkeerd" }
  ])
  open("klaar", "beschadigd", "nieuw-artikel", 104, (c, carrier) => [
    { at: c + HOUR, who: PEOPLE.sofia.name, text: `Goedgekeurd en retourlabel van ${carrier} verstuurd` },
    { at: NOW - 60 * HOUR, who: carrier, text: "Bezorgd bij het retouradres" },
    { at: NOW - 30 * HOUR, who: PEOPLE.liam.name, text: "Ontvangen en gecontroleerd: beschadiging klopt" }
  ])
  open("te-beoordelen", "verkeerd-artikel", "nieuw-artikel", 52, (c) => [
    { at: c + HOUR, who: "Retouragent", text: "Notitie: geen foto bijgevoegd, gevraagd aan de klant" }
  ])
  open("afgewezen", "te-klein", "terugbetalen", 90, (c) => [
    { at: c + 10 * HOUR, who: PEOPLE.sofia.name, text: "Afgewezen: gedragen of gewassen" }
  ], { rejectReason: "Gedragen of gewassen. Ruilen kan wel, binnen 30 dagen." })

  // Soren Nilsson, #5301: asked for a label in Inbox at 13:55 (the tote is smaller than he thought);
  // the Retouragent sent a UPS label at 14:19 (ticket #5137), so it waits for the parcel.
  const soren = ORDERS.find((o) => o.number === "5301") as Order
  const sentAt = new Date(2026, 10, 23, 14, 19).getTime()
  drafts.push(draft(soren, {
    reason: "niet-zoals-foto",
    requested: "terugbetalen",
    status: "wacht-op-pakket",
    createdAt: new Date(2026, 10, 23, 13, 55).getTime(),
    noteAt: 1,
    label: { carrier: "UPS", tracking: trackOf("UPS", 5301), madeAt: sentAt, sentAt },
    events: [{ at: sentAt, who: "Retouragent", text: "Retourlabel van UPS gemaakt en gemaild (ticket #5137)" }]
  }))

  // Astrid Berg, #5296: the Aurora in S, too small. The label was made at night; the Retouragent
  // wants to offer an M instead of a refund and asks first (Start, `omruil-5321`).
  const astrid = ORDERS.find((o) => o.number === "5296") as Order
  const asked = new Date(2026, 10, 23, 1, 30).getTime()
  drafts.push(draft(astrid, {
    reason: "te-klein",
    requested: "terugbetalen",
    status: "te-beoordelen",
    createdAt: asked,
    preferAurora: true,
    noteAt: 0,
    label: { carrier: "PostNL", tracking: trackOf("PostNL", 5296), madeAt: new Date(2026, 10, 23, 1, 37).getTime() },
    proposalId: "omruil-5321",
    events: [
      {
        at: new Date(2026, 10, 23, 1, 37).getTime(),
        who: "Retouragent",
        text: "Retourlabel van PostNL gemaakt, nog niet verstuurd"
      },
      {
        at: new Date(2026, 10, 23, 13, 47).getTime(),
        who: "Retouragent",
        text: "Stelt een omruiling naar maat M voor in plaats van terugbetalen; wacht op een akkoord"
      }
    ]
  }))

  // Numbered in the order they came in, so Astrid's is R-881 (the number Start's proposal reads).
  const sorted = drafts.toSorted((x, y) => x.createdAt - y.createdAt)
  const first = 881 - sorted.findIndex((d) => d.orderNumber === "5296")
  return sorted.map((d, i) => ({ ...d, id: `r-${first + i}`, number: `R-${first + i}` })).toReversed()
}

/**
 * What the shoppers added and what went wrong, on the open ones: photos where the portal asked for
 * them (the wrong-item claim has none, which the Retouragent noted), an exchange of two pieces, a label
 * the carrier could not make, and the exchanges' new orders in Shopify. The week's counts stay as
 * Analyse reads them.
 */
function decorate(all: ReadonlyArray<ReturnRecord>): ReadonlyArray<ReturnRecord> {
  const open = (status: ReturnStatus, reason: Reason) => all.find((x) => x.status === status && x.reason === reason)
  const damaged = open("klaar", "beschadigd")
  const giftCard = all.find((x) => x.status === "wacht-op-pakket" && x.requested === "cadeaubon")
  const failed = open("wacht-op-pakket", "te-groot")
  const twoPieces = all.find((x) =>
    x !== damaged && x !== giftCard && x !== failed && x.proposalId === undefined && x.requested === "ruilen" &&
    (ORDERS.find((o) => o.number === x.orderNumber)?.lines.some((l) => l.productId !== x.productId) ?? false)
  )
  const twoOrder = twoPieces === undefined ? undefined : ORDERS.find((o) => o.number === twoPieces.orderNumber)
  const second = twoOrder?.lines.find((l) => l.productId !== twoPieces?.productId)
  return all.map((x) => {
    if (x === damaged) {
      return {
        ...x,
        photos: [
          { id: "p1", name: "naad-schouder.jpg", caption: "De naad bij de linkerschouder, open bij aankomst" },
          { id: "p2", name: "label-binnenkant.jpg", caption: "Het waslabel, met de maat en de partij" }
        ]
      }
    }
    if (x === giftCard) {
      return {
        ...x,
        photos: [{ id: "p1", name: "kleur-bij-daglicht.jpg", caption: "Bij daglicht, naast de productfoto" }]
      }
    }
    if (x === failed && x.label !== undefined) {
      return {
        ...x,
        label: {
          carrier: x.label.carrier,
          tracking: "",
          madeAt: x.label.madeAt,
          failed: "het huisnummer ontbreekt in het adres van de klant"
        },
        events: [
          ...x.events.slice(0, -1),
          {
            at: x.label.madeAt,
            who: x.label.carrier,
            text: "Retourlabel kon niet worden gemaakt: adres onvolledig",
            tone: "bad" as const
          }
        ]
      }
    }
    if (x === twoPieces && second !== undefined) {
      return {
        ...x,
        items: [
          { productId: x.productId, size: x.size, qty: x.qty, unitPrice: x.unitPrice },
          { productId: second.productId, size: second.size, qty: 1, unitPrice: second.price }
        ]
      }
    }
    if (x.resolution?.kind === "ruilen") {
      return {
        ...x,
        resolution: { ...x.resolution, shopify: { state: "gemaakt" as const, order: `#${x.orderNumber}-R1` } }
      }
    }
    return x
  })
}

/** Every return and claim, newest first. */
export const RETURNS: ReadonlyArray<ReturnRecord> = decorate(build())

/* ── the visit's changes ───────────────────────────────────────────────────────────────────────── */

type ReturnsState = {
  readonly patch: Readonly<Record<string, Partial<ReturnRecord>>>
  readonly created: ReadonlyArray<ReturnRecord>
}

let state: ReturnsState = { patch: {}, created: [] }
const listeners = new Set<() => void>()
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
const emit = () => {
  for (const l of listeners) l()
}

export const useReturnsState = () => useSyncExternalStore(subscribe, () => state)

/** Change returns; gives back what was, for the toast's undo. */
export function changeReturns(next: (s: ReturnsState) => ReturnsState): ReturnsState {
  const before = state
  state = next(state)
  emit()
  return before
}

export function restoreReturns(to: ReturnsState) {
  state = to
  emit()
}

let tick = 0
/** "Now" for a change in this visit: the demo's clock, a second on per change. */
export const returnsNow = () => NOW + ++tick * 1000

/** Move one return: its new fields and a line in its history. */
export function moveReturn(
  s: ReturnsState,
  r: ReturnRecord,
  fields: Partial<ReturnRecord>,
  text: string,
  who: string
): ReturnsState {
  const current = { ...r, ...s.patch[r.id] }
  const events = [...current.events, { at: returnsNow(), who, text }]
  const next = { ...s.patch[r.id], ...fields, events }
  if (s.created.some((c) => c.id === r.id)) {
    return { ...s, created: s.created.map((c) => (c.id === r.id ? { ...c, ...next } : c)) }
  }
  return { ...s, patch: { ...s.patch, [r.id]: next } }
}

const cache = new WeakMap<ReturnsState, ReadonlyArray<ReturnRecord>>()

/** Every return with this visit's changes, newest first. */
export function returnsOf(s: ReturnsState = state): ReadonlyArray<ReturnRecord> {
  const hit = cache.get(s)
  if (hit !== undefined) return hit
  const all = [...s.created, ...RETURNS.map((r) => (s.patch[r.id] === undefined ? r : { ...r, ...s.patch[r.id] }))]
  cache.set(s, all)
  return all
}

export const findReturn = (id: string, s: ReturnsState = state) => returnsOf(s).find((r) => r.id === id.toLowerCase())
export const orderReturns = (orderNumber: string, s: ReturnsState = state) =>
  returnsOf(s).filter((r) => r.orderNumber === orderNumber)
export const customerReturns = (customerId: string, s: ReturnsState = state) =>
  returnsOf(s).filter((r) => r.customerId === customerId)

/** A return started by a person, from an order (on the order's page or in Retouren). */
export function startReturn(input: {
  readonly order: Order
  readonly productId: string
  readonly size: string
  readonly price: number
  readonly reason: Reason
  readonly requested: Resolution
  readonly note: string
  readonly by: string
}): ReturnRecord {
  const highest = Math.max(...returnsOf().map((r) => Number(r.number.slice(2))))
  const n = highest + 1
  const at = returnsNow()
  const record: ReturnRecord = {
    id: `r-${n}`,
    number: `R-${n}`,
    kind: QUALITY.has(input.reason) ? "claim" : "retour",
    orderNumber: input.order.number,
    customerId: input.order.customerId,
    productId: input.productId,
    size: input.size,
    qty: 1,
    unitPrice: input.price,
    reason: input.reason,
    note: input.note,
    requested: input.requested,
    ...(input.requested === "ruilen" ? { exchangeTo: sizeUp(input.productId, input.size) } : {}),
    status: "te-beoordelen",
    createdAt: at,
    deliveredAt: input.order.placedAt.getTime() + 60 * HOUR,
    events: [{ at, who: input.by, text: "Retour gestart vanaf de bestelling" }]
  }
  changeReturns((s) => ({ ...s, created: [record, ...s.created] }))
  return record
}

/* ── the counts ────────────────────────────────────────────────────────────────────────────────── */

export const toReview = (s: ReturnsState = state) => returnsOf(s).filter((r) => r.status === "te-beoordelen")
export const awaitingParcel = (s: ReturnsState = state) =>
  returnsOf(s).filter((r) => r.status === "wacht-op-pakket" || r.status === "onderweg")
export const readyToResolve = (s: ReturnsState = state) =>
  returnsOf(s).filter((r) => r.status === "ontvangen" || r.status === "klaar")

const inWeek = (r: ReturnRecord) =>
  r.resolution !== undefined && r.resolution.at <= WEEK_END && r.resolution.at > WEEK_END - 7 * DAY
/** Last week's refunds and exchanges, as Analyse counts them: 41 and 7. */
export const weekRefunds = () => RETURNS.filter((r) => inWeek(r) && r.resolution?.kind === "terugbetalen")
export const weekExchanges = () => RETURNS.filter((r) => inWeek(r) && r.resolution?.kind === "ruilen")
export const weekAuroraRefunds = () => weekRefunds().filter((r) => r.productId === AURORA)
