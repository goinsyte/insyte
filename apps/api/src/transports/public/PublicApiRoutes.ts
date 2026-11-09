import { ApiKeyAuth, PublicApi } from "@insyte/api/http/PublicApi"
import { Effect, Layer, Redacted } from "effect"
import { HttpApiBuilder, HttpApiScalar } from "effect/http-api"
import { KeyDoor, refusal } from "./KeyDoor.ts"
import { keyOf, Resources } from "./Resources.ts"

/*
 * The public API's server half (M19.2): every endpoint behind the key door, answered from the shared reads and, for
 * orders, the shared commands (M7). OpenAPI
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

const OrdersLive = HttpApiBuilder.group(
  PublicApi,
  "orders",
  (handlers) =>
    Effect.map(
      Effect.service(Resources),
      (act) =>
        handlers
          .handle("order", ({ params }) => act.order(params.id))
          .handle(
            "tags",
            ({ params, payload, headers }) =>
              Effect.flatMap(keyOf(headers["idempotency-key"]), (key) => act.tagOrder(params.id, payload, key))
          )
          .handle(
            "note",
            ({ params, payload, headers }) =>
              Effect.flatMap(keyOf(headers["idempotency-key"]), (key) => act.noteOrder(params.id, payload, key))
          )
          .handle(
            "shippingAddress",
            ({ params, payload, headers }) =>
              Effect.flatMap(keyOf(headers["idempotency-key"]), (key) => act.shipOrderTo(params.id, payload, key))
          )
          .handle(
            "cancel",
            ({ params, payload, headers }) =>
              Effect.flatMap(keyOf(headers["idempotency-key"]), (key) => act.cancelOrder(params.id, payload, key))
          )
          .handle(
            "refund",
            ({ params, payload, headers }) =>
              Effect.flatMap(keyOf(headers["idempotency-key"]), (key) => act.refundOrder(params.id, payload, key))
          )
    )
)

export const PublicApiRoutes = Layer.mergeAll(
  HttpApiBuilder.layer(PublicApi, { openapiPath: "/v1/openapi.json" }),
  HttpApiScalar.layerCdn(PublicApi, { path: "/v1/docs" })
).pipe(
  Layer.provide(Layer.mergeAll(KeyLive, TeamLive, CommerceLive, OrdersLive)),
  Layer.provide(ApiKeyAuthLive)
)
