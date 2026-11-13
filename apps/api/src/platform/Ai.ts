import { type AiModel, ModelUnavailable } from "@insyte/modules/ai/domain/Ai"
import { Effect } from "effect"
import type { LanguageModel } from "effect/ai"
import type * as Live from "./AiLive.ts"

/*
 * Insyte AI, loaded for the call that needs it (M15; ADR-0041 §3): `AiLive.ts` (the slice's module, `effect/ai`, the
 * stage's model) is imported on the first AI call in an isolate, not when the Worker starts and not with any runtime
 * or layer. If it fails to load, or the stage's settings do not read, that one call is `ModelUnavailable` and says why
 * in the logs; every other request, the relay and the background work go on without it.
 */

type Live = typeof Live

let loading: Promise<Live> | undefined

const load = Effect.tryPromise({
  try: () => (loading ??= import("./AiLive.ts").catch((error: unknown) => {
    // Tried again on the next call.
    loading = undefined
    throw error
  })),
  catch: (cause) => cause
})

const unavailable = (what: string) => (cause: unknown) =>
  Effect.logError(`Insyte AI ${what}`, { cause }).pipe(Effect.andThen(new ModelUnavailable({ reason: "failed" })))

/** `f` with Insyte AI's module, over the stage's model. */
export const withAi = <A, E, R>(
  f: (ai: Live["Ai"]) => Effect.Effect<A, E, R>
): Effect.Effect<A, E | ModelUnavailable, Exclude<R, AiModel | LanguageModel.LanguageModel>> =>
  Effect.gen(function*() {
    const live = yield* load.pipe(Effect.catch(unavailable("did not load")))
    const context = yield* live.services.pipe(Effect.catch(unavailable("is not configured readably")))
    return yield* Effect.provideContext(f(live.Ai), context)
  })
