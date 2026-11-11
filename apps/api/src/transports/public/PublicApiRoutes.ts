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
          .handle("tracking", ({ params }) => act.tracking(params.id))
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

const ForwardingLive = HttpApiBuilder.group(
  PublicApi,
  "forwarding",
  (handlers) =>
    Effect.map(
      Effect.service(Resources),
      (act) =>
        handlers
          .handle("suppliers", () => act.suppliers)
          .handle("legs", ({ query }) => act.legs(query.view))
          .handle(
            "forward",
            ({ payload, headers }) =>
              Effect.flatMap(keyOf(headers["idempotency-key"]), (key) => act.forwardLegs(payload, key))
          )
          .handle(
            "reroute",
            ({ params, payload, headers }) =>
              Effect.flatMap(keyOf(headers["idempotency-key"]), (key) => act.rerouteLeg(params.id, payload, key))
          )
    )
)

const QueueLive = HttpApiBuilder.group(
  PublicApi,
  "queue",
  (handlers) =>
    Effect.map(Effect.service(Resources), (act) => handlers.handle("queue", ({ query }) => act.queue(query.tab)))
)

const ProposalsLive = HttpApiBuilder.group(
  PublicApi,
  "proposals",
  (handlers) =>
    Effect.map(
      Effect.service(Resources),
      (act) =>
        handlers
          .handle("proposal", ({ params }) => act.proposal(params.id))
          .handle(
            "file",
            ({ params, headers }) =>
              Effect.flatMap(keyOf(headers["idempotency-key"]), (key) => act.fileProposal(params.id, key))
          )
    )
)

const ReturnsLive = HttpApiBuilder.group(
  PublicApi,
  "returns",
  (handlers) =>
    Effect.map(
      Effect.service(Resources),
      (act) =>
        handlers
          .handle("returns", ({ query }) => act.returns(query.status))
          .handle("return", ({ params }) => act.returnOne(params.id))
          .handle(
            "start",
            ({ payload, headers }) =>
              Effect.flatMap(keyOf(headers["idempotency-key"]), (key) => act.startReturn(payload, key))
          )
          .handle(
            "approve",
            ({ params, payload, headers }) =>
              Effect.flatMap(
                keyOf(headers["idempotency-key"]),
                (key) => act.moveReturn(params.id, { kind: "approve", ...payload }, key)
              )
          )
          .handle(
            "reject",
            ({ params, payload, headers }) =>
              Effect.flatMap(
                keyOf(headers["idempotency-key"]),
                (key) => act.moveReturn(params.id, { kind: "reject", ...payload }, key)
              )
          )
          .handle(
            "tracking",
            ({ params, payload, headers }) =>
              Effect.flatMap(keyOf(headers["idempotency-key"]), (key) => act.trackReturn(params.id, payload, key))
          )
          .handle(
            "label",
            ({ params, headers }) =>
              Effect.flatMap(keyOf(headers["idempotency-key"]), (key) => act.labelReturn(params.id, key))
          )
          .handle(
            "receive",
            ({ params, headers }) =>
              Effect.flatMap(
                keyOf(headers["idempotency-key"]),
                (key) => act.moveReturn(params.id, { kind: "receive" }, key)
              )
          )
          .handle(
            "inspect",
            ({ params, payload, headers }) =>
              Effect.flatMap(
                keyOf(headers["idempotency-key"]),
                (key) => act.moveReturn(params.id, { kind: "inspect", ...payload }, key)
              )
          )
          .handle(
            "resolve",
            ({ params, payload, headers }) =>
              Effect.flatMap(keyOf(headers["idempotency-key"]), (key) => act.resolveReturn(params.id, payload, key))
          )
    )
)

const TicketsLive = HttpApiBuilder.group(
  PublicApi,
  "tickets",
  (handlers) =>
    Effect.map(
      Effect.service(Resources),
      (act) =>
        handlers
          .handle("tickets", ({ query }) => act.tickets(query.view))
          .handle("ticket", ({ params }) => act.ticket(params.id))
          .handle(
            "create",
            ({ payload, headers }) =>
              Effect.flatMap(keyOf(headers["idempotency-key"]), (key) => act.createTicket(payload, key))
          )
          .handle(
            "update",
            ({ params, payload, headers }) =>
              Effect.flatMap(keyOf(headers["idempotency-key"]), (key) => act.updateTicket(params.id, payload, key))
          )
          .handle(
            "status",
            ({ params, payload, headers }) =>
              Effect.flatMap(
                keyOf(headers["idempotency-key"]),
                (key) => act.moveTicket(params.id, payload.status, key)
              )
          )
          .handle(
            "assign",
            ({ params, payload, headers }) =>
              Effect.flatMap(
                keyOf(headers["idempotency-key"]),
                (key) => act.assignTicket(params.id, payload.member_id, true, key)
              )
          )
          .handle(
            "unassign",
            ({ params, payload, headers }) =>
              Effect.flatMap(
                keyOf(headers["idempotency-key"]),
                (key) => act.assignTicket(params.id, payload.member_id, false, key)
              )
          )
          .handle(
            "comment",
            ({ params, payload, headers }) =>
              Effect.flatMap(keyOf(headers["idempotency-key"]), (key) => act.commentTicket(params.id, payload, key))
          )
    )
)

export const PublicApiRoutes = Layer.mergeAll(
  HttpApiBuilder.layer(PublicApi, { openapiPath: "/v1/openapi.json" }),
  HttpApiScalar.layerCdn(PublicApi, { path: "/v1/docs" })
).pipe(
  Layer.provide(
    Layer.mergeAll(
      KeyLive,
      TeamLive,
      CommerceLive,
      OrdersLive,
      ForwardingLive,
      ReturnsLive,
      TicketsLive,
      QueueLive,
      ProposalsLive
    )
  ),
  Layer.provide(ApiKeyAuthLive)
)
