import { Resources } from "@insyte/ui/app/affiliate/resources-screen"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import { AtomRegistry } from "effect/reactivity"
import { affiliateResourcesAtom } from "../data/affiliate-portal.ts"

/** The brand's material (M16 step 5): downloads and previews through `/api/affiliate/resources/:id`. */
export const Route = createFileRoute("/_affiliate/affiliate/resources")({
  head: () => ({ meta: [{ title: "Materiaal · Insyte" }] }),
  loader: async ({ context }) => {
    context.registry.mount(affiliateResourcesAtom)
    await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, affiliateResourcesAtom)))
  },
  pendingComponent: () => <PageSkeleton kind="cards" title="Materiaal" />,
  component: Resources
})
