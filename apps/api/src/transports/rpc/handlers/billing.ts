import { BillingRpcs } from "@insyte/api/rpc/BillingRpcs"
import type * as Module from "@insyte/modules/billing/Billing"
import { Effect } from "effect"

/*
 * Facturatie (M13 step 1). The slice's use cases load with the first billing call in an isolate, not with the RPC
 * layer (ADR-0041 §3): the api Worker's startup has no room for a page most people open once a month. A load that
 * fails is a defect of that call; the next one tries again.
 */

let loading: Promise<typeof Module> | undefined

const billing = Effect.promise(() => (loading ??= import("@insyte/modules/billing/Billing").catch((error: unknown) => {
  loading = undefined
  throw error
}))).pipe(Effect.map((m) => m.Billing))

const withBilling = <A, E, R>(f: (b: Module.BillingService) => Effect.Effect<A, E, R>) => Effect.flatMap(billing, f)

export const BillingHandlers = BillingRpcs.toLayer(Effect.succeed(BillingRpcs.of({
  "Billing.get": () => withBilling((b) => b.get),
  "Billing.plans": () => withBilling((b) => b.plans),
  "Billing.previewChange": (input) => withBilling((b) => b.previewChange(input)),
  "Billing.changePlan": (input) => withBilling((b) => b.changePlan(input)),
  "Billing.addSeats": (input) => withBilling((b) => b.addSeats(input)),
  "Billing.removeSeats": (input) => withBilling((b) => b.removeSeats(input)),
  "Billing.cancel": (input) => withBilling((b) => b.cancel(input)),
  "Billing.resume": () => withBilling((b) => b.resume),
  "Billing.portalSession": () => withBilling((b) => b.portalSession),
  "Billing.invoices": (input) => withBilling((b) => b.invoices(input)),
  "Billing.invoiceUrl": (input) => withBilling((b) => b.invoiceUrl(input))
})))
