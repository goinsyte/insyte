import { FAKE_INFO, makeAnthropic, makeFake, MODEL_INFO, NO_MODEL } from "@insyte/integrations-anthropic/Anthropic"
import { AiModel } from "@insyte/modules/ai/domain/Ai"
import { Embedder } from "@insyte/modules/knowledge/domain/Knowledge"
import { Context, Effect, Option } from "effect"
import { LanguageModel } from "effect/ai"
import { aiModeOf, AiSettings, askModeOf, filled } from "./AiSettings.ts"
import { embedder } from "./Embeddings.ts"

/*
 * Insyte AI's model (M15 step 1; ADR-0015), chosen per call by configuration:
 *
 * - `AI_ADAPTER=fake` (the worker tests and local runs, in `wrangler.jsonc`): the fake, each prompt's own
 *   deterministic answer, free, sent nowhere, whatever keys `.dev.vars` holds.
 * - Claude through the stage's AI Gateway where the stage has the Anthropic key, the gateway and the account
 *   (`infra/app.ts`, which refuses a stage with only some of them).
 * - Otherwise (previews, a stage not set up yet) no model: `ready: false`, so no call is made and the console says
 *   Insyte AI is not switched on yet. The fake's template text is never shown there as Insyte's draft.
 * - Vraag Insyte (`AskModelChoice`) takes the fake on a preview or a local run without a model (`AiSettings.ts`).
 *
 * A reply reads the knowledge base by meaning with the stage's embedder (`Embeddings.ts`), which comes with it.
 *
 * The choice itself is `AiSettings.ts`, which `Drafts.status` reads without loading this module.
 *
 * Building any of them does no I/O: the SDK is imported on the first call. This module is loaded only for an AI call
 * (`Ai.ts`), never when a Worker starts.
 */

export * as Ai from "@insyte/modules/ai/Ai"

const of = (info: typeof MODEL_INFO, model: LanguageModel.LanguageModel) =>
  Context.make(AiModel, info).pipe(Context.add(LanguageModel.LanguageModel, model))

const choose = (modeOf: (c: AiSettings) => "fake" | "anthropic" | "off") =>
  Effect.gen(function*() {
    const c = yield* AiSettings
    const mode = modeOf(c)
    if (mode === "fake") return of(FAKE_INFO, yield* makeFake)
    const apiKey = filled(c.apiKey)
    if (mode === "off" || Option.isNone(apiKey)) return of(NO_MODEL, yield* makeFake)
    const model = yield* makeAnthropic({
      accountId: c.accountId,
      gatewayId: c.gatewayId,
      apiKey: apiKey.value,
      gatewayToken: Option.getOrUndefined(filled(c.gatewayToken))
    })
    return of(MODEL_INFO, model)
  })

/** With the stage's embedder (`Embeddings.ts`), which reads the knowledge base by meaning. */
const withEmbedderOf = (model: ReturnType<typeof choose>) =>
  Effect.map(Effect.all([model, embedder]), ([context, e]) => Context.add(context, Embedder, e))

/** The stage's model and what it is, and its embedder, as the context an AI call runs in. */
export const services = withEmbedderOf(choose(aiModeOf))

/** Vraag Insyte's model (`askModeOf`): the stage's, or the fake where a preview or a local run has none. */
export const AskModelChoice = withEmbedderOf(choose(askModeOf))
