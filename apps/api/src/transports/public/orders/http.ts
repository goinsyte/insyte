import { PublicApi } from "@insyte/api/http/PublicApi"
import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { keyOf } from "../shared/errors.ts"
import { OrdersV1 } from "./OrdersV1.ts"

export const OrdersHttp = HttpApiBuilder.group(
  PublicApi,
  "orders",
  (handlers) =>
    Effect.map(
      Effect.service(OrdersV1),
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
            "delay",
            ({ params, headers }) =>
              Effect.flatMap(keyOf(headers["idempotency-key"]), (key) => act.delayOrder(params.id, key))
          )
          .handle(
            "clearDelay",
            ({ params, headers }) =>
              Effect.flatMap(keyOf(headers["idempotency-key"]), (key) => act.clearOrderDelay(params.id, key))
          )
          .handle(
            "emailCustomer",
            ({ params, payload, headers }) =>
              Effect.flatMap(keyOf(headers["idempotency-key"]), (key) => act.emailCustomer(params.id, payload, key))
          )
          .handle(
            "refund",
            ({ params, payload, headers }) =>
              Effect.flatMap(keyOf(headers["idempotency-key"]), (key) => act.refundOrder(params.id, payload, key))
          )
    )
).pipe(Layer.provide(OrdersV1.layer))
