import { Db } from "@insyte/database/Db"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Config, Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { PLAN_STORES } from "../../shared/domain/Billing.ts"
import { PendingEvents } from "../../shared/domain/Outbox.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import { seatCount } from "../../shared/use-cases/Seats.ts"
import {
  type BillingChange,
  type BillingChangeInput,
  BillingPreview,
  BillingUnavailable,
  type CancelInput,
  type ChangePlanInput,
  type ChangeSeatsInput,
  CheckoutPending,
  NoExtraSeats,
  NoSubscription,
  PreviewExpired,
  SeatsExceedPlan,
  StoresExceedPlan,
  TooManySeats
} from "../domain/Billing.ts"
import { BillingProvider, type PlanPrice, type SubscriptionSnapshot, type Target } from "../domain/Ports.ts"
import { peopleOnly } from "./guard.ts"
import {
  connectedStores,
  currentTarget,
  isLive,
  overview,
  seatsOfTarget,
  snapshotOf,
  subscriptionRow,
  workspaceRow,
  writeInvoice,
  writeSubscription
} from "./state.ts"

/*
 * Facturatie's changes (M13 step 1; widgets/05 §4), each at Facturatie · Beheren (`billing≥3`). A plan or seats change
 * is irreversible from Insyte's side: Stripe prorates it, so the console confirms with `previewChange`'s amount first and
 * offers no undo (M13 "Decisions settled"). The first paid action makes the Stripe customer and pays on Stripe's
 * Checkout page; after that a change updates the subscription now, prorated on the next invoice. Stripe is asked
 * outside any transaction; what it answers is written to the cache, audited, and told as `billing.changed`.
 */

const consoleOrigin = Config.String("CONSOLE_ORIGIN").pipe(Config.withDefault(""), Effect.orDie)

/** How old a preview may be when its change comes in: older, and the change is refused, to be previewed again. */
const PRORATION_WINDOW_S = 60 * 60

/** The most extra seats one subscription holds (`subscriptions.extra_seats`). */
const MAX_EXTRA_SEATS = 500

const provider = Effect.gen(function*() {
  const p = yield* BillingProvider
  if (!p.configured) return yield* new BillingUnavailable({ reason: "not_configured" })
  return p
})

const loaded = Effect.fn("Billing.load")(function*() {
  const principal = yield* CurrentPrincipal
  return yield* (yield* Db).scoped((sql) =>
    Effect.gen(function*() {
      const workspace = yield* workspaceRow(sql)
      const row = yield* subscriptionRow(sql)
      return {
        workspace,
        row,
        current: snapshotOf(row, principal.workspaceId),
        target: currentTarget(row, workspace.plan),
        seats: yield* seatCount(sql),
        stores: yield* connectedStores(sql)
      }
    })
  )
})

type Loaded = Effect.Success<ReturnType<typeof loaded>>

const priceOf = (prices: ReadonlyArray<PlanPrice>, plan: PlanPrice["plan"], cycle: Target["cycle"]) =>
  prices.find((p) => p.plan === plan && p.cycle === cycle)

/** The target a change asks for, refused where it would leave people or stores without room. */
const targetOf = Effect.fn("Billing.target")(function*(state: Loaded, change: BillingChangeInput) {
  const target: Target = change._tag === "plan"
    ? { plan: change.plan, cycle: change.cycle, extraSeats: state.target.extraSeats }
    : { ...state.target, extraSeats: state.target.extraSeats + change.delta }
  if (target.extraSeats < 0) return yield* new NoExtraSeats({ extra: state.target.extraSeats })
  if (target.extraSeats > MAX_EXTRA_SEATS) return yield* new TooManySeats({ max: MAX_EXTRA_SEATS })
  const seats = seatsOfTarget(target)
  if (seats < state.seats.used) return yield* new SeatsExceedPlan({ used: state.seats.used, seats })
  if (PLAN_STORES[target.plan] < state.stores) {
    return yield* new StoresExceedPlan({ connected: state.stores, stores: PLAN_STORES[target.plan] })
  }
  return target
})

