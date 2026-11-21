import { type NavigateFn, type ParsedLocation, redirect } from "@tanstack/react-router"
import { Effect, Option } from "effect"
import { AtomRegistry } from "effect/reactivity"
import { sessionMeAtom } from "../data/session.ts"

/**
 * The signed-in layouts' client gate (`_frame`, `_supplier`, `_affiliate`, M2.4): signed out, sign-in with the way back;
 * signed in as someone who lands elsewhere, where they land.
 *
 * Entering the layout waits for the answer, so nothing of it renders for the wrong person. Moving between its screens
 * (`cause: "stay"`) does not: the layout already let this person in, and holding every click on a round trip to
 * `Session.me` is what kept the old screen up, the skeleton away and the navigation line still (ADR-0028). The question
 * still goes out; a session that has ended sends the browser to sign-in when the answer comes back. A preload asks
 * nothing: what it warms is never shown without a navigation, which asks.
 */
export const admit = (
  landing: string,
  { context, location, cause, navigate }: {
    readonly context: { readonly registry: AtomRegistry.AtomRegistry }
    readonly location: ParsedLocation
    readonly cause: "preload" | "enter" | "stay"
    readonly navigate: NavigateFn
  }
): Promise<void> | undefined => {
  if (cause === "preload") return undefined
  const asked = Effect.runPromise(
    AtomRegistry.getResult(context.registry, sessionMeAtom).pipe(
      Effect.asSome,
      Effect.catchTag("Unauthenticated", () => Effect.succeedNone)
    )
  )
  if (cause === "stay") {
    void asked.then(
      (me) => {
        if (Option.isNone(me)) void navigate({ to: "/login", search: { redirect: location.href }, replace: true })
        else if (me.value.landing !== landing) void navigate({ href: me.value.landing, replace: true })
      },
      // A failed check on the way between screens changes nothing; the next one, or the screen's own read, tells.
      () => undefined
    )
    return undefined
  }
  return asked.then((me) => {
    if (Option.isNone(me)) throw redirect({ to: "/login", search: { redirect: location.href } })
    if (me.value.landing !== landing) throw redirect({ href: me.value.landing })
  })
}
