import { ApiKeyAuth, PublicApi } from "@insyte/api/http/PublicApi"
import { Effect, Layer, Redacted } from "effect"
import { HttpApiBuilder, HttpApiScalar } from "effect/http-api"
import { KeyDoor, refusal } from "./KeyDoor.ts"
import { Resources } from "./Resources.ts"

/*
 * The public API's server half (M19.2): every endpoint behind the key door, answered from the shared reads. OpenAPI
 * at `/v1/openapi.json`, its reference at `/v1/docs`.
 */

const ApiKeyAuthLive = Layer.effect(
  ApiKeyAuth,
  Effect.map(
    Effect.service(KeyDoor),
    (door) =>
      ApiKeyAuth.of({
        bearer: (handler, { credential }) =>
          door.enter(Redacted.value(credential), handler).pipe(
            Effect.catchTags({
              Refused: (e) => Effect.succeed(refusal(e)),
              Throttled: (e) => Effect.succeed(refusal(e))
            })
          )
      })
  )
)

const KeyLive = HttpApiBuilder.group(
  PublicApi,
  "key",
  (handlers) => Effect.map(Effect.service(Resources), (read) => handlers.handle("me", () => read.me))
)

const TeamLive = HttpApiBuilder.group(
  PublicApi,
  "team",
  (handlers) =>
    Effect.map(
      Effect.service(Resources),
      (read) => handlers.handle("members", () => read.members).handle("roles", () => read.roles)
    )
)

const CommerceLive = HttpApiBuilder.group(
  PublicApi,
  "commerce",
  (handlers) =>
    Effect.map(
      Effect.service(Resources),
      (read) =>
        handlers
          .handle("orders", ({ query }) => read.orders(query))
          .handle("products", ({ query }) => read.products(query))
          .handle("customers", ({ query }) => read.customers(query))
    )
)

export const PublicApiRoutes = Layer.mergeAll(
  HttpApiBuilder.layer(PublicApi, { openapiPath: "/v1/openapi.json" }),
  HttpApiScalar.layerCdn(PublicApi, { path: "/v1/docs" })
).pipe(
  Layer.provide(Layer.mergeAll(KeyLive, TeamLive, CommerceLive)),
  Layer.provide(ApiKeyAuthLive)
)
