import { Context, Schema } from "effect"
import { UndoTicket } from "../../shared/domain/Undo.ts"

/*
 * The affiliate programme (M16 steps 3–5; widgets/06 Parts B and C; domain.md §14, §12.10). Money is in minor units
 * of the store's currency; times are epoch ms; a month is `YYYY-MM` (UTC). What an affiliate reads never names the
 * shopper: an order is its number, its amount, its status and its day.
 */

export const Tier = Schema.Literals(["bronze", "silver", "gold"])
export type Tier = typeof Tier.Type

export const Medium = Schema.Literals(["social", "video", "email", "blog", "print"])
export type Medium = typeof Medium.Type

export const PaymentMethod = Schema.Literals(["paypal", "bank", "wise"])
export type PaymentMethod = typeof PaymentMethod.Type

export const ConversionStatus = Schema.Literals(["pending", "approved", "paid", "reversed"])
export type ConversionStatus = typeof ConversionStatus.Type

/** A month's payout: running (no row yet), closed and approvable, approved by the brand, marked paid. */
export const PayoutStatus = Schema.Literals(["open", "approvable", "approved", "paid"])
export type PayoutStatus = typeof PayoutStatus.Type

/** The Shopify discount for an affiliate's code: asked for, made, refused (with the reason), or no store to make it. */
export const DiscountState = Schema.Literals(["pending", "made", "failed", "off"])
export type DiscountState = typeof DiscountState.Type

export const TierDef = Schema.Struct({
  tier: Tier,
  rate: Schema.Finite,
  /** Approved conversions in the rolling quarter from which the tier applies. */
  threshold: Schema.Int
})
export type TierDef = typeof TierDef.Type

export const Faq = Schema.Struct({ q: Schema.String, a: Schema.String })

export class ProgramView extends Schema.Class<ProgramView>("affiliates/ProgramView")({
  /** The brand started its programme (its first invitation, or its settings saved); before that, the defaults. */
  started: Schema.Boolean,
  enabled: Schema.Boolean,
  returnDays: Schema.Int,
  payoutDay: Schema.Int,
  attributionDays: Schema.Int,
  defaultTier: Tier,
  discountPercent: Schema.Int,
  tiers: Schema.Array(TierDef),
  rejectReasons: Schema.Array(Schema.String),
  faqs: Schema.Array(Faq),
  /** The public application page, a console path: `/partners/<slug>`; empty until the programme is started. */
  applyPath: Schema.String,
  currency: Schema.String,
  /** A Shopify store is there to make the codes' discounts in. */
  storeConnected: Schema.Boolean
}) {}

// ─── The operator's side (Part C) ────────────────────────────────────────────────────────────────────────────────────

export class AffiliateRow extends Schema.Class<AffiliateRow>("affiliates/AffiliateRow")({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  code: Schema.String,
  tier: Tier,
  rate: Schema.Finite,
  status: Schema.Literals(["active", "paused"]),
  /** Conversions not reversed. */
  conversions: Schema.Int,
  /** Commission to date, reversals taken off, pending included. */
  earnedMinor: Schema.Int,
  joinedAt: Schema.Finite,
  discount: DiscountState,
  discountError: Schema.NullOr(Schema.String)
}) {}

export class AffiliateList extends Schema.Class<AffiliateList>("affiliates/AffiliateList")({
  rows: Schema.Array(AffiliateRow),
  counts: Schema.Struct({
    active: Schema.Int,
    paused: Schema.Int,
    pendingApplications: Schema.Int,
    invites: Schema.Int
  }),
  /** Σ approvable of closed months not approved yet. */
  toApproveMinor: Schema.Int,
  currency: Schema.String
}) {}

export class AffiliateDetail extends Schema.Class<AffiliateDetail>("affiliates/AffiliateDetail")({
  affiliate: AffiliateRow,
  /** The running month: approved and still in the window. */
  thisMonthMinor: Schema.Int,
  currency: Schema.String,
  /** How the money goes, masked (never the account itself). */
  payment: Schema.NullOr(Schema.Struct({ method: PaymentMethod, hint: Schema.String }))
}) {}

