import { AffiliateLinks } from "@insyte/ui/app/affiliate/referrals-screen"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import { AtomRegistry } from "effect/reactivity"
import { affiliateDestinationsAtom, affiliateLinksAtom, affiliateProfileAtom } from "../data/affiliate-portal.ts"

/** The affiliate's links (M16 step 3), with "Nieuwe link" over `AffiliatePortal.links.*`. */
export const Route = createFileRoute("/_affiliate/affiliate/referrals/")({
  head: () => ({ meta: [{ title: "Doorverwijzingen · Insyte" }] }),
  loader: async ({ context }) => {
    context.registry.mount(affiliateLinksAtom)
    context.registry.mount(affiliateDestinationsAtom)
    context.registry.mount(affiliateProfileAtom)
    await Promise.all([
      Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, affiliateLinksAtom))),
      Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, affiliateDestinationsAtom))),
      Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, affiliateProfileAtom)))
    ])
  },
  pendingComponent: () => <PageSkeleton kind="table" title="Doorverwijzingen" />,
  component: AffiliateLinks
})
