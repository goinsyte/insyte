import { AfterShipLive, TrackingManual } from "@insyte/integrations-aftership/AfterShip"
import { AfterShipRecorded } from "@insyte/integrations-aftership/AfterShipRecorded"
import type { Tracking } from "@insyte/modules/tracking/domain/Tracking"
import { Config, Effect, Layer, Option } from "effect"
import type { HttpClient } from "effect/http"

/*
 * Tracking (M8.4): AfterShip's recorded twin where the stage says `TRACKING_ADAPTER=recorded` (the worker tests); the
 * live API where the stage has `AFTERSHIP_API_KEY`; and where it has none, nothing registered, parcels keeping Shopify's
 * own status (`TrackingManual`).
 */
export const TrackingChoice = Layer.unwrap(
  Effect.gen(function*() {
    const adapter = yield* Config.String("TRACKING_ADAPTER").pipe(Config.withDefault("aftership"))
    const key = yield* Config.Redacted("AFTERSHIP_API_KEY").pipe(Config.option)
    return (adapter === "recorded"
      ? AfterShipRecorded
      : Option.isSome(key)
      ? AfterShipLive
      : TrackingManual) as Layer.Layer<Tracking, Config.ConfigError, HttpClient.HttpClient>
  })
)