const nowSeconds = () => Math.floor(Date.now() / 1000)

/** The preview's second, if it is recent: older (or ahead of now) is refused; no preview at all prorates to now. */
const prorationAt = (asked: number | undefined) => {
  const now = nowSeconds()
  if (asked === undefined) return Effect.succeed(now)
  return asked <= now + 5 && asked >= now - PRORATION_WINDOW_S
    ? Effect.succeed(Math.min(asked, now))
    : Effect.fail(new PreviewExpired())
}

/**
 * The subscription a change applies to: the cached one while it bills; otherwise the customer's at Stripe, if a first
 * payment Insyte has not heard of yet already made one (written to the cache, then changed like any other). Without
 * either, the change is a first payment.
 */
const liveAtStripe = Effect.fn("Billing.liveAtStripe")(function*(state: Loaded) {
  if (isLive(state.current)) return { state, current: state.current }
  if (state.row === undefined) return { state, current: undefined }
  const p = yield* provider
  const found = yield* p.activeSubscription(state.row.stripeCustomerId)
  if (found === undefined) return { state, current: undefined }
  const principal = yield* CurrentPrincipal
  yield* (yield* Db).scoped((sql) =>
    Effect.gen(function*() {
      const { written, started } = yield* writeSubscription(sql, principal.workspaceId, found, new Date())
      if (written) yield* told(sql, principal.workspaceId, found, started, principal.userId)
    })
  )
  // The change starts from what that subscription bills, not from the one that ended.
  const target: Target = {
    plan: found.plan ?? state.target.plan,
    cycle: found.cycle ?? state.target.cycle,
    extraSeats: found.extraSeats
  }
  return { state: { ...state, current: found, target }, current: found }
})

/** What the change costs: the first period where nothing is paid yet, otherwise Stripe's proration. */
export const previewChange = Effect.fn("Billing.previewChange")(function*(change: BillingChangeInput) {
  yield* peopleOnly
  yield* Policy.require("billing", 3)
  const p = yield* provider
  const { state, current } = yield* liveAtStripe(yield* loaded())
  const target = yield* targetOf(state, change)
  const prices = yield* p.prices
  const prorationDate = nowSeconds()
  if (current === undefined) {
    if (change._tag === "seats" && change.delta < 0) return yield* new NoSubscription()
    const base = priceOf(prices, target.plan, target.cycle)
    const seat = priceOf(prices, "seat", target.cycle)
    if (base === undefined || (target.extraSeats > 0 && seat === undefined)) {
      return yield* new BillingUnavailable({ reason: "no_price" })
    }
    const amount = base.unitAmountMinor + target.extraSeats * (seat?.unitAmountMinor ?? 0)
    return new BillingPreview({
      kind: "checkout",
      currency: base.currency,
      amountDueMinor: amount,
      prorationMinor: 0,
      nextInvoiceMinor: amount,
      nextInvoiceAt: null,
      immediate: true,
      prorationDate
    })
  }
  const proration = yield* p.preview({ current, target, prices, prorationDate })
  return new BillingPreview({
    kind: "change",
    currency: proration.currency,
    // Another period is invoiced today, whole; otherwise the difference goes on the next invoice.
    amountDueMinor: Math.max(0, proration.immediate ? proration.nextInvoiceMinor : proration.prorationMinor),
    prorationMinor: proration.prorationMinor,
    nextInvoiceMinor: proration.nextInvoiceMinor,
    nextInvoiceAt: proration.nextInvoiceAt?.getTime() ?? null,
    immediate: proration.immediate,
    prorationDate
  })
})

