import { useAtomValue } from "@effect/atom-react"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { createFileRoute, redirect } from "@tanstack/react-router"
import { Effect, Option } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { frameAtom } from "../data/frame.ts"
import { sessionMeAtom } from "../data/session.ts"
import { ConsoleFrame } from "../frame/console-frame.tsx"

/**
 * The signed-in frame (step 7.4c, M5.3): every screen of a member in a finished workspace sits in it. The gate is the
 * console's first (M2.4): signed out, sign-in with the way back; a workspace still onboarding, onboarding. The loader
 * reads `Shell.frame` on the server, so the frame paints with the document.
 */
export const Route = createFileRoute("/_frame")({
  beforeLoad: async ({ context, location }) => {
    const me = await Effect.runPromise(
      AtomRegistry.getResult(context.registry, sessionMeAtom).pipe(
        Effect.asSome,
        Effect.catchTag("Unauthenticated", () => Effect.succeedNone)
      )
    )
    if (Option.isNone(me)) throw redirect({ to: "/login", search: { redirect: location.href } })
    if (me.value.landing !== "/dashboard") throw redirect({ href: me.value.landing })
  },
  loader: async ({ context }) => {
    // Mounted so the value survives until the registry is dehydrated into the document.
    context.registry.mount(frameAtom)
    await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, frameAtom)))
  },
  component: FrameRoute
})

function FrameRoute() {
  const frame = Option.getOrUndefined(AsyncResult.value(useAtomValue(frameAtom)))
  if (frame === undefined) {
    return (
      <main className="min-h-svh bg-paper text-ink">
        <PageSkeleton kind="settings" title="Insyte" />
      </main>
    )
  }
  return <ConsoleFrame frame={frame} />
}
