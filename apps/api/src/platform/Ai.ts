import type { AiModel } from "@insyte/modules/ai/domain/Ai"
import { type Config, Effect, Layer } from "effect"
import type { LanguageModel } from "effect/ai"

/*
 * Insyte AI's model for the background runtimes (M15 step 1; ADR-0041 §3): `AiLive.ts`'s choice, Claude through the
 * stage's AI Gateway or the fake, imported when the runtime is built on first use instead of when the Worker starts.
 */

export const AiChoice: Layer.Layer<AiModel | LanguageModel.LanguageModel, Config.ConfigError> = Layer.unwrap(
  Effect.promise(() => import("./AiLive.ts")).pipe(Effect.map((live) => live.AiChoice))
)
