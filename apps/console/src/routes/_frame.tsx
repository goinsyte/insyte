import { useAtomValue } from "@effect/atom-react"
import { PageSkeleton } from "@insyte/ui/app/loading/page-skeletons"
import { createFileRoute } from "@tanstack/react-router"
import { Effect, Option } from "effect"
import { AsyncResult, AtomRegistry } from "effect/reactivity"
import { useEffect } from "react"
import { admit } from "../auth/gate.ts"
import { frameAtom } from "../data/frame.ts"
import { ConsoleFrame } from "../frame/console-frame.tsx"
import { InAppNotFound } from "../frame/not-found.tsx"
import { applyNotation, leaveNotation } from "../frame/notation.ts"

/**
 * The signed-in frame (step 7.4c, M5.3): every screen of a member in a finished workspace sits in it. The gate is the
 * console's first (M2.4): signed out, sign-in with the way back; a workspace still onboarding, onboarding. The loader
 * reads `Shell.frame` on the server, so the frame paints with the document. An address under one of its areas that no
 * screen answers (`/settings/integrations/x`, `/orders/1/x`) is said inside it, where the page would be.
 */
export const Route = createFileRoute("/_frame")({
  beforeLoad: (options) => admit("/dashboard", options),
  loader: async ({ context }) => {
    // Mounted so the value survives until the registry is dehydrated into the document.
    context.registry.mount(frameAtom)
    await Effect.runPromise(Effect.ignore(AtomRegistry.getResult(context.registry, frameAtom)))
  },
  component: FrameRoute,
  notFoundComponent: InAppNotFound
})

function FrameRoute() {
  const frame = Option.getOrUndefined(AsyncResult.value(useAtomValue(frameAtom)))
  const notation = frame?.notation
  const written = notation === undefined ? undefined : `${notation.dateFormat}|${notation.timeFormat}`
  // Leaving the workspace (a portal, signing out): its notation stays behind.
  useEffect(() => {
    if (notation !== undefined) applyNotation(notation)
    return leaveNotation
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `written` is the notation's value
  }, [written])
  if (frame === undefined) {
    return (
      <main className="min-h-svh bg-paper text-ink">
        <PageSkeleton kind="settings" title="Insyte" />
      </main>
    )
  }
  // Before the screens inside render: they write dates in the workspace's notation. Regio saved another: the screens
  // already shown are drawn again, in the new one (keyed, as a screen that did not change would not render again).
  applyNotation(frame.notation)
  return <ConsoleFrame key={written} frame={frame} />
}
