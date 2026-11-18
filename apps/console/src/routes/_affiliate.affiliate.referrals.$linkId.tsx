import { NotFound } from "@insyte/domain/Errors"
import { LinkDetail } from "@insyte/ui/app/affiliate/referral-screen"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { createFileRoute, notFound } from "@tanstack/react-router"
import { Effect, Exit, Schema } from "effect"
import { AtomRegistry } from "effect/reactivity"
import { affiliateLinkAtom, affiliateLinkConversionsAtom } from "../data/affiliate-portal.ts"

const isNotFound = Schema.is(NotFound)

/** One of the affiliate's links (M16 step 3); one that is not theirs is the router's not-found. */
export const Route = createFileRoute("/_affiliate/affiliate/referrals/$linkId")({
  head: () => ({ meta: [{ title: "Link · Insyte" }] }),
  loader: async ({ context, params }) => {
    const atom = affiliateLinkAtom(params.linkId)
    context.registry.mount(atom)
    const rows = affiliateLinkConversionsAtom(params.linkId)
    context.registry.mount(rows)
    await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, rows)))
    const exit = await Effect.runPromiseExit(AtomRegistry.getResult(context.registry, atom))
    if (Exit.isFailure(exit) && exit.cause.reasons.some((r) => r._tag === "Fail" && isNotFound(r.error))) {
      throw notFound()
    }
  },
  pendingComponent: () => <PageSkeleton kind="document" />,
  component: LinkDetail
})
