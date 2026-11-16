import { Db } from "@insyte/database/Db"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentPrincipal, CurrentWorkspace, type Principal } from "@insyte/domain/Principal"
import { agentPrincipal } from "@insyte/modules/agent/Agent"
import { ChatChannel } from "@insyte/modules/shared/domain/ChatChannel"
import { Effect, Layer, Option, Schema } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../../platform/RequestDb.ts"
import { devOnly, workspaceParam } from "./shared.ts"

const refused = HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
const invalid = HttpServerResponse.jsonUnsafe({ error: { code: "invalid" } }, { status: 400 })

const Call = Schema.Union([
  Schema.Struct({ op: Schema.Literal("thread"), threadId: Schema.String }),
  Schema.Struct({ op: Schema.Literal("history"), threadId: Schema.String, limit: Schema.Int }),
  Schema.Struct({ op: Schema.Literal("reply"), threadId: Schema.String, text: Schema.String }),
  Schema.Struct({ op: Schema.Literal("handOver"), threadId: Schema.String, reason: Schema.String }),
  Schema.Struct({
    op: Schema.Literal("bindCustomer"),
    threadId: Schema.String,
    customerId: Schema.String,
    /** As a member who may only read the inbox, not the agent: what the port refuses a caller like that. */
    as: Schema.optional(Schema.Literal("viewer"))
  })
])
const decodeCall = Schema.decodeUnknownEffect(Call)

/**
 * `POST /api/__dev/webchat/agent?workspace=<id>` `{ op, threadId, … }`: one call of the website chat's port
 * (`ChatChannel`) as the workspace's agent, as the customer agent (W12.2) will make it: its answer, or the error it
 * ended in by tag. For the worker tests of the contract until the agent's sink calls it. Locally and on a preview only.
 * `bindCustomer` with `as: "viewer"` runs as a member who reads the inbox (support level 1), for its refusal.
 */
const AgentCall = HttpRouter.add(
  "POST",
  "/api/__dev/webchat/agent",
  Effect.gen(function*() {
    if (!(yield* devOnly)) return refused
    const workspace = { id: (yield* workspaceParam) as WorkspaceId }
    const request = yield* HttpServerRequest.HttpServerRequest
    const body = yield* request.json.pipe(Effect.flatMap(decodeCall), Effect.option)
    if (Option.isNone(body)) return invalid
    const call = body.value
    const chat = yield* ChatChannel
    const agent = yield* agentPrincipal().pipe(Effect.provideService(CurrentWorkspace, workspace))
    const principal: Principal = call.op === "bindCustomer" && call.as === "viewer"
      ? {
        ...agent,
        kind: "member",
        role: { ...agent.role, id: "viewer", levels: { ...agent.role.levels, support: 1 } }
      }
      : agent
    const answer = yield* Effect.gen(function*() {
      switch (call.op) {
        case "thread":
          return yield* chat.thread(call.threadId)
        case "history":
          return yield* chat.history(call.threadId, { limit: call.limit })
        case "reply":
          return yield* chat.reply(call.threadId, call.text)
        case "handOver":
          return yield* chat.handOver(call.threadId, call.reason)
        case "bindCustomer":
          return yield* chat.bindCustomer(call.threadId, call.customerId)
      }
    }).pipe(
      Effect.map((value) => ({ ok: value ?? null })),
      Effect.catch((error) => Effect.succeed({ error: error._tag })),
      Effect.provideService(CurrentPrincipal, principal)
    )
    return HttpServerResponse.jsonUnsafe(answer)
  }).pipe(Effect.orDie, withRequestDb)
)

/**
 * `GET /api/__dev/webchat/store?shop=<shop>`: a bare page that loads the widget as a store's theme embed would, for a
 * person trying the chat locally or on a preview. Its origin must be one of the store's (`channels.origins`), so it is
 * meant to be served from the store's own domain in a hosts-file setup, or used to read the embed's markup. Locally and
 * on a preview only.
 */
const StorePage = HttpRouter.add(
  "GET",
  "/api/__dev/webchat/store",
  Effect.gen(function*() {
    if (!(yield* devOnly)) return refused
    const request = yield* HttpServerRequest.HttpServerRequest
    const url = new URL(request.url, "http://local")
    const shop = url.searchParams.get("shop") ?? ""
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)) return invalid
    const src = `${url.origin}/api/public/chat/widget.js`
    return HttpServerResponse.html(
      `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">` +
        `<title>Winkel (proef)</title></head><body><h1>Proefwinkel</h1>` +
        `<p>De websitechat van ${shop.replace(/[^a-z0-9.-]/gi, "")} staat rechtsonder.</p>` +
        `<script src="${src}" data-shop="${shop.toLowerCase()}" defer></script></body></html>`
    )
  })
)

/**
 * `POST /api/__dev/webchat/age?workspace=<id>&hours=<n>`: the workspace's chats as if their last word were `n` hours
 * older, so a test reaches a conversation's idle end without waiting a day. Locally and on a preview only.
 */
const ChatAge = HttpRouter.add(
  "POST",
  "/api/__dev/webchat/age",
  Effect.gen(function*() {
    if (!(yield* devOnly)) return refused
    const workspace = { id: (yield* workspaceParam) as WorkspaceId }
    const request = yield* HttpServerRequest.HttpServerRequest
    const hours = Number(new URL(request.url, "http://local").searchParams.get("hours") ?? "0")
    const db = yield* Db
    const aged = yield* db.scopedFor((sql) =>
      sql`update channel_threads set last_message_at = last_message_at - make_interval(hours => ${
        Number.isFinite(hours) ? Math.trunc(hours) : 0
      }) returning id`
    ).pipe(Effect.provideService(CurrentWorkspace, workspace))
    return HttpServerResponse.jsonUnsafe({ aged: aged.length })
  }).pipe(Effect.orDie, withRequestDb)
)

export const WebchatRoutes = Layer.mergeAll(AgentCall, StorePage, ChatAge)
