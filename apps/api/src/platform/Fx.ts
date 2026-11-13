import { EcbLive } from "@insyte/integrations-ecb/Ecb"
import { EcbRecorded } from "@insyte/integrations-ecb/EcbRecorded"
import type { ReferenceRates } from "@insyte/modules/fx/domain/Rates"
import { Config, Effect, Layer } from "effect"
import type { HttpClient } from "effect/http"

/*
 * The ECB's reference rates (§0.4): its recorded twin where the stage says `FX_ADAPTER=recorded` (the worker tests),
 * the ECB's public file everywhere else. It needs no key.
 */
export const RatesChoice = Layer.unwrap(
  Effect.map(
    Config.String("FX_ADAPTER").pipe(Config.withDefault("ecb")),
    (adapter): Layer.Layer<ReferenceRates, never, HttpClient.HttpClient> =>
      adapter === "recorded" ? EcbRecorded : EcbLive
  )
)