export class ApplicationRow extends Schema.Class<ApplicationRow>("affiliates/ApplicationRow")({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  businessName: Schema.NullOr(Schema.String),
  country: Schema.NullOr(Schema.String),
  channel: Schema.NullOr(Schema.String),
  audience: Schema.NullOr(Schema.String),
  motivation: Schema.NullOr(Schema.String),
  mainUrl: Schema.NullOr(Schema.String),
  status: Schema.Literals(["pending", "approved", "rejected"]),
  reason: Schema.NullOr(Schema.String),
  appliedAt: Schema.Finite,
  decidedAt: Schema.NullOr(Schema.Finite),
  /** The rejected application this one followed ("Opnieuw aangemeld"). */
  reappliedFrom: Schema.NullOr(Schema.String)
}) {}

export class ApplicationList extends Schema.Class<ApplicationList>("affiliates/ApplicationList")({
  rows: Schema.Array(ApplicationRow),
  counts: Schema.Struct({ pending: Schema.Int, decided: Schema.Int })
}) {}

export const PayoutLineStatus = Schema.Literals(["open", "approvable", "approved", "paid", "nothing"])

export class PayoutLine extends Schema.Class<PayoutLine>("affiliates/PayoutLine")({
  affiliateId: Schema.String,
  name: Schema.String,
  payoutId: Schema.NullOr(Schema.String),
  orders: Schema.Int,
  /** Past the window: what an approval pays. */
  approvableMinor: Schema.Int,
  /** Still in the window: follows by itself once it passes. */
  inWindowMinor: Schema.Int,
  reversedMinor: Schema.Int,
  totalMinor: Schema.Int,
  method: Schema.NullOr(PaymentMethod),
  status: PayoutLineStatus
}) {}

export class PayoutsView extends Schema.Class<PayoutsView>("affiliates/PayoutsView")({
  month: Schema.String,
  /** The month has ended and was closed: only then can it be approved. A running month "loopt nog". */
  closed: Schema.Boolean,
  /** `YYYY-MM-DD`: the programme's one payout day after this month. */
  payDay: Schema.String,
  lines: Schema.Array(PayoutLine),
  summary: Schema.Struct({ toApproveMinor: Schema.Int, approvedMinor: Schema.Int, inWindowMinor: Schema.Int }),
  currency: Schema.String,
  /** Months that have payouts, newest first, and the running month. */
  months: Schema.Array(Schema.String)
}) {}

export class InviteRow extends Schema.Class<InviteRow>("affiliates/InviteRow")({
  id: Schema.String,
  name: Schema.NullOr(Schema.String),
  email: Schema.String,
  tier: Tier,
  sentAt: Schema.Finite,
  expiresAt: Schema.Finite,
  lapsed: Schema.Boolean
}) {}

export const ResourceKind = Schema.Literals(["logo", "image", "video", "doc", "guide"])
export type ResourceKind = typeof ResourceKind.Type

export class ResourceRow extends Schema.Class<ResourceRow>("affiliates/ResourceRow")({
  id: Schema.String,
  kind: ResourceKind,
  title: Schema.String,
  mime: Schema.String,
  sizeBytes: Schema.Int,
  updatedAt: Schema.Finite,
  /** The console path the file downloads (and, for an image or a PDF, previews) from. */
  path: Schema.String
}) {}

/** What a reversible write answers: the records it changed, and its "Ongedaan maken". */
/** An order that looks like the affiliate's own, for the brand to accept or turn down. Never the shopper. */
export class FlaggedConversion extends Schema.Class<FlaggedConversion>("affiliates/FlaggedConversion")({
  id: Schema.String,
  affiliateId: Schema.String,
  affiliateName: Schema.String,
  orderNumber: Schema.String,
  baseMinor: Schema.Int,
  /** What it earns if the brand accepts it. */
  commissionMinor: Schema.Int,
  currency: Schema.String,
  placedAt: Schema.Number,
  reason: Schema.Literal("self")
}) {}

export class AffiliatesChange extends Schema.Class<AffiliatesChange>("affiliates/AffiliatesChange")({
  ids: Schema.Array(Schema.String),
  undo: Schema.NullOr(UndoTicket)
}) {}

