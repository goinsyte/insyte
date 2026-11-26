import { BillingUnavailable } from "@insyte/modules/billing/domain/Billing"
import type {
  BillingProvider,
  InvoiceSnapshot,
  PlanPrice,
  SubscriptionSnapshot,
  Target
} from "@insyte/modules/billing/domain/Ports"
import { Effect } from "effect"
import { verifySignature } from "./Sdk.ts"
import { eventOf, pricesFor } from "./Wire.ts"

/*
 * Stripe without Stripe (M13 step 1): local runs, the worker tests and previews, where no Stripe key is set
 * (`BILLING_ADAPTER=fake`). It keeps what Stripe would in the isolate: the subscriptions and invoices it made, changed
 * as Insyte changes them, and as a verified webhook says Stripe changed them (a test's delivery is how "Stripe" moves
 * on its own), so the webhook's read-again finds them. The first payment needs no page: it is paid at once with a test
 * card, except for a customer whose name holds `[betaalpagina]` (as Stripe's test cards are told apart by their
 * numbers): that one gets a Checkout page, open until it is expired or a signed `checkout.session.completed` says it was
 * paid, so the tests can walk the page's paths. Its prices are test fixtures, not Insyte's pricing (which is Stripe's, and still to be decided). Webhooks are
 * verified with Stripe's SDK against the stage's signing secret like the real ones, so a test signs its deliveries with
 * a made-up secret.
 */

const DAY_MS = 86_400_000
const periodMs = (cycle: Target["cycle"]) => (cycle === "annual" ? 365 : 30) * DAY_MS

/** Test fixtures in euro cents; annual is ten months. Nothing reads these as Insyte's prices. */
const FIXTURE: ReadonlyArray<readonly [PlanPrice["plan"], number]> = [
  ["starter", 14_900],
  ["growth", 29_900],
  ["scale", 49_900],
  ["seat", 1_900]
]

export const FAKE_PRICES: ReadonlyArray<PlanPrice> = FIXTURE.flatMap(([plan, monthly]) => [
  { plan, cycle: "monthly" as const, priceId: `price_fake_${plan}_monthly`, unitAmountMinor: monthly, currency: "eur" },
  {
    plan,
    cycle: "annual" as const,
    priceId: `price_fake_${plan}_annual`,
    unitAmountMinor: monthly * 10,
    currency: "eur"
  }
])

const totalOf = (prices: ReadonlyArray<PlanPrice>, target: Target) => {
  const { base, seat } = pricesFor(prices, target)
  if (base === undefined || (target.extraSeats > 0 && seat === undefined)) return undefined
  return base.unitAmountMinor + target.extraSeats * (seat?.unitAmountMinor ?? 0)
}

const noPrice = () => new BillingUnavailable({ reason: "no_price" })

const targetOf = (s: SubscriptionSnapshot): Target => ({
  plan: s.plan ?? "starter",
  cycle: s.cycle ?? "monthly",
  extraSeats: s.extraSeats
})

/** What the rest of the period costs after the change, as Stripe's `create_prorations` works it out. */
const prorate = (prices: ReadonlyArray<PlanPrice>, current: SubscriptionSnapshot, target: Target, at: number) => {
  const before = totalOf(prices, targetOf(current))
  const after = totalOf(prices, target)
  if (before === undefined || after === undefined) return undefined
  const end = current.currentPeriodEnd?.getTime() ?? at * 1000
  const length = periodMs(current.cycle ?? "monthly")
  const left = Math.min(1, Math.max(0, (end - at * 1000) / length))
  // A new cycle starts a new period now: the unused part is credited and the new one charged whole.
  if (target.cycle !== (current.cycle ?? "monthly")) return { proration: after - Math.round(before * left), after }
  return { proration: Math.round((after - before) * left), after }
}

/** What "Stripe" holds in this isolate, by id, and when it last changed (ms): shared by every request it serves. */
const subscriptions = new Map<string, { s: SubscriptionSnapshot; at: number; created: number }>()
const invoices = new Map<string, { i: InvoiceSnapshot; at: number }>()

