import { type ComponentType, createContext, type ReactNode, useContext } from "react"

/**
 * What the affiliate portal's screens read and do, from whoever hosts them (as `supplier/source.tsx` is for the
 * supplier's): the design app from its demo stores (`demo-source.tsx`), the console from `AffiliatePortal.*` (M16
 * steps 3–5), where an affiliate signs in to one brand's programme. The markup is the design's. An affiliate sees only
 * its own links, orders and payouts: an order is its number, its article, its amount and its day, never the shopper.
 * Amounts are in whole units of the programme's currency, formatted by the host's `money`.
 */

export type Tier = "bronze" | "silver" | "gold"
export type PayoutMethod = "paypal" | "bank" | "wise"
export type ConversionStatus = "pending" | "approved" | "paid" | "reversed"

export const METHOD_LABEL: Record<PayoutMethod, string> = {
  paypal: "PayPal",
  bank: "Bankoverschrijving",
  wise: "Wise"
}

export const TIER_LABEL: Record<Tier, string> = {
  bronze: "Brons",
  silver: "Zilver",
  gold: "Goud"
}

/** A conversion waits out the return window, is then approved, and is paid on the programme's day after its month. */
export const CONVERSION_STATUS: Record<
  ConversionStatus,
  { label: string; tone: "warning" | "info" | "success" | "neutral" }
> = {
  pending: { label: "In retourtermijn", tone: "warning" },
  approved: { label: "Goedgekeurd", tone: "info" },
  paid: { label: "Uitbetaald", tone: "success" },
  reversed: { label: "Teruggedraaid", tone: "neutral" }
}

/** One of the programme's tiers, as the brand set them. */
export type TierView = { id: Tier; label: string; rate: number; from: number }

/** An order that came in through the affiliate's link or code. `at` is an ISO time. */
export type PortalConversion = {
  id: string
  at: string
  order: string
  title: string
  total: number
  commission: number
  status: ConversionStatus
  /** The link it came through; null for an order by the code alone. */
  via: string | null
}

/** A link as the lists show it. `url` is what the affiliate shares, without its scheme. */
export type PortalLink = {
  id: string
  label: string
  url: string
  clicks: number
  conversions: number
  revenue: number
  commission: number
  created_at: string
}

/** A week of the chart: its last day as "26 mei". */
export type PortalWeek = { label: string; earned: number; conversions: number; clicks: number }

export type AffiliateDashboardView = {
  /** "Nog uit te betalen". */
  owed: number
  /** "15 juni". */
  nextPayout: string
  method: PayoutMethod | null
  conversions30: number
  clicks30: number
  /** Conversions in the rolling quarter, for the next tier. */
  quarter: number
  weeks: ReadonlyArray<PortalWeek>
  recent: Array<PortalConversion>
  /** The best links, most revenue first. */
  links: Array<PortalLink>
  linksCount: number
  resourcesCount: number
  /** No link and no order yet: the first day's page. */
  fresh: boolean
}

export type LinkView = { link: PortalLink; weeks: ReadonlyArray<PortalWeek>; rows: Array<PortalConversion> }

export type Destination = { id: string; label: string; path: string }

export type Medium = "social" | "video" | "email" | "blog" | "print"

/** A month's payout. `id` is `YYYY-MM`; `payDay` epoch ms. "open" is the portal's "Loopt nog". */
export type PayoutMonthRow = {
  id: string
  label: string
  count: number
  gross: number
  reversed: number
  total: number
  status: "paid" | "open" | "approved"
  payDay: number
}

export type PayoutsPage = {
  months: Array<PayoutMonthRow>
  /** The running month: approved, and still in the window. */
  current: { label: string; approved: number; waiting: number; payDay: number } | undefined
  paidLifetime: number
  /** The day of the month payouts go out. */
  payoutDay: number
}

export type PayoutMonthView = {
  row: PayoutMonthRow
  rows: Array<PortalConversion>
  method: PayoutMethod | null
  taxId: string | null
}

export type ResourceKind = "logo" | "image" | "video" | "doc" | "guide"

/** `previewable`: an image or a PDF the browser can show as it is. */
export type PortalResource = {
  id: string
  name: string
  kind: ResourceKind
  size: string
  updated_at: string
  previewable?: boolean | undefined
}

/** Where the payouts go, as the server keeps it: the account only masked. */
export type PaymentView = { method: PayoutMethod | null; accountHint: string; taxId: string }

export type ProfileView = { name: string; email: string; code: string; tier: Tier }

/** What a write says when it is done, with "Ongedaan maken" where the host can take it back. */
export type Said = { message: string; description?: string | undefined }

export interface AffiliatePortalSource {
  /** The brand, as the portal names it: "Northwind". */
  brand: string
  money: (amount: number) => string
  tiers: ReadonlyArray<TierView>
  returnDays: number
  useProfile: () => ProfileView
  useDashboard: () => AffiliateDashboardView
  useLinks: () => Array<PortalLink>
  /** `undefined` while it loads; the route answers a link that is not theirs. */
  useLink: (id: string) => LinkView | undefined
  useDestinations: () => ReadonlyArray<Destination>
  /** The address a new link will land on, before it is made, without its scheme. */
  previewUrl: (destinationId: string, medium: Medium, campaign: string) => string
  createLink: (input: { label: string; destinationId: string; medium: Medium; campaign: string }, said: Said) => void
  /** Whether "Verwijderen" shows: the demo's seeded links are the record. */
  canRemove: (link: PortalLink) => boolean
  removeLink: (link: PortalLink, said: Said) => void
  usePayouts: () => PayoutsPage
  usePayout: (month: string) => PayoutMonthView | undefined
  useResources: () => { resources: ReadonlyArray<PortalResource>; faqs: ReadonlyArray<{ q: string; a: string }> }
  /** Downloads the file; `preview` opens an image or a PDF in a new tab, where the host can. */
  download: (r: PortalResource) => void
  preview: ((r: PortalResource) => void) | null
  usePayment: () => PaymentView
  savePayment: (p: { method: PayoutMethod; account: string; taxId: string }, done: () => void) => void
  saveName: (name: string, done: () => void) => void
  parts: {
    /** The dashboard's closing, where the host has one. */
    Closing: ComponentType<{ tier: TierView; next?: TierView | undefined; quarter: number; resources: number }> | null
  }
}

const AffiliatePortalContext = createContext<AffiliatePortalSource | null>(null)

export function AffiliatePortalProvider({ value, children }: { value: AffiliatePortalSource; children: ReactNode }) {
  return <AffiliatePortalContext.Provider value={value}>{children}</AffiliatePortalContext.Provider>
}

export function useAffiliatePortal(): AffiliatePortalSource {
  const source = useContext(AffiliatePortalContext)
  if (source === null) throw new Error("The affiliate portal needs an AffiliatePortalProvider around it.")
  return source
}

/** The tier the affiliate is on, and the one above it. */
export function tierAndNext(tiers: ReadonlyArray<TierView>, id: Tier) {
  const i = Math.max(0, tiers.findIndex((t) => t.id === id))
  return { tier: tiers[i] ?? { id, label: TIER_LABEL[id], rate: 0, from: 0 }, next: tiers[i + 1] }
}
