import { useSyncExternalStore } from "react"
import type { View } from "../view.ts"
import { RESOURCES } from "./affiliate-portal.ts"
import type { Resource } from "./affiliate-portal.ts"

/**
 * Affiliates: the partner programme from the brand's side, from `mock-data/affiliates.ts`,
 * `affiliate-program.ts` and `affiliate-data.ts`, moved to this version's clock (Monday 23 November
 * 2026) and to euros. Who is in and on which tier, who applied, November's commission waiting for
 * approval after the fourteen-day return window, and who has been asked. Nothing here is real.
 */

export type Tier = "brons" | "zilver" | "goud"

export const TIERS: ReadonlyArray<{ readonly id: Tier; readonly label: string; readonly rate: number }> = [
  { id: "brons", label: "Brons", rate: 10 },
  { id: "zilver", label: "Zilver", rate: 12 },
  { id: "goud", label: "Goud", rate: 15 }
]

export const tierOf = (id: Tier) => TIERS.find((t) => t.id === id) ?? { id, label: id, rate: 10 }

/** Days after an order before its commission can be approved: the return window. */
export const RETURN_DAYS = 14

export type Affiliate = {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly code: string
  readonly tier: Tier
  readonly joined: string
  readonly conversions: number
  readonly earned: number
  readonly channel: string
  /** What brought the most orders this month. */
  readonly top: string
}

const SETTLED: ReadonlyArray<Affiliate> = [
  {
    id: "priya-singh",
    name: "Priya Singh",
    email: "priya@creators.studio",
    code: "PRIYA10",
    tier: "goud",
    joined: "4 nov 2025",
    conversions: 184,
    earned: 2761.2,
    channel: "Instagram · 48.000 volgers",
    top: "Aurora Hooded Fleece"
  },
  {
    id: "jordan-reeves",
    name: "Jordan Reeves",
    email: "jordan@reeves.tv",
    code: "JORDAN",
    tier: "zilver",
    joined: "12 jan 2026",
    conversions: 61,
    earned: 1148.4,
    channel: "YouTube · 22.000 abonnees",
    top: "Coastline Bomber Jacket"
  },
  {
    id: "daan-mulder",
    name: "Daan Mulder",
    email: "daan@buitenmetdaan.nl",
    code: "DAAN",
    tier: "brons",
    joined: "2 mrt 2026",
    conversions: 9,
    earned: 96.3,
    channel: "Blog · buitenmetdaan.nl",
    top: "Harbor Raincoat"
  }
]

export type ApplicationStatus = "in-afwachting" | "goedgekeurd" | "afgewezen"

export type Application = {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly channel: string
  readonly audience: string
  readonly handle: string
  readonly motivation: string
  readonly applied: string
  readonly status: ApplicationStatus
  readonly reason?: string
}

const APPLICATIONS: ReadonlyArray<Application> = [
  {
    id: "sem-de-wit",
    name: "Sem de Wit",
    email: "sem@semdewit.nl",
    channel: "TikTok",
    audience: "41.000 volgers, 18 tot 24 jaar",
    handle: "tiktok.com/@semdewit",
    motivation:
      "Korte video's over basics die lang meegaan. Jullie jassen passen precies in mijn serie over de winterkast.",
    applied: "zo 22 nov",
    status: "in-afwachting"
  },
  {
    id: "yara-el-amrani",
    name: "Yara El Amrani",
    email: "yara@slowwardrobe.blog",
    channel: "Blog en nieuwsbrief",
    audience: "9.200 abonnees op de nieuwsbrief",
    handle: "slowwardrobe.blog",
    motivation:
      "Ik schrijf over duurzame garderobes en vergelijk merken op materiaal. Ik wil Northwind opnemen in mijn gids voor het najaar.",
    applied: "vr 20 nov",
    status: "in-afwachting"
  },
  {
    id: "amara-idris",
    name: "Amara Idris",
    email: "amara.id@gmail.com",
    channel: "Instagram",
    audience: "18.400 volgers, vooral NL en BE",
    handle: "instagram.com/amaraidris",
    motivation:
      "Ik draag de Aurora Hooded Fleece al een winter en krijg er wekelijks vragen over. Ik wil een code die mijn volgers echt gebruiken.",
    applied: "18 nov",
    status: "in-afwachting"
  },
  {
    id: "kai-tanaka",
    name: "Kai Tanaka",
    email: "kai@stylelab.jp",
    channel: "YouTube",
    audience: "62.000 abonnees, Japan en VS",
    handle: "youtube.com/@kaitanaka",
    motivation: "Ik maak stijlvideo's over streetwear en wil Northwind meenemen in mijn najaarsserie.",
    applied: "10 nov",
    status: "afgewezen",
    reason:
      "Je publiek overlapt met dat van een bestaande affiliate in dezelfde regio. Probeer het over 6 maanden opnieuw."
  }
]

