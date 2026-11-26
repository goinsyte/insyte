import { Context, type Effect } from "effect"
import type { BillingCycle, PlanId } from "../../shared/domain/Billing.ts"
import type { BillingUnavailable, Card, SubscriptionStatus } from "./Billing.ts"

/*
 * Stripe as the billing slice's port (M13 step 1; ADR-0019). Two adapters (`packages/integrations/stripe`): Stripe's
 * SDK in test or live mode where the stage has its key, and a fake that answers the same shapes without Stripe (local
 * runs, the worker tests, previews). Prices are Stripe's Price objects, found by their metadata (`insyte_plan`:
 * a plan id, or `seat` for an extra seat), never in code. Insyte's own calls answer the subscription as Stripe now has
 * it, and the use case writes that to its cache; Stripe's webhooks keep the cache right for everything else.
 */

export interface PlanPrice {
  readonly plan: PlanId | "seat"
  readonly cycle: BillingCycle
  readonly priceId: string
  readonly unitAmountMinor: number
  readonly currency: string
}

/** A subscription as Stripe has it, in Insyte's words. */
export interface SubscriptionSnapshot {
  readonly customerId: string
  readonly subscriptionId: string
  readonly status: SubscriptionStatus
  /** From the base item's price metadata; `null` when the price is not one of Insyte's. */
  readonly plan: PlanId | null
  readonly cycle: BillingCycle | null
  readonly extraSeats: number
  readonly currency: string
  readonly currentPeriodEnd: Date | null
  readonly cancelAt: Date | null
  readonly card: Card | null
  /** The workspace Insyte wrote into the subscription's metadata. */
  readonly workspaceId: string | null
}

export interface InvoiceSnapshot {
  readonly id: string
  readonly customerId: string
  readonly number: string | null
  readonly status: "draft" | "open" | "paid" | "uncollectible" | "void"
  readonly amountMinor: number
  readonly currency: string
  readonly issuedAt: Date
  readonly hostedUrl: string | null
  readonly pdfUrl: string | null
}

/** What the subscription should be after a change. */
export interface Target {
  readonly plan: PlanId
  readonly cycle: BillingCycle
  readonly extraSeats: number
}

export interface Proration {
  readonly currency: string
  readonly prorationMinor: number
  readonly nextInvoiceMinor: number
  readonly nextInvoiceAt: Date | null
  /** Another billing period: Stripe starts it now and invoices `nextInvoiceMinor` at once. */
  readonly immediate: boolean
  /** What is left on the customer's balance for later invoices, where the change credits more than it costs. */
  readonly creditMinor: number
}

/** A Checkout page Insyte opened, as Stripe has it now. */
export interface CheckoutSession {
  readonly status: "open" | "complete" | "expired"
  readonly url: string | null
  readonly subscriptionId: string | null
}

/** A verified webhook, read: what changed, and when Stripe says it did. */
export type StripeEvent =
  & { readonly id: string; readonly type: string; readonly created: Date }
  & (
    | { readonly kind: "subscription"; readonly subscription: SubscriptionSnapshot }
    | { readonly kind: "invoice"; readonly invoice: InvoiceSnapshot }
    | {
      readonly kind: "checkout"
      readonly customerId: string
      readonly subscriptionId: string | null
      readonly workspaceId: string | null
    }
    | { readonly kind: "other" }
  )

