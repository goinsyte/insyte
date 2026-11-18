import { AffPayment } from "@insyte/ui/app/affiliate/settings-payment-screen"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import { AtomRegistry } from "effect/reactivity"
import { affiliatePaymentAtom } from "../data/affiliate-portal.ts"

/** Where the affiliate's payouts go (M16 step 5): the account is sealed on the server and shown only masked. */
export const Route = createFileRoute("/_affiliate/affiliate/settings/payment")({
  head: () => ({ meta: [{ title: "Uitbetaling · Insyte" }] }),
  loader: async ({ context }) => {
    context.registry.mount(affiliatePaymentAtom)
    await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, affiliatePaymentAtom)))
  },
  pendingComponent: () => <PageSkeleton kind="settings" title="Uitbetaling" />,
  component: AffPayment
})
