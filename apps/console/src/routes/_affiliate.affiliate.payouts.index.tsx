import { Payouts } from "@insyte/ui/app/affiliate/payouts-screen"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import { AtomRegistry } from "effect/reactivity"
import { affiliatePaymentAtom, affiliatePayoutsAtom } from "../data/affiliate-portal.ts"

/** The affiliate's payouts by month (M16 step 5): the running month "loopt nog", the account only masked. */
export const Route = createFileRoute("/_affiliate/affiliate/payouts/")({
  head: () => ({ meta: [{ title: "Uitbetalingen · Insyte" }] }),
  loader: async ({ context }) => {
    context.registry.mount(affiliatePayoutsAtom)
    context.registry.mount(affiliatePaymentAtom)
    await Promise.all([
      Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, affiliatePayoutsAtom))),
      Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, affiliatePaymentAtom)))
    ])
  },
  pendingComponent: () => <PageSkeleton kind="table" title="Uitbetalingen" />,
  component: Payouts
})
