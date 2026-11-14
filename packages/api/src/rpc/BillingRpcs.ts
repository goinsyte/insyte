import { Forbidden, NotFound } from "@insyte/domain/Errors"
import {
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
  InvoicesInput,
  InvoiceUrlInput,
  NoExtraSeats,
  NoSubscription,
  SeatsExceedPlan,
  StoresExceedPlan
} from "@insyte/modules/billing/domain/Billing"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

const ChangeRefused = Schema.Union([
  Forbidden,
  BillingUnavailable,
  NoSubscription,
  NoExtraSeats,
  SeatsExceedPlan,
  StoresExceedPlan
])
const Refused = Schema.Union([Forbidden, BillingUnavailable, NoSubscription])

/**
 * Facturatie (M13 step 1): Insyte's own subscription at Stripe. Facturatie · Bekijken reads, Beheren changes, an
 * invoice's link takes `billing.invoices`. A plan or seats change is irreversible from Insyte's side: the console
 * confirms with `Billing.previewChange` first. Not reachable by an API key or an agent (`billing` is `api: false`).
 */
export class BillingRpcs extends RpcGroup.make(
  Rpc.make("Billing.get", { success: BillingOverview, error: Forbidden }),
  Rpc.make("Billing.plans", { success: BillingPlans, error: Schema.Union([Forbidden, BillingUnavailable]) }),
  Rpc.make("Billing.previewChange", { payload: BillingChangeInput, success: BillingPreview, error: ChangeRefused }),
  Rpc.make("Billing.changePlan", { payload: ChangePlanInput, success: BillingChange, error: ChangeRefused }),
  Rpc.make("Billing.addSeats", { payload: ChangeSeatsInput, success: BillingChange, error: ChangeRefused }),
  Rpc.make("Billing.removeSeats", { payload: ChangeSeatsInput, success: BillingChange, error: ChangeRefused }),
  Rpc.make("Billing.cancel", { payload: CancelInput, success: BillingOverview, error: Refused }),
  Rpc.make("Billing.resume", { success: BillingOverview, error: Refused }),
  Rpc.make("Billing.portalSession", { success: BillingLink, error: Refused }),
  Rpc.make("Billing.invoices", { payload: InvoicesInput, success: InvoicePage, error: Forbidden }),
  Rpc.make("Billing.invoiceUrl", {
    payload: InvoiceUrlInput,
    success: BillingLink,
    error: Schema.Union([Forbidden, NotFound])
  })
)
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