export class BillingProvider extends Context.Service<BillingProvider, {
  /** Whether this stage bills at all. */
  readonly configured: boolean
  readonly prices: Effect.Effect<ReadonlyArray<PlanPrice>, BillingUnavailable>
  /**
   * Insyte's customer at Stripe for a workspace, made once (the workspace and its details are the idempotency key), or
   * made again in place of one Stripe no longer has (`replaces`).
   */
  readonly createCustomer: (input: {
    readonly workspaceId: string
    readonly name: string
    readonly email: string | null
    readonly replaces?: string
  }) => Effect.Effect<{ readonly customerId: string }, BillingUnavailable>
  /**
   * The first payment: Stripe's Checkout page (`redirect`, open for about half an hour), or, where no page is needed
   * (the fake), the subscription at once (`subscribed`) with its first invoice. A customer Stripe no longer has is
   * `BillingUnavailable` `no_customer`.
   */
  readonly checkout: (input: {
    readonly customerId: string
    readonly workspaceId: string
    readonly target: Target
    readonly prices: ReadonlyArray<PlanPrice>
    readonly successUrl: string
    readonly cancelUrl: string
    /** One page per workspace, change and attempt: the same request again answers the same page. */
    readonly idempotencyKey: string
  }) => Effect.Effect<
    | { readonly _tag: "redirect"; readonly url: string; readonly sessionId: string }
    | { readonly _tag: "subscribed"; readonly subscription: SubscriptionSnapshot; readonly invoice: InvoiceSnapshot },
    BillingUnavailable
  >
  /** A Checkout page opened before, as it stands (`undefined` where the adapter has none). */
  readonly checkoutSession: (id: string) => Effect.Effect<CheckoutSession | undefined, BillingUnavailable>
  /** Closes a Checkout page that is still open, so it cannot be paid. */
  readonly expireCheckout: (id: string) => Effect.Effect<void, BillingUnavailable>
  /**
   * The customer's subscription that still bills or will (not cancelled, not expired), newest first: before a first
   * payment is opened, so a workspace whose earlier payment Insyte has not heard of yet is never subscribed twice.
   */
  readonly activeSubscription: (
    customerId: string
  ) => Effect.Effect<SubscriptionSnapshot | undefined, BillingUnavailable>
  /** What changing `current` to `target` costs now, prorated to `prorationDate` (unix seconds). */
  readonly preview: (input: {
    readonly current: SubscriptionSnapshot
    readonly target: Target
    readonly prices: ReadonlyArray<PlanPrice>
    readonly prorationDate: number
  }) => Effect.Effect<Proration, BillingUnavailable>
  /**
   * The change itself, prorated as previewed; answers the subscription after it. A change of period is charged at once
   * and applied only if that payment goes through (`payment_failed` otherwise, the subscription as it was).
   */
  readonly update: (input: {
    readonly current: SubscriptionSnapshot
    readonly target: Target
    readonly prices: ReadonlyArray<PlanPrice>
    readonly prorationDate: number
  }) => Effect.Effect<SubscriptionSnapshot, BillingUnavailable>
  /** Stop at the end of the period (`true`), or keep going (`false`). */
  readonly setCancelAtPeriodEnd: (input: {
    readonly current: SubscriptionSnapshot
    readonly cancel: boolean
  }) => Effect.Effect<SubscriptionSnapshot, BillingUnavailable>
  /**
   * Ends the subscription now, without a credit for the rest of the period and without a last invoice: the workspace
   * it pays for is being deleted (security.md §6). Asked again, it answers the subscription as it ended.
   */
  readonly cancelNow: (input: {
    readonly current: SubscriptionSnapshot
  }) => Effect.Effect<SubscriptionSnapshot, BillingUnavailable>
  /** Stripe's Customer Portal for the card and the invoices, returning to `returnUrl`. */
  readonly portal: (input: { readonly customerId: string; readonly returnUrl: string }) => Effect.Effect<
    { readonly url: string },
    BillingUnavailable
  >
  /** The subscription as Stripe has it now; `undefined` where it does not know it. */
  readonly subscription: (id: string) => Effect.Effect<SubscriptionSnapshot | undefined, BillingUnavailable>
  /** An invoice as Stripe has it now (its links among it); `undefined` where it does not know it. */
  readonly invoice: (id: string) => Effect.Effect<InvoiceSnapshot | undefined, BillingUnavailable>
  /** Whether `header` (`Stripe-Signature`) signs `body` with the stage's webhook secret, within Stripe's tolerance. */
  readonly verifyWebhook: (body: Uint8Array, header: string, now: Date) => Effect.Effect<boolean>
  /** A verified body, read; `undefined` when it is not an event. */
  readonly readEvent: (body: unknown) => Effect.Effect<StripeEvent | undefined>
}>()("billing/BillingProvider") {}
