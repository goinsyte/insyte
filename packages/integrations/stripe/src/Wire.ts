import type {
  InvoiceSnapshot,
  PlanPrice,
  StripeEvent,
  SubscriptionSnapshot,
  Target
} from "@insyte/modules/billing/domain/Ports"
import type { BillingCycle, PlanId } from "@insyte/modules/shared/domain/Billing"

/*
 * Stripe's wire shapes in Insyte's words (M13 step 1), shared by the live adapter and the fake, which speaks the same
 * JSON. Read at the pinned API version (`STRIPE_VERSION`) and tolerant of the shapes around it: `current_period_end`
 * moved from the subscription to its items in 2025-03-31.basil, so both are read. Insyte's prices carry
 * `metadata.insyte_plan`: a plan id, or `seat` for one extra seat; anything else on the account is not Insyte's.
 */

export const STRIPE_VERSION = "2025-03-31.basil"

type Raw = Record<string, unknown>

const obj = (v: unknown): Raw | undefined => (typeof v === "object" && v !== null ? (v as Raw) : undefined)
const str = (v: unknown) => (typeof v === "string" && v !== "" ? v : null)
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)
const idOf = (v: unknown) => str(v) ?? str(obj(v)?.["id"])
const secondsToDate = (v: unknown) => {
  const n = num(v)
  return n === null ? null : new Date(n * 1000)
}

const PLANS = new Set<string>(["starter", "growth", "scale"])
const STATUSES = new Set<string>([
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "incomplete",
  "incomplete_expired",
  "paused"
])

const cycleOf = (price: Raw | undefined): BillingCycle | null => {
  const interval = obj(price?.["recurring"])?.["interval"]
  return interval === "month" ? "monthly" : interval === "year" ? "annual" : null
}

const insytePlanOf = (price: Raw | undefined): PlanId | "seat" | null => {
  const plan = obj(price?.["metadata"])?.["insyte_plan"]
  return typeof plan === "string" && (PLANS.has(plan) || plan === "seat") ? (plan as PlanId | "seat") : null
}

/** An active recurring price of Insyte's, or `undefined`. */
export const priceOf = (raw: unknown): PlanPrice | undefined => {
  const price = obj(raw)
  if (price === undefined || price["active"] === false) return undefined
  const plan = insytePlanOf(price)
  const cycle = cycleOf(price)
  const amount = num(price["unit_amount"])
  const id = str(price["id"])
  const currency = str(price["currency"])
  if (plan === null || cycle === null || amount === null || id === null || currency === null) return undefined
  return { plan, cycle, priceId: id, unitAmountMinor: amount, currency }
}

const BRANDS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "Amex",
  discover: "Discover",
  jcb: "JCB",
  diners: "Diners",
  unionpay: "UnionPay",
  cartes_bancaires: "Cartes Bancaires"
}

const cardOf = (pm: unknown) => {
  const card = obj(obj(pm)?.["card"])
  const last4 = str(card?.["last4"])
  const month = num(card?.["exp_month"])
  const year = num(card?.["exp_year"])
  if (card === undefined || last4 === null) return null
  const brand = str(card["brand"]) ?? ""
  return {
    brand: BRANDS[brand] ?? (brand === "" ? "Kaart" : brand.charAt(0).toUpperCase() + brand.slice(1)),
    last4,
    expiry: month === null || year === null ? "" : `${String(month).padStart(2, "0")}/${year}`
  }
}

interface Item {
  readonly id: string
  readonly price: Raw | undefined
  readonly quantity: number
  readonly periodEnd: Date | null
}

export const itemsOf = (sub: Raw): ReadonlyArray<Item> => {
  const data = obj(sub["items"])?.["data"]
  return (Array.isArray(data) ? data : []).flatMap((raw) => {
    const item = obj(raw)
    const id = str(item?.["id"])
    if (item === undefined || id === null) return []
    return [{
      id,
      price: obj(item["price"]),
      quantity: num(item["quantity"]) ?? 1,
      periodEnd: secondsToDate(item["current_period_end"])
    }]
  })
}