/** The customers that pay on a page, and the pages: by id, and by the idempotency key that opened them. */
const PAGE = "[betaalpagina]"
const pageCustomers = new Set<string>()
interface Page {
  readonly id: string
  readonly workspaceId: string
  readonly target: Target
  status: "open" | "complete" | "expired"
  subscriptionId: string | null
}
const pages = new Map<string, Page>()
const pageByKey = new Map<string, string>()

/** A workspace's Checkout pages, oldest first, as the dev route shows them to the tests. */
export const fakeCheckouts = (workspaceId: string) =>
  [...pages.values()].filter((p) => p.workspaceId === workspaceId).map((p) => ({
    id: p.id,
    status: p.status,
    key: `${p.target.plan}-${p.target.cycle}-${p.target.extraSeats}`
  }))

const keep = (s: SubscriptionSnapshot, at = Date.now()) => {
  const was = subscriptions.get(s.subscriptionId)
  subscriptions.set(s.subscriptionId, { s, at, created: was?.created ?? at })
  return s
}

/** A verified event, as Stripe would hold it after: newer than what is kept, it is kept. */
const learn = (event: ReturnType<typeof eventOf>) => {
  if (event === undefined) return
  const at = event.created.getTime()
  if (event.kind === "subscription") {
    const was = subscriptions.get(event.subscription.subscriptionId)
    if (was === undefined || was.at <= at) {
      keep({ ...event.subscription, card: event.subscription.card ?? was?.s.card ?? null }, at)
    }
  }
  if (event.kind === "invoice") {
    const was = invoices.get(event.invoice.id)
    if (was === undefined || was.at <= at) invoices.set(event.invoice.id, { i: event.invoice, at })
  }
}

export interface FakeConfig {
  readonly webhookSecret: string | null
}

type Provider = typeof BillingProvider.Service

/** A paid page, as a verified `checkout.session.completed` says. */
const paid = (body: unknown) => {
  const object = body as { type?: unknown; data?: { object?: { id?: unknown; subscription?: unknown } } }
  if (object.type !== "checkout.session.completed") return
  const page = typeof object.data?.object?.id === "string" ? pages.get(object.data.object.id) : undefined
  if (page === undefined) return
  page.status = "complete"
  page.subscriptionId = typeof object.data?.object?.subscription === "string" ? object.data.object.subscription : null
}

