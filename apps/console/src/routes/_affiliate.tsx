import { useAtomValue } from "@effect/atom-react"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { Effect, Option } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { AffiliateFrame } from "../affiliate/affiliate-frame.tsx"
import { affiliateMeAtom } from "../data/affiliate-portal.ts"
import { sessionMeAtom } from "../data/session.ts"

/**
 * The affiliate portal (M16 steps 3–5): every screen of an affiliate sits here. Signed out, sign-in with the way back;
 * signed in as anyone who does not land in the portal (a member lands in the console), where they land. The loader
 * reads where they stand with the programme on the server, so the frame, or its gate, paints with the document.
 */
export const Route = createFileRoute("/_affiliate")({
  beforeLoad: async ({ context, location }) => {
    const me = await Effect.runPromise(
      AtomRegistry.getResult(context.registry, sessionMeAtom).pipe(
        Effect.asSome,
        Effect.catchTag("Unauthenticated", () => Effect.succeedNone)
      )
    )
    if (Option.isNone(me)) throw redirect({ to: "/login", search: { redirect: location.href } })
    if (me.value.landing !== "/affiliate/dashboard") throw redirect({ href: me.value.landing })
  },
  loader: async ({ context }) => {
    // Mounted so the value survives until the registry is dehydrated into the document.
    context.registry.mount(affiliateMeAtom)
    await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, affiliateMeAtom)))
  },
  component: AffiliateRoute
})

function AffiliateRoute() {
  const me = Option.getOrUndefined(AsyncResult.value(useAtomValue(affiliateMeAtom)))
  if (me === undefined) {
    return (
      <main className="min-h-svh bg-paper text-ink">
        <PageSkeleton kind="settings" title="Insyte" />
      </main>
    )
  }
  return <AffiliateFrame me={me} />
}
