import { Config, Effect, Option, Redacted } from "effect"

/*
 * Which model a stage has (M15 step 1; ADR-0015), read from its settings alone, so that saying whether Insyte AI is on
 * loads neither the slice nor `effect/ai`. `AiLive.ts` builds the model from the same reading.
 *
 * - `fake`: `AI_ADAPTER=fake` (the worker tests and local runs, in `wrangler.jsonc`), whatever keys `.dev.vars` holds.
 * - `anthropic`: the stage has the Anthropic key, the gateway and the account (`infra/app.ts`).
 * - `off`: none of that (previews, a stage not set up yet). No call is made and the console says Insyte AI is not
 *   switched on yet.
 *
 * Vraag Insyte alone (`askModeOf`) takes the fake where a preview or a local run has no model: its answers are the
 * tools' own figures, read as the person asking, so a preview shows the real thing on the fake's words. Drafts, the
 * agent and Zelfstandigheid stay off there, and staging and production never take the fake without `AI_ADAPTER=fake`.
 */

export const AiSettings = Config.all({
  adapter: Config.String("AI_ADAPTER").pipe(Config.withDefault("")),
  apiKey: Config.Redacted("ANTHROPIC_API_KEY").pipe(Config.option),
  gatewayId: Config.String("AI_GATEWAY_ID").pipe(Config.withDefault("")),
  accountId: Config.String("AI_ACCOUNT_ID").pipe(Config.withDefault("")),
  gatewayToken: Config.Redacted("AI_GATEWAY_TOKEN").pipe(Config.option),
  environment: Config.String("ENVIRONMENT").pipe(Config.withDefault("local"))
})

export type AiSettings = typeof AiSettings extends Config.Config<infer A> ? A : never

/** A secret that is set and not empty (an unset GitHub secret arrives empty). */
export const filled = (o: Option.Option<Redacted.Redacted<string>>) => Option.filter(o, (r) => Redacted.value(r) !== "")

export const aiModeOf = (s: AiSettings): "fake" | "anthropic" | "off" =>
  s.adapter === "fake"
    ? "fake"
    : Option.isSome(filled(s.apiKey)) && s.gatewayId !== "" && s.accountId !== ""
    ? "anthropic"
    : "off"

/** Vraag Insyte's model: the stage's, or the fake where a preview or a local run has none. */
export const askModeOf = (s: AiSettings): "fake" | "anthropic" | "off" => {
  const mode = aiModeOf(s)
  return mode === "off" && (s.environment === "local" || s.environment === "preview") ? "fake" : mode
}

/** This stage's model, as a word. */
export const aiMode = Effect.gen(function*() {
  return aiModeOf(yield* AiSettings)
})