/** `billing.changed` on the write's transaction, kicked after commit with the request's other events. */
const told = Effect.fn("Billing.told")(
  function*(
    sql: SqlClient.SqlClient,
    workspaceId: string,
    s: SubscriptionSnapshot,
    started: boolean,
    userId: string | null
  ) {
    const id = yield* Outbox.write(sql, workspaceId, {
      type: "billing.changed",
      workspaceId,
      userId,
      status: s.status,
      plan: s.plan,
      cycle: s.cycle,
      started
    })
    ;(yield* PendingEvents)?.add(id)
  }
)

/** The workspace's Stripe customer, made at its first paid action and kept on the `subscriptions` row. */
const customerOf = Effect.fn("Billing.customer")(function*(state: Loaded) {
  if (state.row !== undefined) return state.row.stripeCustomerId
  const principal = yield* CurrentPrincipal
  const p = yield* provider
  const { customerId } = yield* p.createCustomer({
    workspaceId: principal.workspaceId,
    name: state.workspace.legalEntity || state.workspace.name,
    email: state.workspace.billingEmail
  })
  return yield* (yield* Db).scoped((sql) =>
    Effect.gen(function*() {
      yield* sql`insert into subscriptions (workspace_id, stripe_customer_id, started_by)
                 values (${principal.workspaceId}, ${customerId}, ${principal.userId})
                 on conflict (workspace_id) do nothing`
      const [row] = yield* sql<{ id: string }>`select stripe_customer_id as id from subscriptions`
      return row!.id
    })
  )
})

const keyOf = (t: Target) => `${t.plan}-${t.cycle}-${t.extraSeats}`

/**
 * The first payment's page. One page per workspace and change: the open one is reused for the same change and closed
 * before another is opened, and one already paid waits for its subscription, so no workspace pays twice.
 */
const openCheckout = Effect.fn("Billing.openCheckout")(
  function*(state: Loaded, target: Target, prices: ReadonlyArray<PlanPrice>) {
    const principal = yield* CurrentPrincipal
    const p = yield* provider
    const db = yield* Db
    const previous = state.row?.checkoutSessionId ?? null
    if (previous !== null) {
      const session = yield* p.checkoutSession(previous)
      if (session?.status === "complete") return yield* new CheckoutPending()
      if (session?.status === "open") {
        if (state.row?.checkoutKey === keyOf(target) && session.url !== null) {
          return { _tag: "redirect" as const, url: session.url, sessionId: previous }
        }
        yield* p.expireCheckout(previous)
      }
    }
    const customerId = yield* customerOf(state)
    const origin = yield* consoleOrigin
    const paid = yield* p.checkout({
      customerId,
      workspaceId: principal.workspaceId,
      target,
      prices,
      successUrl: `${origin}/settings/billing?betaald=1`,
      cancelUrl: `${origin}/settings/billing`,
      idempotencyKey: `insyte-checkout-${principal.workspaceId}-${keyOf(target)}-${previous ?? "first"}`
    })
    if (paid._tag === "redirect") {
      yield* db.scoped((sql) =>
        sql`update subscriptions set checkout_session_id = ${paid.sessionId}, checkout_key = ${keyOf(target)}`
      )
    }
    return paid
  }
)