/** The approve dialog's proposal: a unique code from the applicant's first name. */
export const ProposedCode = Schema.Struct({ code: Schema.String })

export const InviteLink = Schema.Struct({ url: Schema.String })

// ─── The affiliate's side (Part B) ───────────────────────────────────────────────────────────────────────────────────

/** The affiliate the request acts as, beside its `CurrentPrincipal` (the portal's middleware). */
export interface AffiliateSelf {
  readonly affiliateId: string
  readonly name: string
  readonly workspaceName: string
}

export class CurrentAffiliate
  extends Context.Service<CurrentAffiliate, AffiliateSelf>()("affiliates/CurrentAffiliate")
{}

/** Signed in, but neither an affiliate nor an applicant of any programme: the portal's pages are 404. */
export class NotAffiliate extends Schema.TaggedError<NotAffiliate>()("NotAffiliate", {}) {}

export const PortalState = Schema.Literals(["approved", "pending", "rejected"])
export type PortalState = typeof PortalState.Type

export class AffiliateMe extends Schema.Class<AffiliateMe>("affiliates/AffiliateMe")({
  state: PortalState,
  workspace: Schema.Struct({ id: Schema.String, name: Schema.String }),
  affiliate: Schema.NullOr(Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    email: Schema.String,
    code: Schema.String,
    tier: Tier,
    rate: Schema.Finite,
    status: Schema.Literals(["active", "paused"])
  })),
  /** The newest application, for pending and rejected. */
  application: Schema.NullOr(Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    appliedAt: Schema.Finite,
    reason: Schema.NullOr(Schema.String)
  }))
}) {}

export const ConversionRow = Schema.Struct({
  id: Schema.String,
  orderNumber: Schema.String,
  productTitle: Schema.String,
  linkLabel: Schema.NullOr(Schema.String),
  attributedBy: Schema.Literals(["link", "code"]),
  /** The order's amount the commission is on. */
  amountMinor: Schema.Int,
  commissionMinor: Schema.Int,
  status: ConversionStatus,
  placedAt: Schema.Finite
})
export type ConversionRow = typeof ConversionRow.Type

export class ConversionList extends Schema.Class<ConversionList>("affiliates/ConversionList")({
  rows: Schema.Array(ConversionRow),
  currency: Schema.String
}) {}

export const Week = Schema.Struct({
  /** The week's last day, epoch ms. */
  end: Schema.Finite,
  earnedMinor: Schema.Int,
  conversions: Schema.Int,
  clicks: Schema.Int
})
export type Week = typeof Week.Type

export class LinkRow extends Schema.Class<LinkRow>("affiliates/LinkRow")({
  id: Schema.String,
  label: Schema.String,
  /** What the affiliate shares: Insyte's redirect, which counts the click. */
  url: Schema.String,
  /** Where it lands, with the tags. */
  storefrontUrl: Schema.String,
  medium: Medium,
  clicks: Schema.Int,
  conversions: Schema.Int,
  revenueMinor: Schema.Int,
  commissionMinor: Schema.Int,
  createdAt: Schema.Finite,
  archived: Schema.Boolean
}) {}

export class LinkList extends Schema.Class<LinkList>("affiliates/LinkList")({
  rows: Schema.Array(LinkRow),
  totals: Schema.Struct({ clicks: Schema.Int, conversions: Schema.Int }),
  currency: Schema.String
}) {}

export class LinkDetail extends Schema.Class<LinkDetail>("affiliates/LinkDetail")({
  link: LinkRow,
  weeks: Schema.Array(Week),
  currency: Schema.String
}) {}

export class LinkMade extends Schema.Class<LinkMade>("affiliates/LinkMade")({
  link: LinkRow,
  undo: Schema.NullOr(UndoTicket)
}) {}

export const Destination = Schema.Struct({ id: Schema.String, label: Schema.String, path: Schema.String })

