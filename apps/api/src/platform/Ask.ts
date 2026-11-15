import { AiModel, ModelUnavailable } from "@insyte/modules/ai/domain/Ai"
import { Context, Data, Effect, Stream } from "effect"
import type { LanguageModel } from "effect/ai"
import type * as Live from "./AskLive.ts"

/*
 * Vraag Insyte, loaded for the question that needs it (M15 step 3; ADR-0041 §3), as `Ai.ts` loads the drafts: the
 * loop, the prompt, `effect/ai` and the tools come with the first question in an isolate. If they do not load, or the
 * stage has no model, that question is `ModelUnavailable` before anything is kept; every other request goes on.
 */

type Live = typeof Live

class AskLoadFailed extends Data.TaggedError("AskLoadFailed")<{ readonly cause: unknown }> {}

let loading: Promise<Live> | undefined

const load = Effect.tryPromise({
  try: () => (loading ??= import("./AskLive.ts").catch((error: unknown) => {
    // Tried again on the next question.
    loading = undefined
    throw error
  })),
  catch: (cause) => new AskLoadFailed({ cause })
})

const unavailable = (what: string) => (cause: unknown) =>
  Effect.logError(`Vraag Insyte ${what}`, { cause }).pipe(Effect.andThen(new ModelUnavailable({ reason: "failed" })))

/** The stream `f` makes with the loop and its tools, over the stage's model. */
export const withAsk = <A, E, R>(
  f: (live: Pick<Live, "Answer" | "askTools">) => Stream.Stream<A, E, R>
): Stream.Stream<A, E | ModelUnavailable, Exclude<R, AiModel | LanguageModel.LanguageModel>> =>
  Stream.unwrap(Effect.gen(function*() {
    const live = yield* load.pipe(Effect.catch(unavailable("did not load")))
    const context = yield* live.services.pipe(Effect.catch(unavailable("is not configured readably")))
    if (!Context.get(context, AiModel).ready) return yield* new ModelUnavailable({ reason: "unconfigured" })
    return Stream.provideContext(f(live), context)
  }))