/** Reasons the brand gives most, so a rejection is a click and still says something. */
export const REJECT_REASONS = [
  "Je publiek past nog niet bij onze doelgroep.",
  "Je publiek overlapt met dat van een affiliate in dezelfde regio.",
  "We zien nog te weinig bereik. Probeer het over 6 maanden opnieuw.",
  "We missen informatie over je kanaal. Vul je aanmelding aan."
] as const

export type PayoutLine = {
  readonly affiliateId: string
  readonly method: string
  readonly orders: number
  /** Past the return window: ready to approve. */
  readonly approvable: number
  readonly inWindow: number
  /** Taken back because the order was refunded (the Aurora's). */
  readonly reversed: number
}

const PAYOUTS: ReadonlyArray<PayoutLine> = [
  { affiliateId: "priya-singh", method: "PayPal", orders: 27, approvable: 286.4, inWindow: 118.2, reversed: 11.9 },
  {
    affiliateId: "jordan-reeves",
    method: "Bankoverschrijving",
    orders: 9,
    approvable: 98.6,
    inWindow: 41.3,
    reversed: 0
  },
  { affiliateId: "daan-mulder", method: "Wise", orders: 2, approvable: 27.8, inWindow: 12.1, reversed: 0 }
]

export const PAYOUT_MONTH = { label: "november 2026", payDay: "15 december" } as const

export type Invite = {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly tier: Tier
  readonly message: string
  readonly sent: string
  readonly expires: string
}

const INVITES: ReadonlyArray<Invite> = [
  {
    id: "femke-jansen",
    name: "Femke Jansen",
    email: "femke@kijkfemke.nl",
    tier: "zilver",
    message: "Je reviews van onze fleece deden het goed. We starten je op Zilver.",
    sent: "zo 22 nov",
    expires: "6 dec"
  }
]

