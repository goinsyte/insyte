import { NotFound } from "@insyte/domain/Errors"
import { PayoutMonth } from "@insyte/ui/app/affiliate/payout-screen"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { createFileRoute, notFound } from "@tanstack/react-router"
import { Effect, Exit, Schema } from "effect"
import { AtomRegistry } from "effect/reactivity"
import { affiliatePayoutAtom } from "../data/affiliate-portal.ts"

const isNotFound = Schema.is(NotFound)

/** One month's payout (M16 step 5), order by order; a month without one is the router's not-found. */
export const Route = createFileRoute("/_affiliate/affiliate/payouts/$month")({
  head: () => ({ meta: [{ title: "Uitbetaling · Insyte" }] }),
  loader: async ({ context, params }) => {
    const atom = affiliatePayoutAtom(params.month)
    context.registry.mount(atom)
    const exit = await Effect.runPromiseExit(AtomRegistry.getResult(context.registry, atom))
    if (Exit.isFailure(exit) && exit.cause.reasons.some((r) => r._tag === "Fail" && isNotFound(r.error))) {
      throw notFound()
    }
  },
  pendingComponent: () => <PageSkeleton kind="document" />,
  component: PayoutMonth
})
