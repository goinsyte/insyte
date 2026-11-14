import { useAtomValue } from "@effect/atom-react"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { Effect, Option } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { sessionMeAtom } from "../data/session.ts"
import { portalMeAtom, portalOrdersAtom } from "../data/supplier-portal.ts"
import { SupplierFrame } from "../supplier/supplier-frame.tsx"

/**
 * The supplier portal (M16 step 2): every screen of a supplier's contact sits here. Signed out, sign-in with the way
 * back; signed in as anyone who does not land in the portal (a member lands in the console), where they land. The
 * loader reads who they are and their orders on the server, so the frame and its panel paint with the document.
 */
export const Route = createFileRoute("/_supplier")({
  beforeLoad: async ({ context, location }) => {
    const me = await Effect.runPromise(
      AtomRegistry.getResult(context.registry, sessionMeAtom).pipe(
        Effect.asSome,
        Effect.catchTag("Unauthenticated", () => Effect.succeedNone)
      )
    )
    if (Option.isNone(me)) throw redirect({ to: "/login", search: { redirect: location.href } })
    if (me.value.landing !== "/supplier/dashboard") throw redirect({ href: me.value.landing })
  },
  loader: async ({ context }) => {
    // Mounted so the values survive until the registry is dehydrated into the document.
    context.registry.mount(portalMeAtom)
    context.registry.mount(portalOrdersAtom)
    await Promise.all([
      Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, portalMeAtom))),
      Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, portalOrdersAtom)))
    ])
  },
  component: SupplierRoute
})

function SupplierRoute() {
  const me = Option.getOrUndefined(AsyncResult.value(useAtomValue(portalMeAtom)))
  if (me === undefined) {
    return (
      <main className="min-h-svh bg-paper text-ink">
        <PageSkeleton kind="settings" title="Insyte" />
      </main>
    )
  }
  return <SupplierFrame me={me} />
}
