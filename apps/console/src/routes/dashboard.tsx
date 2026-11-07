import { createFileRoute, redirect } from "@tanstack/react-router"
import { Effect, Option } from "effect"
import { AtomRegistry } from "effect/reactivity"
import { sessionMeAtom } from "../data/session.ts"

/**
 * Where sign-in lands when there is no `redirect` (the screen's default), and the console's first client gate (M2.4):
 * `Session.me` decides, before any HTML. Signed in, it is the person's landing, which is `/onboarding` until they have
 * a workspace (step 3); signed out or expired, it is sign-in with the way back. The Worker's cookie check catches a
 * missing cookie first; this catches one the API no longer accepts.
 */
export const Route = createFileRoute("/dashboard")({
  beforeLoad: async ({ context }) => {
    const me = await Effect.runPromise(
      AtomRegistry.getResult(context.registry, sessionMeAtom).pipe(
        Effect.asSome,
        Effect.catchTag("Unauthenticated", () => Effect.succeedNone)
      )
    )
    if (Option.isNone(me)) throw redirect({ to: "/login", search: { redirect: "/dashboard" } })
    throw redirect({ href: me.value.landing })
  }
})
