import { Forbidden, NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { BillingOverview, BillingPlans, BillingUnavailable, InvoicePage } from "@insyte/modules/billing/domain/Billing"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"

/*
 * Instellingen → Facturatie (M13 step 1): the plan, its seats and card, Stripe's prices and the first page of invoices,
 * each primed by the route's loader and carried in the document. Every change names `BILLING` and `TEAM` (the team's
 * seats follow the subscription); Stripe's webhooks reach the tab as a `billing` change.
 */

export const BILLING = ["billing"] as const

const errors = Schema.Union([Forbidden, NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])

export const billingAtom = Atom.serializable(
  ConsoleClient.query("Billing.get", undefined, { reactivityKeys: BILLING }),
  {
    key: "billing",
    schema: AsyncResult.Schema({ success: BillingOverview, error: errors }),
    skipInitialRun: true
  }
)

export const billingPlansAtom = Atom.serializable(
  ConsoleClient.query("Billing.plans", undefined, { reactivityKeys: BILLING }),
  {
    key: "billing-plans",
    schema: AsyncResult.Schema({
      success: BillingPlans,
      error: Schema.Union([Forbidden, NoWorkspace, Unauthenticated, BillingUnavailable, RpcClientError.RpcClientError])
    }),
    skipInitialRun: true
  }
)

export const invoicesAtom = Atom.serializable(
  ConsoleClient.query("Billing.invoices", {}, { reactivityKeys: BILLING }),
  {
    key: "billing-invoices",
    schema: AsyncResult.Schema({ success: InvoicePage, error: errors }),
    skipInitialRun: true
  }
)

export const billingWrites = {
  preview: ConsoleClient.mutation("Billing.previewChange"),
  changePlan: ConsoleClient.mutation("Billing.changePlan"),
  addSeats: ConsoleClient.mutation("Billing.addSeats"),
  removeSeats: ConsoleClient.mutation("Billing.removeSeats"),
  cancel: ConsoleClient.mutation("Billing.cancel"),
  resume: ConsoleClient.mutation("Billing.resume"),
  portal: ConsoleClient.mutation("Billing.portalSession"),
  invoices: ConsoleClient.mutation("Billing.invoices"),
  invoiceUrl: ConsoleClient.mutation("Billing.invoiceUrl")
} as const