/** Plan or seats, as asked: the first payment on Stripe's page, or the subscription changed now. */
const apply = Effect.fn("Billing.apply")(function*(change: BillingChangeInput, asked: number | undefined) {
  const principal = yield* CurrentPrincipal
  const p = yield* provider
  const prorationDate = yield* prorationAt(asked)
  const { state, current } = yield* liveAtStripe(yield* loaded())
  const target = yield* targetOf(state, change)
  const prices = yield* p.prices
  const action = change._tag === "plan" ? "billing.plan_changed" : "billing.seats_changed"
  const diff = {
    plan: { from: state.target.plan, to: target.plan },
    cycle: { from: state.target.cycle, to: target.cycle },
    extraSeats: { from: state.target.extraSeats, to: target.extraSeats }
  }
  const db = yield* Db
  if (current === undefined) {
    if (change._tag === "seats" && change.delta < 0) return yield* new NoSubscription()
    if (priceOf(prices, target.plan, target.cycle) === undefined) {
      return yield* new BillingUnavailable({ reason: "no_price" })
    }
    const paid = yield* openCheckout(state, target, prices)
    if (paid._tag === "redirect") return { _tag: "checkout", url: paid.url } satisfies BillingChange
    return yield* db.scoped((sql) =>
      Effect.gen(function*() {
        const { started } = yield* writeSubscription(sql, principal.workspaceId, paid.subscription, new Date())
        yield* writeInvoice(sql, principal.workspaceId, paid.invoice, new Date())
        yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
          action: "billing.subscribed",
          subjectType: "billing",
          subjectId: principal.workspaceId,
          diff
        })
        yield* told(sql, principal.workspaceId, paid.subscription, started, principal.userId)
        return { _tag: "changed", overview: yield* overview(sql, true) } satisfies BillingChange
      })
    )
  }
  const updated = yield* p.update({ current, target, prices, prorationDate })
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const { started } = yield* writeSubscription(sql, principal.workspaceId, updated, new Date())
      yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
        action,
        subjectType: "billing",
        subjectId: principal.workspaceId,
        diff
      })
      yield* told(sql, principal.workspaceId, updated, started, principal.userId)
      return { _tag: "changed", overview: yield* overview(sql, true) } satisfies BillingChange
    })
  )
})

export const changePlan = Effect.fn("Billing.changePlan")(function*(input: ChangePlanInput) {
  yield* peopleOnly
  yield* Policy.require("billing", 3)
  return yield* apply({ _tag: "plan", plan: input.plan, cycle: input.cycle }, input.prorationDate)
})

export const addSeats = Effect.fn("Billing.addSeats")(function*(input: ChangeSeatsInput) {
  yield* peopleOnly
  yield* Policy.require("billing", 3)
  return yield* apply({ _tag: "seats", delta: input.n }, input.prorationDate)
})

export const removeSeats = Effect.fn("Billing.removeSeats")(function*(input: ChangeSeatsInput) {
  yield* peopleOnly
  yield* Policy.require("billing", 3)
  return yield* apply({ _tag: "seats", delta: -input.n }, input.prorationDate)
})

/** Stop at the end of the paid period (`cancel`), or keep going after all (`resume`); both can be taken back. */
const setCancel = Effect.fn("Billing.setCancel")(function*(cancel: CancelInput | null) {
  yield* peopleOnly
  yield* Policy.require("billing", 3)
  const principal = yield* CurrentPrincipal
  const p = yield* provider
  const state = yield* loaded()
  if (!isLive(state.current)) return yield* new NoSubscription()
  const updated = yield* p.setCancelAtPeriodEnd({ current: state.current, cancel: cancel !== null })
  return yield* (yield* Db).scoped((sql) =>
    Effect.gen(function*() {
      yield* writeSubscription(sql, principal.workspaceId, updated, new Date())
      if (cancel !== null) {
        yield* sql`update subscriptions set cancel_reason = ${cancel.reason}, cancel_note = ${cancel.note ?? null}`
      }
      yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
        action: cancel === null ? "billing.resumed" : "billing.cancelled",
        subjectType: "billing",
        subjectId: principal.workspaceId,
        diff: cancel === null ? {} : { reason: cancel.reason }
      })
      yield* told(sql, principal.workspaceId, updated, false, principal.userId)
      return yield* overview(sql, true)
    })
  )
})

export const cancel = (input: CancelInput) => setCancel(input)
export const resume = () => setCancel(null)

/** Stripe's Customer Portal, for the card: Insyte never sees a card number (no card form of its own). */
export const portalSession = Effect.fn("Billing.portalSession")(function*() {
  yield* peopleOnly
  yield* Policy.require("billing", 3)
  const p = yield* provider
  const state = yield* loaded()
  if (state.row === undefined) return yield* new NoSubscription()
  const origin = yield* consoleOrigin
  return yield* p.portal({ customerId: state.row.stripeCustomerId, returnUrl: `${origin}/settings/billing` })
})
