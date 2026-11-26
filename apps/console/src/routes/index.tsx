import { createFileRoute, redirect } from "@tanstack/react-router"
import { Effect, Option } from "effect"
import { AtomRegistry } from "effect/reactivity"
import { sessionMeAtom } from "../data/session.ts"

/**
 * The console's front door: no page of its own, it sends the person where the gate would (`auth/gate.ts`). Signed out,
 * to sign-in; signed in, to their landing (`Session.me`): `/onboarding` while their workspace is still being set up,
 * Start, or the supplier's or affiliate's portal.
 */
export const Route = createFileRoute("/")({
  beforeLoad: async ({ context, cause }) => {
    if (cause === "preload") return
    const me = await Effect.runPromise(
      AtomRegistry.getResult(context.registry, sessionMeAtom).pipe(
        Effect.asSome,
        Effect.catchTag("Unauthenticated", () => Effect.succeedNone)
      )
    )
    if (Option.isNone(me)) throw redirect({ to: "/login", statusCode: 302 })
    throw redirect({ href: me.value.landing, statusCode: 302 })
  }
})
