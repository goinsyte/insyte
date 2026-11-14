import { Schema } from "effect"
import { BillingCycle, PlanId } from "../../shared/domain/Billing.ts"

/*
 * Facturatie as the console reads and changes it (M13 step 1; widgets/05 §4). Stripe bills Insyte (ADR-0019): the plan,
 * the seats bought beyond it, the card and the invoices are Stripe's, cached in `subscriptions` and `invoices`; what a
 * plan includes (seats, stores, AI answers) is Insyte's code; prices are Stripe's Price objects, never in code. Amounts
 * are integer minor units in Stripe's currency. People only: billing is `api: false`, and no key or agent reaches it.
 */

export const SubscriptionStatus = Schema.Literals([
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "incomplete",
  "incomplete_expired",
  "paused"
])
export type SubscriptionStatus = typeof SubscriptionStatus.Type

/** "Het is te duur", "We missen een functie", "We sluiten de winkel", "We zijn overgestapt…", "Iets anders". */
export const CancelReason = Schema.Literals([
  "too_expensive",
  "missing_feature",
  "closing_store",
  "switched_tool",
  "other"
])
export type CancelReason = typeof CancelReason.Type

export const Card = Schema.Struct({
  brand: Schema.String,
  last4: Schema.String,
  /** `MM/YYYY`. */
  expiry: Schema.String
})
export type Card = typeof Card.Type

export const Meter = Schema.Struct({ value: Schema.Int, max: Schema.Int })

/** Dates are epoch milliseconds, as the team page's. */
export class BillingOverview extends Schema.Class<BillingOverview>("billing/BillingOverview")({
  /** Whether this stage can bill at all (Stripe's keys, or the fake). Without it every change is refused. */
  configured: Schema.Boolean,
  /** The plan picked at onboarding or paid for; `null` before either. */
  plan: Schema.NullOr(PlanId),
  cycle: BillingCycle,
  /**
   * `trial`: no subscription yet, the trial is running or over (`trialEndsAt`). Otherwise Stripe's status of the
   * subscription.
   */
  status: Schema.Union([Schema.Literal("trial"), SubscriptionStatus]),
  trialEndsAt: Schema.NullOr(Schema.Finite),
  /** When the paid period ends: the renewal, or the end when `cancelAt` is set. */
  currentPeriodEnd: Schema.NullOr(Schema.Finite),
  cancelAt: Schema.NullOr(Schema.Finite),
  card: Schema.NullOr(Card),
  seats: Schema.Struct({
    /** The plan's own seats. */
    included: Schema.Int,
    /** Bought beyond the plan. */
    extra: Schema.Int,
    total: Schema.Int,
    used: Schema.Int,
    free: Schema.Int,
    full: Schema.Boolean
  }),
  usage: Schema.Struct({
    stores: Meter,
    /** Insyte AI's answers this period (the paid period, or the calendar month on a trial). */
    aiReplies: Meter,
    activeAutomations: Meter
  })
}) {}

/** One plan as the picker shows it: the prices from Stripe (`null` where Stripe has none), the rest from code. */
export const PlanOffer = Schema.Struct({
  plan: PlanId,
  /** A month's price on monthly billing. */
  monthlyMinor: Schema.NullOr(Schema.Int),
  /** A year's price on annual billing. */
  annualMinor: Schema.NullOr(Schema.Int),
  seats: Schema.Int,
  stores: Schema.Int,
  aiReplies: Schema.Int
})
export type PlanOffer = typeof PlanOffer.Type

export class BillingPlans extends Schema.Class<BillingPlans>("billing/BillingPlans")({
  currency: Schema.String,
  plans: Schema.Array(PlanOffer),
  /** One extra seat, per month and per year; `null` where Stripe has no seat price for that cycle. */
  seat: Schema.Struct({ monthlyMinor: Schema.NullOr(Schema.Int), annualMinor: Schema.NullOr(Schema.Int) })
}) {}

/** What a change asks for: another plan or cycle, or seats added (`delta > 0`) or given up (`delta < 0`). */
export const BillingChangeInput = Schema.Union([
  Schema.TaggedStruct("plan", { plan: PlanId, cycle: BillingCycle }),
  Schema.TaggedStruct("seats", {
    delta: Schema.Int.check(Schema.isGreaterThanOrEqualTo(-50), Schema.isLessThanOrEqualTo(50))
  })
])
export type BillingChangeInput = typeof BillingChangeInput.Type