/* The busy week: fourteen more affiliates and twelve more applications, with long names. */
const LONG = [
  "Maximiliaan van der Westhuizen",
  "Anne-Sophie de la Croix",
  "Konstantinos Papadopoulos",
  "Wilhelmina Schimmel"
]
const BUSY_AFFILIATES: ReadonlyArray<Affiliate> = Array.from({ length: 14 }, (_, i): Affiliate => {
  const tier = TIERS[i % 3]?.id ?? "brons"
  const name = `${LONG[i % LONG.length] ?? "Partner"} ${i + 1}`
  return {
    id: `druk-${i + 1}`,
    name,
    email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@heel-lang-creatorbureau.example.com`,
    code: `${(name.split(" ")[0] ?? "CODE").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 10)}${i + 1}`,
    tier,
    joined: `${(i % 27) + 1} ${["jun", "jul", "aug", "sep", "okt"][i % 5] ?? "okt"} 2026`,
    conversions: 4 + i * 7,
    earned: Math.round((38.5 + i * 91.25) * 100) / 100,
    channel: "Instagram · 12.000 volgers",
    top: "Mariner Wool Beanie"
  }
})
const BUSY_APPLICATIONS: ReadonlyArray<Application> = Array.from({ length: 12 }, (_, i): Application => ({
  id: `druk-aanmelding-${i + 1}`,
  name: `${LONG[(i + 1) % LONG.length] ?? "Partner"} ${i + 20}`,
  email: `aanmelding.${i + 1}@heel-lang-creatorbureau.example.com`,
  channel: ["Instagram", "TikTok", "YouTube", "Pinterest"][i % 4] ?? "Instagram",
  audience: `${(3 + i * 4).toLocaleString("nl-NL")}.000 volgers`,
  handle: `instagram.com/partner${i + 1}`,
  motivation:
    "Ik wil Northwind graag aanbevelen aan mijn publiek, dat veel vraagt naar warme jassen die er ook goed uitzien in de stad.",
  applied: `${(i % 9) + 13} nov`,
  status: "in-afwachting"
}))

/* ── the demo's own changes ────────────────────────────────────────────────────────────────────── */

export type AffiliateState = {
  readonly decisions: Readonly<
    Record<string, { readonly status: ApplicationStatus; readonly tier?: Tier; readonly reason?: string }>
  >
  readonly paused: ReadonlyArray<string>
  readonly tiers: Readonly<Record<string, Tier>>
  readonly approved: ReadonlyArray<string>
  readonly invites: ReadonlyArray<Invite>
  readonly revoked: ReadonlyArray<string>
  /** Material the brand uploaded for its affiliates, and what it took down. */
  readonly uploaded: ReadonlyArray<Resource>
  readonly removed: ReadonlyArray<string>
}

const EMPTY: AffiliateState = {
  decisions: {},
  paused: [],
  tiers: {},
  approved: [],
  invites: [],
  revoked: [],
  uploaded: [],
  removed: []
}
let state: AffiliateState = EMPTY
const listeners = new Set<() => void>()

export function setAffiliateState(next: (s: AffiliateState) => AffiliateState) {
  state = next(state)
  for (const l of listeners) l()
}

export function useAffiliateState(): AffiliateState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state
  )
}

export const getAffiliateState = () => state

/* ── what the page reads ───────────────────────────────────────────────────────────────────────── */

export type AffiliateRow = Affiliate & { readonly rate: number; readonly paused: boolean; readonly fresh: boolean }

/** Who is in: the programme's affiliates and everyone approved in the demo. */
export function affiliateRows(view: View, s: AffiliateState = state): ReadonlyArray<AffiliateRow> {
  if (view.staat === "leeg") return []
  const approvedNow = applicationRows(view, s).filter((a) => a.status === "goedgekeurd").map((a): Affiliate => ({
    id: a.id,
    name: a.name,
    email: a.email,
    code: (a.name.split(" ")[0] ?? "CODE").toUpperCase().replace(/[^A-Z]/g, ""),
    tier: s.decisions[a.id]?.tier ?? "brons",
    joined: "vandaag",
    conversions: 0,
    earned: 0,
    channel: `${a.channel} · ${a.audience}`,
    top: "—"
  }))
  const base = view.staat === "druk" ? [...SETTLED, ...BUSY_AFFILIATES] : SETTLED
  return [...base, ...approvedNow].map((a) => {
    const tier = s.tiers[a.id] ?? a.tier
    return { ...a, tier, rate: tierOf(tier).rate, paused: s.paused.includes(a.id), fresh: a.joined === "vandaag" }
  })
}

export function applicationRows(view: View, s: AffiliateState = state): ReadonlyArray<Application> {
  if (view.staat === "leeg") return []
  const base = view.staat === "druk" ? [...APPLICATIONS, ...BUSY_APPLICATIONS] : APPLICATIONS
  return base.map((a) => {
    const d = s.decisions[a.id]
    return d === undefined ? a : { ...a, status: d.status, ...(d.reason === undefined ? {} : { reason: d.reason }) }
  })
}

export type PayoutRow = PayoutLine & { readonly name: string; readonly approved: boolean }

export function payoutRows(view: View, s: AffiliateState = state): ReadonlyArray<PayoutRow> {
  if (view.staat === "leeg") return []
  const people = affiliateRows(view, s)
  const lines = view.staat === "druk"
    ? [
      ...PAYOUTS,
      ...BUSY_AFFILIATES.map((a, i): PayoutLine => ({
        affiliateId: a.id,
        method: ["Bankoverschrijving", "Wise", "PayPal"][i % 3] ?? "PayPal",
        orders: 1 + (i % 6),
        approvable: Math.round(a.earned * 7) / 100,
        inWindow: Math.round(a.earned * 3) / 100,
        reversed: 0
      }))
    ]
    : PAYOUTS
  return lines.map((l) => ({
    ...l,
    name: people.find((p) => p.id === l.affiliateId)?.name ?? l.affiliateId,
    approved: s.approved.includes(l.affiliateId)
  }))
}

export function inviteRows(view: View, s: AffiliateState = state): ReadonlyArray<Invite> {
  if (view.staat === "leeg") return []
  return [...s.invites, ...INVITES].filter((i) => !s.revoked.includes(i.id))
}

/** What the affiliates can download in their portal: logos, photos, guides. Newest first. */
export function resourceRows(view: View, s: AffiliateState = state): ReadonlyArray<Resource> {
  const base = view.staat === "leeg" ? [] : RESOURCES
  return [...s.uploaded, ...base].filter((r) => !s.removed.includes(r.id))
}

/** The counts the menu and the page both show. */
export function affiliateCounts(view: View, s: AffiliateState = state) {
  const payouts = payoutRows(view, s)
  return {
    actief: affiliateRows(view, s).filter((a) => !a.paused).length,
    aanmeldingen: applicationRows(view, s).filter((a) => a.status === "in-afwachting").length,
    uitbetalingen: payouts.filter((p) => !p.approved && p.approvable > 0).length,
    teKeuren: payouts.filter((p) => !p.approved).reduce((n, p) => n + p.approvable, 0),
    uitnodigingen: inviteRows(view, s).length,
    materiaal: resourceRows(view, s).length
  }
}
