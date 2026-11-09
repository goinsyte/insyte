import { SupplierApiLive } from "@insyte/integrations-supplier-api/SupplierApi"
import { SupplierApiRecorded } from "@insyte/integrations-supplier-api/SupplierApiRecorded"
import { ForwardSends, type SupplierApi } from "@insyte/modules/forwarding/domain/Forwarding"
import { env } from "cloudflare:workers"
import { Config, Effect, Layer } from "effect"
import type { HttpClient } from "effect/http"

/*
 * Forwarding (M8.2): a supplier's API through its recorded twin where the stage says `SUPPLIER_API_ADAPTER=recorded`
 * (the worker tests), else over HTTP. And starting a forward's send: a `ForwardSendWorkflow` instance named by the
 * outbox event, so a relay that delivers it twice sends once.
 */

export const SupplierApiChoice = Layer.unwrap(
  Effect.map(
    Config.String("SUPPLIER_API_ADAPTER").pipe(Config.withDefault("http")),
    (adapter): Layer.Layer<SupplierApi, never, HttpClient.HttpClient> =>
      adapter === "recorded" ? SupplierApiRecorded : SupplierApiLive
  )
)

export const ForwardSendsLive = Layer.succeed(ForwardSends)(ForwardSends.of({
  start: Effect.fn("ForwardSends.start")(function*(input) {
    yield* Effect.tryPromise(() =>
      env.FORWARD_SEND.create({ id: input.key, params: { workspaceId: input.workspaceId, legIds: [...input.legIds] } })
    ).pipe(
      // Already started under this name: that instance is the send.
      Effect.catch(() => Effect.flatMap(Effect.tryPromise(() => env.FORWARD_SEND.get(input.key)), () => Effect.void)),
      Effect.orDie
    )
  })
}))