/**
 * What a change will cost, before it is made (the confirm says it; there is no undo). `checkout`: no subscription yet,
 * so the change is the first payment, on Stripe's own page; `amountDueMinor` is the first period. `change`: the
 * subscription changes now; `prorationMinor` is what the rest of this period costs or credits, on the next invoice,
 * and `nextInvoiceMinor` that invoice's total. `immediate`: another billing period (monthly ↔ yearly), which Stripe
 * starts now and invoices at once: `amountDueMinor` is charged today, the new period less what is left of this one.
 * `prorationDate` goes back with the change, so Stripe prorates to the second the preview did.
 */
export class BillingPreview extends Schema.Class<BillingPreview>("billing/BillingPreview")({
  kind: Schema.Literals(["checkout", "change"]),
  currency: Schema.String,
  amountDueMinor: Schema.Int,
  prorationMinor: Schema.Int,
  nextInvoiceMinor: Schema.Int,
  nextInvoiceAt: Schema.NullOr(Schema.Finite),
  immediate: Schema.Boolean,
  prorationDate: Schema.Int
}) {}

const ProrationDate = Schema.optional(Schema.Int)

export const ChangePlanInput = Schema.Struct({ plan: PlanId, cycle: BillingCycle, prorationDate: ProrationDate })
export type ChangePlanInput = typeof ChangePlanInput.Type

export const ChangeSeatsInput = Schema.Struct({
  n: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(50)),
  prorationDate: ProrationDate
})
export type ChangeSeatsInput = typeof ChangeSeatsInput.Type

export const CancelInput = Schema.Struct({
  reason: CancelReason,
  note: Schema.optional(Schema.String.check(Schema.isMaxLength(2000)))
})
export type CancelInput = typeof CancelInput.Type

/**
 * A change's answer: made (the page as it is now), or the first payment, which happens on Stripe's page (`url`); the
 * subscription arrives by webhook after it.
 */
export const BillingChange = Schema.Union([
  Schema.TaggedStruct("changed", { overview: BillingOverview }),
  Schema.TaggedStruct("checkout", { url: Schema.String })
])
export type BillingChange = typeof BillingChange.Type

export const InvoiceStatus = Schema.Literals(["draft", "open", "paid", "uncollectible", "void"])

export const Invoice = Schema.Struct({
  id: Schema.String,
  /** Stripe's invoice number ("ABC-0001"); a draft has none yet. */
  number: Schema.NullOr(Schema.String),
  issuedAt: Schema.Finite,
  amountMinor: Schema.Int,
  currency: Schema.String,
  status: InvoiceStatus
})
export type Invoice = typeof Invoice.Type

export const InvoicesInput = Schema.Struct({ cursor: Schema.optional(Schema.NullOr(Schema.String)) })

export class InvoicePage extends Schema.Class<InvoicePage>("billing/InvoicePage")({
  rows: Schema.Array(Invoice),
  next: Schema.NullOr(Schema.String)
}) {}

export const InvoiceUrlInput = Schema.Struct({ id: Schema.String })

/** A page of Stripe's to send the browser to: the Customer Portal, or an invoice. */
export const BillingLink = Schema.Struct({ url: Schema.String })
export type BillingLink = typeof BillingLink.Type

/** Stripe cannot be asked: not set up on this stage, or it did not answer. Nothing was changed. */
export class BillingUnavailable extends Schema.TaggedError<BillingUnavailable>()("BillingUnavailable", {
  reason: Schema.Literals(["not_configured", "unreachable", "refused", "no_price"])
}) {}

/** A change that needs a subscription there is not (seats given up, a cancel, the portal before the first payment). */
export class NoSubscription extends Schema.TaggedError<NoSubscription>()("NoSubscription", {}) {}

/** A smaller plan or fewer seats than the people who hold one. */
export class SeatsExceedPlan extends Schema.TaggedError<SeatsExceedPlan>()("SeatsExceedPlan", {
  used: Schema.Int,
  seats: Schema.Int
}) {}

/** A smaller plan than the stores that are connected. */
export class StoresExceedPlan extends Schema.TaggedError<StoresExceedPlan>()("StoresExceedPlan", {
  connected: Schema.Int,
  stores: Schema.Int
}) {}

/** Giving up more extra seats than were bought. */
export class NoExtraSeats extends Schema.TaggedError<NoExtraSeats>()("NoExtraSeats", { extra: Schema.Int }) {}

/** More extra seats than a subscription can hold. */
export class TooManySeats extends Schema.TaggedError<TooManySeats>()("TooManySeats", { max: Schema.Int }) {}

/** The preview the change was confirmed with is over an hour old: what it said may no longer hold. */
export class PreviewExpired extends Schema.TaggedError<PreviewExpired>()("PreviewExpired", {}) {}

/** The first payment was made on Stripe's page and its subscription has not reached Insyte yet. */
export class CheckoutPending extends Schema.TaggedError<CheckoutPending>()("CheckoutPending", {}) {}
