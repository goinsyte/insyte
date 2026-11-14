import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type { BillingOverview, BillingPlans, InvoicePage } from "@insyte/modules/billing/domain/Billing"
import { BillingPage } from "@insyte/ui/app/settings/billing-screen"
import { BillingSourceProvider } from "@insyte/ui/app/settings/billing-source"
import { CreditCard } from "@insyte/ui/icons"
import { createFileRoute } from "@tanstack/react-router"
import { Effect, Option } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { billingAtom, billingPlansAtom, invoicesAtom } from "../data/billing.ts"
import { useConsoleBillingSource } from "../settings/billing-source.tsx"
import { SettingsPage, SettingsPending } from "../settings/settings-page.tsx"

/**
 * Instellingen → Facturatie (M13 step 1): the reference's Abonnement, Betaalmethode and Facturen over `Billing.get`,
 * `Billing.plans` and `Billing.invoices`, read on the server. Reading takes Facturatie · Bekijken, changing it Beheren;
 * a role below reads the page with its controls disabled. The invoices take Facturen downloaden too: a role without it
 * reads the page without them, as it does when they cannot be read. Stripe's prices may be missing (billing not set up,
 * or Stripe not answering): the page still reads, and a change says why it cannot be made.
 */
export const Route = createFileRoute("/_frame/settings/billing")({
  head: () => ({ meta: [{ title: "Facturatie · Insyte" }] }),
  loader: async ({ context }) => {
    // Mounted so the values survive until the registry is dehydrated into the document.
    context.registry.mount(billingAtom)
    context.registry.mount(billingPlansAtom)
    context.registry.mount(invoicesAtom)
    await Effect.runPromise(Effect.ignore(Effect.all([
      AtomRegistry.getResult(context.registry, billingAtom),
      AtomRegistry.getResult(context.registry, billingPlansAtom),
      AtomRegistry.getResult(context.registry, invoicesAtom)
    ], { concurrency: 3 })))
  },
  pendingComponent: () => <SettingsPending title="Facturatie" />,
  component: BillingRoute
})

function BillingRoute() {
  const overview = useAtomValue(billingAtom)
  const plans = useAtomValue(billingPlansAtom)
  const invoices = useAtomValue(invoicesAtom)
  const retryOverview = useAtomRefresh(billingAtom)
  const retryPlans = useAtomRefresh(billingPlansAtom)
  const retryInvoices = useAtomRefresh(invoicesAtom)
  return (
    <SettingsPage
      result={overview}
      title="Facturatie"
      icon={CreditCard}
      denied="Je rol kan de facturatie niet zien"
      action="Billing.get"
      edit={{ area: "billing", level: 3 }}
      retry={() => {
        retryOverview()
        retryPlans()
        retryInvoices()
      }}
    >
      {(value) => (
        <Loaded
          overview={value}
          plans={Option.getOrNull(AsyncResult.value(plans))}
          invoices={Option.getOrNull(AsyncResult.value(invoices))}
        />
      )}
    </SettingsPage>
  )
}

function Loaded(
  { overview, plans, invoices }: { overview: BillingOverview; plans: BillingPlans | null; invoices: InvoicePage | null }
) {
  const source = useConsoleBillingSource(overview, plans, invoices)
  return (
    <BillingSourceProvider value={source}>
      <BillingPage />
    </BillingSourceProvider>
  )
}
