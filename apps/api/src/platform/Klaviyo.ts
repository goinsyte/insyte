import { KlaviyoLive } from "@insyte/integrations-klaviyo/Klaviyo"
import { KlaviyoRecorded } from "@insyte/integrations-klaviyo/KlaviyoRecorded"
import { MarketingSyncs } from "@insyte/modules/marketing/domain/Marketing"
import type { Klaviyo } from "@insyte/modules/marketing/domain/Ports"
import { env } from "cloudflare:workers"
import { Config, Effect, Layer } from "effect"
import type { HttpClient } from "effect/http"

/*
 * Klaviyo (M7.5): its recorded twin where the stage says `KLAVIYO_ADAPTER=recorded` (the worker tests), else the API
 * with the stage's OAuth app. And starting a sync's send: a `MarketingSyncWorkflow` instance named by the outbox event,
 * so a relay that delivers it twice sends once.
 */

export const KlaviyoChoice = Layer.unwrap(
  Effect.map(
    Config.String("KLAVIYO_ADAPTER").pipe(Config.withDefault("klaviyo")),
    (adapter): Layer.Layer<Klaviyo, Config.ConfigError, HttpClient.HttpClient> =>
      adapter === "recorded" ? KlaviyoRecorded : KlaviyoLive
  )
)

export const MarketingSyncsLive = Layer.succeed(MarketingSyncs)(MarketingSyncs.of({
  start: Effect.fn("MarketingSyncs.start")(function*(input) {
    yield* Effect.tryPromise(() =>
      env.MARKETING_SYNC.create({ id: input.key, params: { workspaceId: input.workspaceId, syncId: input.syncId } })
    ).pipe(
      // Already started under this name: that instance is the send.
      Effect.catch(() => Effect.flatMap(Effect.tryPromise(() => env.MARKETING_SYNC.get(input.key)), () => Effect.void)),
      Effect.orDie
    )
  })
}))
