import { PublicApi } from "@insyte/api/http/PublicApi"
import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { keyOf } from "../shared/errors.ts"
import { ReturnsV1 } from "./ReturnsV1.ts"

export const ReturnsHttp = HttpApiBuilder.group(
  PublicApi,
  "returns",
  (handlers) =>
    Effect.map(
      Effect.service(ReturnsV1),
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
).pipe(Layer.provide(ReturnsV1.layer))
