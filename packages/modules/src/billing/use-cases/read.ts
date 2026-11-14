import { Db } from "@insyte/database/Db"
import { NotFound } from "@insyte/domain/Errors"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import { PLAN_AI_REPLIES, PLAN_SEATS, PLAN_STORES, type PlanId } from "../../shared/domain/Billing.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import { BillingPlans, InvoicePage } from "../domain/Billing.ts"
import { BillingProvider } from "../domain/Ports.ts"
import { peopleOnly } from "./guard.ts"
import { overview } from "./state.ts"

/*
 * Facturatie's reads (M13 step 1; widgets/05 §4): the page from the cache, the plans with Stripe's prices, the invoices,
 * and one invoice's link. Facturatie · Bekijken (`billing≥1`) reads the page; the invoices and their links take
 * `billing.invoices` (api.md §2.16).
 */

const PLANS: ReadonlyArray<PlanId> = ["starter", "growth", "scale"]
const PAGE = 24

export const get = Effect.fn("Billing.get")(function*() {
  yield* peopleOnly
  yield* Policy.require("billing", 1)
  const provider = yield* BillingProvider
  return yield* (yield* Db).scoped((sql) => overview(sql, provider.configured))
})

/** The picker: each plan with what it includes and what Stripe says it costs. No price in Stripe is `null`, not 0. */
export const plans = Effect.fn("Billing.plans")(function*() {
  yield* peopleOnly
  yield* Policy.require("billing", 1)
  const provider = yield* BillingProvider
  const prices = provider.configured ? yield* provider.prices : []
  const amount = (plan: PlanId | "seat", cycle: "monthly" | "annual") =>
    prices.find((p) => p.plan === plan && p.cycle === cycle)?.unitAmountMinor ?? null
  return new BillingPlans({
    currency: prices[0]?.currency ?? "eur",
    plans: PLANS.map((plan) => ({
      plan,
      monthlyMinor: amount(plan, "monthly"),
      annualMinor: amount(plan, "annual"),
      seats: PLAN_SEATS[plan],
      stores: PLAN_STORES[plan],
      aiReplies: PLAN_AI_REPLIES[plan]
    })),
    seat: { monthlyMinor: amount("seat", "monthly"), annualMinor: amount("seat", "annual") }
  })
})

const parseCursor = (cursor: string | null | undefined) => {
  if (cursor === null || cursor === undefined) return null
  const [at, id] = cursor.split(":")
  const time = Number(at)
  return Number.isFinite(time) && id !== undefined && id !== "" ? { at: new Date(time), id } : null
}

/** Newest first, a page at a time. */
export const invoices = Effect.fn("Billing.invoices")(
  function*(input: { readonly cursor?: string | null | undefined }) {
    yield* peopleOnly
    yield* Policy.requireAction("billing.invoices")
    const after = parseCursor(input.cursor)
    const rows = yield* (yield* Db).scoped((sql) =>
      sql<
        {
          id: string
          number: string | null
          issuedAt: Date
          amountMinor: string | number
          currency: string
          status: string
        }
      >`
      select id, number, issued_at, amount_minor, currency, status from invoices
      where status <> 'draft'
        and (${after?.at ?? null}::timestamptz is null
             or (issued_at, id) < (${after?.at ?? null}::timestamptz, ${after?.id ?? ""}))
      order by issued_at desc, id desc
      limit ${PAGE + 1}`
    )
    const page = rows.slice(0, PAGE)
    const last = page.at(-1)
    return new InvoicePage({
      rows: page.map((r) => ({
        id: r.id,
        number: r.number,
        issuedAt: r.issuedAt.getTime(),
        amountMinor: Number(r.amountMinor),
        currency: r.currency,
        status: r.status as "draft" | "open" | "paid" | "uncollectible" | "void"
      })),
      next: rows.length > PAGE && last !== undefined ? `${last.issuedAt.getTime()}:${last.id}` : null
    })
  }
)

/**
 * Stripe's PDF of one invoice (its hosted page where there is no PDF), as Stripe has it now: its links can change, so
 * the cached ones are only what is opened when Stripe does not answer. Audited: who opened which invoice.
 */
export const invoiceUrl = Effect.fn("Billing.invoiceUrl")(function*(input: { readonly id: string }) {
  yield* peopleOnly
  yield* Policy.requireAction("billing.invoices")
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  // The workspace's own invoice, or none: the row is what fences it.
  const [row] = yield* db.scoped((sql) =>
    sql<
      { pdfUrl: string | null; hostedUrl: string | null }
    >`select pdf_url, hosted_url from invoices where id = ${input.id}`
  )
  if (row === undefined) return yield* new NotFound({ entity: "invoice", id: input.id })
  const provider = yield* BillingProvider
  const fresh = provider.configured
    ? yield* provider.invoice(input.id).pipe(
      Effect.catchTag(
        "BillingUnavailable",
        (e) => Effect.logWarning("stripe invoice not read again", { reason: e.reason }).pipe(Effect.as(undefined))
      )
    )
    : undefined
  const url = fresh?.pdfUrl ?? fresh?.hostedUrl ?? row.pdfUrl ?? row.hostedUrl ?? null
  if (url === null) return yield* new NotFound({ entity: "invoice", id: input.id })
  yield* db.scoped((sql) =>
    Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
      action: "billing.invoice_opened",
      subjectType: "invoice",
      subjectId: input.id
    })
  )
  return { url }
})
