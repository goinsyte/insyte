import { FAKE_INFO, makeAnthropic, makeFake, MODEL_INFO } from "@insyte/integrations-anthropic/Anthropic"
import { AiModel } from "@insyte/modules/ai/Ai"
import { Config, Effect, Layer, Option, Redacted } from "effect"
import { LanguageModel } from "effect/ai"

/*
 * Insyte AI's model (M15 step 1; ADR-0015): Claude through the stage's AI Gateway where the stage has the Anthropic key,
 * the gateway and the account (`infra/app.ts`), else the fake: each prompt's own deterministic answer, free, sent
 * nowhere. The worker tests, local runs and previews have the fake. Building either does no I/O: the SDK is imported on
 * the first call.
 */

const Gateway = Config.all({
  apiKey: Config.Redacted("ANTHROPIC_API_KEY").pipe(Config.option),
  gatewayId: Config.String("AI_GATEWAY_ID").pipe(Config.withDefault("")),
  accountId: Config.String("AI_ACCOUNT_ID").pipe(Config.withDefault("")),
  gatewayToken: Config.Redacted("AI_GATEWAY_TOKEN").pipe(Config.option)
})

const filled = (o: Option.Option<Redacted.Redacted<string>>) => Option.filter(o, (r) => Redacted.value(r) !== "")

export const AiChoice = Layer.unwrap(
  Effect.map(Gateway, (c) => {
    const apiKey = filled(c.apiKey)
    if (Option.isNone(apiKey) || c.gatewayId === "" || c.accountId === "") {
      return Layer.mergeAll(Layer.succeed(AiModel, FAKE_INFO), Layer.effect(LanguageModel.LanguageModel, makeFake))
    }
    return Layer.mergeAll(
      Layer.succeed(AiModel, MODEL_INFO),
      Layer.effect(
        LanguageModel.LanguageModel,
        makeAnthropic({
          accountId: c.accountId,
          gatewayId: c.gatewayId,
          apiKey: apiKey.value,
          gatewayToken: Option.getOrUndefined(filled(c.gatewayToken))
        })
      )
    )
  })
)