/** A Stripe Subscription object, read; `undefined` when it is not one. */
export const subscriptionOf = (raw: unknown): SubscriptionSnapshot | undefined => {
  const sub = obj(raw)
  const id = str(sub?.["id"])
  const customer = idOf(sub?.["customer"])
  const status = str(sub?.["status"])
  if (sub === undefined || id === null || customer === null || status === null || !STATUSES.has(status)) {
    return undefined
  }
  const items = itemsOf(sub)
  const base = items.find((i) => {
    const plan = insytePlanOf(i.price)
    return plan !== null && plan !== "seat"
  })
  const seat = items.find((i) => insytePlanOf(i.price) === "seat")
  const periodEnd = secondsToDate(sub["current_period_end"]) ?? base?.periodEnd ?? items[0]?.periodEnd ?? null
  const cancelAt = secondsToDate(sub["cancel_at"]) ?? (sub["cancel_at_period_end"] === true ? periodEnd : null)
  const plan = insytePlanOf(base?.price)
  return {
    customerId: customer,
    subscriptionId: id,
    status: status as SubscriptionSnapshot["status"],
    plan: plan === "seat" ? null : plan,
    cycle: cycleOf(base?.price ?? items[0]?.price),
    extraSeats: seat?.quantity ?? 0,
    currency: str(sub["currency"]) ?? str(base?.price?.["currency"]) ?? "eur",
    currentPeriodEnd: periodEnd,
    cancelAt,
    card: cardOf(sub["default_payment_method"]),
    workspaceId: str(obj(sub["metadata"])?.["insyte_workspace"])
  }
}

const INVOICE_STATUSES = new Set<string>(["draft", "open", "paid", "uncollectible", "void"])

/** A Stripe Invoice object, read. */
export const invoiceOf = (raw: unknown): InvoiceSnapshot | undefined => {
  const inv = obj(raw)
  const id = str(inv?.["id"])
  const customer = idOf(inv?.["customer"])
  const status = str(inv?.["status"])
  const total = num(inv?.["total"])
  const currency = str(inv?.["currency"])
  const created = secondsToDate(inv?.["created"])
  if (
    inv === undefined || id === null || customer === null || status === null || !INVOICE_STATUSES.has(status) ||
    total === null || currency === null || created === null
  ) return undefined
  return {
    id,
    customerId: customer,
    number: str(inv["number"]),
    status: status as InvoiceSnapshot["status"],
    amountMinor: total,
    currency,
    issuedAt: secondsToDate(obj(inv["status_transitions"])?.["finalized_at"]) ?? created,
    hostedUrl: str(inv["hosted_invoice_url"]),
    pdfUrl: str(inv["invoice_pdf"])
  }
}

/** A webhook's event, read: the object it is about, in Insyte's words. */
export const eventOf = (raw: unknown): StripeEvent | undefined => {
  const event = obj(raw)
  const id = str(event?.["id"])
  const type = str(event?.["type"])
  const created = secondsToDate(event?.["created"])
  const object = obj(obj(event?.["data"])?.["object"])
  if (event === undefined || id === null || type === null || created === null || object === undefined) return undefined
  const head = { id, type, created }
  if (type.startsWith("customer.subscription.")) {
    const subscription = subscriptionOf(object)
    return subscription === undefined ? { ...head, kind: "other" } : { ...head, kind: "subscription", subscription }
  }
  if (type.startsWith("invoice.")) {
    const invoice = invoiceOf(object)
    return invoice === undefined ? { ...head, kind: "other" } : { ...head, kind: "invoice", invoice }
  }
  if (type === "checkout.session.completed" && object["mode"] === "subscription") {
    const customer = idOf(object["customer"])
    if (customer === null) return { ...head, kind: "other" }
    return {
      ...head,
      kind: "checkout",
      customerId: customer,
      subscriptionId: idOf(object["subscription"]),
      workspaceId: str(object["client_reference_id"]) ?? str(obj(object["metadata"])?.["insyte_workspace"])
    }
  }
  return { ...head, kind: "other" }
}

/** The price a target's plan and seats need, per cycle; `undefined` where Stripe has none. */
export const pricesFor = (prices: ReadonlyArray<PlanPrice>, target: Target) => ({
  base: prices.find((p) => p.plan === target.plan && p.cycle === target.cycle),
  seat: prices.find((p) => p.plan === "seat" && p.cycle === target.cycle)
})
