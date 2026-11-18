import { AffProfile } from "@insyte/ui/app/affiliate/settings-profile-screen"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { createFileRoute } from "@tanstack/react-router"
import { Effect } from "effect"
import { AtomRegistry } from "effect/reactivity"
import { affiliateProfileAtom } from "../data/affiliate-portal.ts"

/** The affiliate's profile (M16 step 3): the name is theirs to change; code, tier and address are read-only. */
export const Route = createFileRoute("/_affiliate/affiliate/settings/profile")({
  head: () => ({ meta: [{ title: "Profiel · Insyte" }] }),
  loader: async ({ context }) => {
    context.registry.mount(affiliateProfileAtom)
    await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, affiliateProfileAtom)))
  },
  pendingComponent: () => <PageSkeleton kind="settings" title="Profiel" />,
  component: AffProfile
})
