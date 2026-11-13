import { FAKE_INFO, makeAnthropic, makeFake, MODEL_INFO, NO_MODEL } from "@insyte/integrations-anthropic/Anthropic"
import { AiModel } from "@insyte/modules/ai/domain/Ai"
import { Config, Context, Effect, Option, Redacted } from "effect"
import { LanguageModel } from "effect/ai"

/*
 * Insyte AI's model (M15 step 1; ADR-0015), chosen per call by configuration:
 *
 * - `AI_ADAPTER=fake` (the worker tests and local runs, in `wrangler.jsonc`): the fake, each prompt's own
 *   deterministic answer, free, sent nowhere, whatever keys `.dev.vars` holds.
 * - Claude through the stage's AI Gateway where the stage has the Anthropic key, the gateway and the account
 *   (`infra/app.ts`, which refuses to deploy production without them).
 * - Otherwise (previews, a stage not set up yet) no model: `ready: false`, so the console offers no draft and no call
 *   is made. The fake's template text is never shown there as Insyte's.
 *
 * Building any of them does no I/O: the SDK is imported on the first call. This module is loaded only for an AI call
 * (`Ai.ts`), never when a Worker starts.
 */

export * as Ai from "@insyte/modules/ai/Ai"

const Settings = Config.all({
  adapter: Config.String("AI_ADAPTER").pipe(Config.withDefault("")),
  apiKey: Config.Redacted("ANTHROPIC_API_KEY").pipe(Config.option),
  gatewayId: Config.String("AI_GATEWAY_ID").pipe(Config.withDefault("")),
  accountId: Config.String("AI_ACCOUNT_ID").pipe(Config.withDefault("")),
  gatewayToken: Config.Redacted("AI_GATEWAY_TOKEN").pipe(Config.option)
})

const filled = (o: Option.Option<Redacted.Redacted<string>>) => Option.filter(o, (r) => Redacted.value(r) !== "")

const of = (info: typeof MODEL_INFO, model: LanguageModel.LanguageModel) =>
  Context.make(AiModel, info).pipe(Context.add(LanguageModel.LanguageModel, model))

/** The stage's model and what it is, as the context an AI call runs in. */
export const services = Effect.gen(function*() {
  const c = yield* Settings
  if (c.adapter === "fake") return of(FAKE_INFO, yield* makeFake)
  const apiKey = filled(c.apiKey)
  if (Option.isNone(apiKey) || c.gatewayId === "" || c.accountId === "") return of(NO_MODEL, yield* makeFake)
  const model = yield* makeAnthropic({
    accountId: c.accountId,
    gatewayId: c.gatewayId,
    apiKey: apiKey.value,
    gatewayToken: Option.getOrUndefined(filled(c.gatewayToken))
  })
  return of(MODEL_INFO, model)
})
