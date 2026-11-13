import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { SupplierDashboard } from "@insyte/ui/app/supplier/dashboard-screen"
import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import { AtomRegistry } from "effect/reactivity"
import { portalDashboardAtom } from "../data/supplier-portal.ts"

/** The supplier's start (M16 step 2): the design's dashboard over `SupplierPortal.dashboard`, read on the server. */
export const Route = createFileRoute("/_supplier/supplier/dashboard")({
  head: () => ({ meta: [{ title: "Overzicht · Insyte" }] }),
  loader: async ({ context }) => {
    context.registry.mount(portalDashboardAtom)
    await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, portalDashboardAtom)))
  },
  pendingComponent: () => <PageSkeleton kind="dashboard" title="Overzicht" />,
  component: SupplierDashboard
})
