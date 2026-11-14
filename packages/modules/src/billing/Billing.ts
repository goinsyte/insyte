import type { Db } from "@insyte/database/Db"
import type { Forbidden, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import { SqlError } from "effect/sql"
import type { Relay } from "../shared/domain/Outbox.ts"
import type {
  BillingChange,
  BillingChangeInput,
  BillingLink,
  BillingOverview,
  BillingPlans,
  BillingPreview,
  BillingUnavailable,
  CancelInput,
  ChangePlanInput,
  ChangeSeatsInput,
  InvoicePage,
  NoExtraSeats,
  NoSubscription,
  SeatsExceedPlan,
  StoresExceedPlan
} from "./domain/Billing.ts"
import type { BillingProvider } from "./domain/Ports.ts"
import * as Change from "./use-cases/change.ts"
import * as Read from "./use-cases/read.ts"
import * as Webhook from "./use-cases/webhook.ts"

type R = Db | CurrentPrincipal | BillingProvider

type ChangeError = Forbidden | BillingUnavailable | NoSubscription | NoExtraSeats | SeatsExceedPlan | StoresExceedPlan

export interface BillingService {
  readonly get: Effect.Effect<BillingOverview, Forbidden, R>
  readonly plans: Effect.Effect<BillingPlans, Forbidden | BillingUnavailable, R>
  readonly previewChange: (input: BillingChangeInput) => Effect.Effect<BillingPreview, ChangeError, R>
  readonly changePlan: (input: ChangePlanInput) => Effect.Effect<BillingChange, ChangeError, R>
  readonly addSeats: (input: ChangeSeatsInput) => Effect.Effect<BillingChange, ChangeError, R>
  readonly removeSeats: (input: ChangeSeatsInput) => Effect.Effect<BillingChange, ChangeError, R>
  readonly cancel: (
    input: CancelInput
  ) => Effect.Effect<BillingOverview, Forbidden | BillingUnavailable | NoSubscription, R>
  readonly resume: Effect.Effect<BillingOverview, Forbidden | BillingUnavailable | NoSubscription, R>
  readonly portalSession: Effect.Effect<BillingLink, Forbidden | BillingUnavailable | NoSubscription, R>
  readonly invoices: (
    input: { readonly cursor?: string | null | undefined }
  ) => Effect.Effect<InvoicePage, Forbidden, R>
  readonly invoiceUrl: (input: { readonly id: string }) => Effect.Effect<BillingLink, Forbidden | NotFound, R>
}

/**
 * Facturatie (M13 step 1): Insyte's own subscription at Stripe, its plan, seats, card and invoices. Reading needs
 * Facturatie · Bekijken, changing it Beheren, an invoice's link `billing.invoices`; people only. A plain object, not a
 * layer: the API Worker imports this module on the first billing call (`handlers/billing.ts`), never at startup. A
 * database that does not answer is a defect, as everywhere.
 */
export const Billing: BillingService = {
  get: Read.get().pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
  plans: Read.plans().pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
  previewChange: (input) => Change.previewChange(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
  changePlan: (input) => Change.changePlan(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
  addSeats: (input) => Change.addSeats(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
  removeSeats: (input) => Change.removeSeats(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
  cancel: (input) => Change.cancel(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
  resume: Change.resume().pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
  portalSession: Change.portalSession().pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
  invoices: (input) => Read.invoices(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
  invoiceUrl: (input) => Read.invoiceUrl(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))
}

/** Stripe's webhook, before the 200 (the API Worker's `/hooks/stripe`). */
export const receiveWebhook = (
  delivery: Webhook.Delivery
): Effect.Effect<Webhook.Received, never, Db | BillingProvider | Relay> => Webhook.receive(delivery).pipe(Effect.orDie)