export const makeFake = (config: FakeConfig): Provider => ({
  configured: true,
  prices: Effect.succeed(FAKE_PRICES),
  createCustomer: ({ workspaceId, name, replaces }) =>
    Effect.sync(() => {
      const customerId = replaces === undefined ? `cus_fake_${workspaceId}` : `${replaces}_again`
      if (name.includes(PAGE)) pageCustomers.add(customerId)
      return { customerId }
    }),
  checkout: ({ customerId, workspaceId, target, prices, idempotencyKey }) =>
    Effect.gen(function*() {
      const total = totalOf(prices, target)
      if (total === undefined) return yield* noPrice()
      if (pageCustomers.has(customerId)) {
        // The same key again is the same page, as Stripe's idempotency answers it.
        const known = pageByKey.get(idempotencyKey)
        const id = known ?? `cs_fake_${pages.size + 1}`
        if (known === undefined) {
          pages.set(id, { id, workspaceId, target, status: "open", subscriptionId: null })
          pageByKey.set(idempotencyKey, id)
        }
        return { _tag: "redirect" as const, url: `https://checkout.stripe.test/${id}`, sessionId: id }
      }
      const now = new Date()
      const subscription: SubscriptionSnapshot = {
        customerId,
        subscriptionId: `sub_fake_${workspaceId}`,
        status: "active",
        plan: target.plan,
        cycle: target.cycle,
        extraSeats: target.extraSeats,
        currency: "eur",
        currentPeriodEnd: new Date(now.getTime() + periodMs(target.cycle)),
        cancelAt: null,
        card: { brand: "Visa", last4: "4242", expiry: `12/${now.getUTCFullYear() + 4}` },
        workspaceId
      }
      const invoice: InvoiceSnapshot = {
        id: `in_fake_${workspaceId}_${now.getTime()}`,
        customerId,
        number: `FAKE-${String(now.getTime()).slice(-6)}`,
        status: "paid",
        amountMinor: total,
        currency: "eur",
        issuedAt: now,
        hostedUrl: null,
        pdfUrl: `https://invoice.stripe.test/${workspaceId}/${now.getTime()}.pdf`
      }
      keep(subscription)
      invoices.set(invoice.id, { i: invoice, at: now.getTime() })
      return { _tag: "subscribed" as const, subscription, invoice }
    }),
  checkoutSession: (id) =>
    Effect.sync(() => {
      const page = pages.get(id)
      return page === undefined ? undefined : {
        status: page.status,
        url: page.status === "open" ? `https://checkout.stripe.test/${id}` : null,
        subscriptionId: page.subscriptionId
      }
    }),
  expireCheckout: (id) =>
    Effect.sync(() => {
      const page = pages.get(id)
      if (page?.status === "open") page.status = "expired"
    }),
  activeSubscription: (customerId) =>
    Effect.sync(() =>
      [...subscriptions.values()]
        .filter((v) =>
          v.s.customerId === customerId && v.s.status !== "canceled" && v.s.status !== "incomplete_expired"
        )
        .reduce<{ s: SubscriptionSnapshot; created: number } | undefined>(
          (best, v) => (best === undefined || v.created > best.created ? v : best),
          undefined
        )?.s
    ),
  preview: ({ current, target, prices, prorationDate }) => {
    const p = prorate(prices, current, target, prorationDate)
    if (p === undefined) return Effect.fail(noPrice())
    // Another interval: a new period starts now and is invoiced at once, less what is left of this one.
    const immediate = target.cycle !== (current.cycle ?? "monthly")
    // Never below zero: what is credited beyond it stays on the balance, as Stripe's `amount_due` and balance do.
    const due = immediate ? p.proration : p.after + p.proration
    return Effect.succeed({
      currency: current.currency,
      prorationMinor: p.proration,
      nextInvoiceMinor: Math.max(0, due),
      nextInvoiceAt: immediate ? new Date(prorationDate * 1000) : current.currentPeriodEnd,
      immediate,
      creditMinor: Math.max(0, -due)
    })
  },
  update: ({ current, target, prices }) => {
    if (totalOf(prices, target) === undefined) return Effect.fail(noPrice())
    const newCycle = target.cycle !== (current.cycle ?? "monthly")
    const was = subscriptions.get(current.subscriptionId)?.s ?? current
    return Effect.sync(() =>
      keep({
        ...was,
        plan: target.plan,
        cycle: target.cycle,
        extraSeats: target.extraSeats,
        currentPeriodEnd: newCycle ? new Date(Date.now() + periodMs(target.cycle)) : was.currentPeriodEnd
      })
    )
  },
  setCancelAtPeriodEnd: ({ current, cancel }) =>
    Effect.sync(() => {
      const was = subscriptions.get(current.subscriptionId)?.s ?? current
      return keep({ ...was, cancelAt: cancel ? was.currentPeriodEnd : null })
    }),
  cancelNow: ({ current }) =>
    Effect.sync(() => {
      const was = subscriptions.get(current.subscriptionId)?.s ?? current
      return was.status === "canceled" ? was : keep({ ...was, status: "canceled", cancelAt: null })
    }),
  // Back to the page: the fake has no portal of its own.
  portal: ({ returnUrl }) => Effect.succeed({ url: returnUrl }),
  subscription: (id) => Effect.sync(() => subscriptions.get(id)?.s),
  invoice: (id) => Effect.sync(() => invoices.get(id)?.i),
  verifyWebhook: (body, header, now) =>
    config.webhookSecret === null
      ? Effect.succeed(false)
      : Effect.promise(() => verifySignature(config.webhookSecret!, body, header, now)),
  readEvent: (body) =>
    Effect.sync(() => {
      const event = eventOf(body)
      learn(event)
      paid(body)
      return event
    })
})
