import { InboxApi } from "@insyte/api/http/groups/InboxGroup"
import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { ApiKeyAuthLive } from "../http/KeyAuth.ts"
import { keyOf } from "../shared/errors.ts"
import { InboxV1, untrustedFor } from "./InboxV1.ts"

/*
 * The inbox's `/v1` routes (M19.2), behind the same key door as every other group. Loaded with the public Worker's
 * first request (`lazy.ts`), not at its start (ADR-0041 §3). An agent's key reads the words marked as data, as over
 * MCP (`present.ts`); it writes over MCP only (`http/KeyAuth.ts`).
 */

const InboxHttp = HttpApiBuilder.group(
  InboxApi,
  "inbox",
  (handlers) =>
    Effect.map(
      Effect.service(InboxV1),
      (act) =>
        handlers
          .handle("threads", ({ query }) => Effect.flatMap(untrustedFor, (u) => act.threads(query, u)))
          .handle("thread", ({ params }) => Effect.flatMap(untrustedFor, (u) => act.thread(params.id, u)))
          .handle(
            "reply",
            ({ params, payload, headers }) =>
              Effect.flatMap(keyOf(headers["idempotency-key"]), (key) => act.reply(params.id, payload.body, key))
          )
          .handle(
            "assign",
            ({ params, payload, headers }) =>
              Effect.flatMap(keyOf(headers["idempotency-key"]), (key) => act.assign(params.id, payload.member_id, key))
          )
          .handle(
            "unassign",
            ({ params, headers }) =>
              Effect.flatMap(keyOf(headers["idempotency-key"]), (key) => act.unassign(params.id, key))
          )
          .handle(
            "archive",
            ({ params, headers }) =>
              Effect.flatMap(keyOf(headers["idempotency-key"]), (key) => act.archive(params.id, key))
          )
          .handle(
            "takeOver",
            ({ params, payload, headers }) =>
              Effect.flatMap(
                keyOf(headers["idempotency-key"]),
                (key) => act.takeOver(params.id, payload.member_id, key)
              )
          )
          .handle(
            "handBack",
            ({ params, headers }) =>
              Effect.flatMap(keyOf(headers["idempotency-key"]), (key) => act.handBack(params.id, key))
          )
          .handle("chats", () => Effect.flatMap(untrustedFor, act.chats))
          .handle(
            "chatMessages",
            ({ params, query }) => Effect.flatMap(untrustedFor, (u) => act.chatMessages(params.id, query, u))
          )
          .handle(
            "postChatMessage",
            ({ params, payload, headers }) =>
              Effect.flatMap(
                keyOf(headers["idempotency-key"]),
                (key) =>
                  Effect.flatMap(
                    untrustedFor,
                    (u) => act.postChatMessage(params.id, payload.body, payload.reply_to, u, key)
                  )
              )
          )
          .handle("channels", () => act.channels)
    )
).pipe(Layer.provide(InboxV1.layer))

/** The routes on the public Worker's router, beside `PublicApi`'s. */
export const InboxRoutes = HttpApiBuilder.layer(InboxApi).pipe(
  Layer.provide(InboxHttp),
  Layer.provide(ApiKeyAuthLive)
)
