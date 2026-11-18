import { AffiliateDashboard } from "@insyte/ui/app/affiliate/dashboard-screen"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import { AtomRegistry } from "effect/reactivity"
import { affiliateDashboardAtom, affiliateProfileAtom } from "../data/affiliate-portal.ts"

/** The affiliate's start (M16 step 3): the design's dashboard over `AffiliatePortal.dashboard`, read on the server. */
export const Route = createFileRoute("/_affiliate/affiliate/dashboard")({
  head: () => ({ meta: [{ title: "Overzicht · Insyte" }] }),
  loader: async ({ context }) => {
    context.registry.mount(affiliateDashboardAtom)
    context.registry.mount(affiliateProfileAtom)
    await Promise.all([
      Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, affiliateDashboardAtom))),
      Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, affiliateProfileAtom)))
    ])
  },
  pendingComponent: () => <PageSkeleton kind="dashboard" title="Overzicht" />,
  component: AffiliateDashboard
})
