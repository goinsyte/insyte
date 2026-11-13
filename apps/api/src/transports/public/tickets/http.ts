import { PublicApi } from "@insyte/api/http/PublicApi"
import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { keyOf } from "../shared/errors.ts"
import { TicketsV1 } from "./TicketsV1.ts"

export const TicketsHttp = HttpApiBuilder.group(
  PublicApi,
  "tickets",
  (handlers) =>
    Effect.map(
      Effect.service(TicketsV1),
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
).pipe(Layer.provide(TicketsV1.layer))