export class AffiliateDashboard extends Schema.Class<AffiliateDashboard>("affiliates/AffiliateDashboard")({
  /** "Nog uit te betalen": the ledger's sum. */
  owedMinor: Schema.Int,
  currency: Schema.String,
  /** `YYYY-MM-DD`, and how. */
  nextPayout: Schema.Struct({ payDay: Schema.String, method: Schema.NullOr(PaymentMethod) }),
  conversions30d: Schema.Int,
  clicks30d: Schema.Int,
  /** Approved and paid conversions in the rolling quarter: what the next tier counts. */
  quarterConversions: Schema.Int,
  weeks: Schema.Array(Week),
  recent: Schema.Array(ConversionRow),
  tiers: Schema.Array(TierDef),
  bestLinks: Schema.Array(LinkRow),
  linksCount: Schema.Int,
  resourcesCount: Schema.Int,
  returnDays: Schema.Int,
  asOf: Schema.Finite
}) {}

export const PayoutMonth = Schema.Struct({
  month: Schema.String,
  conversions: Schema.Int,
  grossMinor: Schema.Int,
  reversedMinor: Schema.Int,
  totalMinor: Schema.Int,
  status: PayoutStatus,
  payDay: Schema.String,
  paidAt: Schema.NullOr(Schema.Finite)
})
export type PayoutMonth = typeof PayoutMonth.Type

export class AffiliatePayouts extends Schema.Class<AffiliatePayouts>("affiliates/AffiliatePayouts")({
  months: Schema.Array(PayoutMonth),
  current: Schema.Struct({ month: Schema.String, approvedMinor: Schema.Int, pendingMinor: Schema.Int }),
  paidLifetimeMinor: Schema.Int,
  payoutDay: Schema.Int,
  returnDays: Schema.Int,
  currency: Schema.String,
  payment: Schema.NullOr(Schema.Struct({ method: PaymentMethod, hint: Schema.String }))
}) {}

export class AffiliatePayout extends Schema.Class<AffiliatePayout>("affiliates/AffiliatePayout")({
  payout: PayoutMonth,
  rows: Schema.Array(ConversionRow),
  /** The method it was (or will be) paid with: the approval's snapshot, else the current one. */
  method: Schema.NullOr(PaymentMethod),
  taxId: Schema.NullOr(Schema.String),
  currency: Schema.String
}) {}

export class AffiliateResources extends Schema.Class<AffiliateResources>("affiliates/AffiliateResources")({
  resources: Schema.Array(ResourceRow),
  faqs: Schema.Array(Faq)
}) {}

export const NoteRow = Schema.Struct({
  id: Schema.String,
  kind: Schema.String,
  data: Schema.Record(Schema.String, Schema.Unknown),
  createdAt: Schema.Finite,
  read: Schema.Boolean
})

export class AffiliateNotes extends Schema.Class<AffiliateNotes>("affiliates/AffiliateNotes")({
  rows: Schema.Array(NoteRow),
  unread: Schema.Int
}) {}

export class AffiliateProfile extends Schema.Class<AffiliateProfile>("affiliates/AffiliateProfile")({
  name: Schema.String,
  email: Schema.String,
  code: Schema.String,
  tier: Tier,
  rate: Schema.Finite,
  discount: DiscountState
}) {}

export class AffiliatePayment extends Schema.Class<AffiliatePayment>("affiliates/AffiliatePayment")({
  method: Schema.NullOr(PaymentMethod),
  /** Masked: `NL•• •••• •••• 4300`, `j•••@example.com`. */
  accountHint: Schema.NullOr(Schema.String),
  taxId: Schema.NullOr(Schema.String)
}) {}

/** The public application page: the brand, and whether it takes applications. */
export class ProgramLanding extends Schema.Class<ProgramLanding>("affiliates/ProgramLanding")({
  brand: Schema.String,
  open: Schema.Boolean
}) {}

export class Applied extends Schema.Class<Applied>("affiliates/Applied")({ applicationId: Schema.String }) {}

/**
 * Shopify made the discount but named no node, and its search did not find it yet (W13.6): the code stays `pending`
 * with this note, and the daily settle looks it up by its code again (`close.ts`) until it is found, so it can always
 * be ended. An erasure keeps the note, so its discount is still looked for.
 */
export const UNNAMED_REASON = "Shopify bevestigt de korting nog; Insyte kijkt het dagelijks opnieuw na"
