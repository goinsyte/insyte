import { Db } from "@insyte/database/Db"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import * as Outbox from "@insyte/modules/shared/use-cases/Outbox"
import { Effect, Layer, Option, Schema } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { personActs, shopperWrites, threadOf } from "../../../platform/chat/LocalChat.ts"
import { withRequestDb } from "../../../platform/RequestDb.ts"
import { devOnly, workspaceParam } from "./shared.ts"

/*
 * The website chat as the customer agent's tests drive it (M15 step 8), on the local chat (`platform/chat/LocalChat.ts`)
 * until the real one lands: a shopper writing, the thread as it stands, a person taking it over, handing it back or
 * closing it. Locally and on a preview only.
 */

const refused = HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
const invalid = HttpServerResponse.jsonUnsafe({ error: { code: "invalid" } }, { status: 400 })

const Message = Schema.Struct({
  storeId: Schema.String.check(Schema.isMaxLength(64)),
  threadId: Schema.optional(Schema.String.check(Schema.isMaxLength(64))),
  text: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(4000)),
  /** Written to the outbox as the chat would (`chat.received`), for the relay to carry; or not, for a test to run. */
  emit: Schema.optional(Schema.Boolean)
})
const decodeMessage = Schema.decodeUnknownEffect(Message)

/**
 * `POST /api/__dev/chat/message?workspace=<id>` `{ storeId, threadId?, text, emit? }`: a shopper's message, on a new
 * thread or that one; `{ threadId, messageId, eventId }`, the event written where `emit`.
 */
const ShopperMessage = HttpRouter.add(
  "POST",
  "/api/__dev/chat/message",
  Effect.gen(function*() {
    if (!(yield* devOnly)) return refused
    const workspaceId = yield* workspaceParam
    const request = yield* HttpServerRequest.HttpServerRequest
    const body = yield* request.json.pipe(Effect.flatMap(decodeMessage), Effect.option)
    if (Option.isNone(body)) return invalid
    const m = body.value
    const { threadId, messageId } = shopperWrites({
      workspaceId,
      storeId: m.storeId,
      threadId: m.threadId,
      text: m.text
    })
    const eventId = m.emit === true
      ? yield* (yield* Db).scopedFor((sql) =>
        Outbox.write(sql, workspaceId, {
          type: "chat.received",
          workspaceId,
          storeId: m.storeId,
          threadId,
          messageId,
          channel: "webchat"
        })
      ).pipe(Effect.provideService(CurrentWorkspace, { id: workspaceId as WorkspaceId }))
      : null
    return HttpServerResponse.jsonUnsafe({ threadId, messageId, eventId })
  }).pipe(Effect.orDie, withRequestDb)
)

/** `GET /api/__dev/chat/thread?workspace=<id>&thread=<id>`: the thread and its messages. */
const Thread = HttpRouter.add(
  "GET",
  "/api/__dev/chat/thread",
  Effect.gen(function*() {
    if (!(yield* devOnly)) return refused
    const request = yield* HttpServerRequest.HttpServerRequest
    const thread = new URL(request.url, "http://local").searchParams.get("thread") ?? ""
    const kept = threadOf(yield* workspaceParam, thread)
    return kept === null ? refused : HttpServerResponse.jsonUnsafe(kept)
  })
)

const Act = Schema.Struct({
  /** A member taking the thread over, or `null`: handed back. */
  takeOver: Schema.optional(Schema.NullOr(Schema.String.check(Schema.isMaxLength(64)))),
  close: Schema.optional(Schema.Boolean),
  /** A member taking it over on the agent's `reads`-th read of the thread from now: in the middle of its turn. */
  takeOverOnRead: Schema.optional(Schema.Struct({
    reads: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(10)),
    by: Schema.String.check(Schema.isMaxLength(64))
  }))
})
const decodeAct = Schema.decodeUnknownEffect(Act)

/**
 * `POST /api/__dev/chat/thread?workspace=<id>&thread=<id>` `{ takeOver?, close?, takeOverOnRead? }`: a person acting on
 * the thread, now or in the middle of the agent's next turn.
 */
const PersonActs = HttpRouter.add(
  "POST",
  "/api/__dev/chat/thread",
  Effect.gen(function*() {
    if (!(yield* devOnly)) return refused
    const request = yield* HttpServerRequest.HttpServerRequest
    const thread = new URL(request.url, "http://local").searchParams.get("thread") ?? ""
    const body = yield* request.json.pipe(Effect.flatMap(decodeAct), Effect.option)
    if (Option.isNone(body)) return invalid
    const act = body.value
    return personActs(yield* workspaceParam, thread, {
        ...(act.takeOver === undefined ? {} : { takeOver: act.takeOver }),
        ...(act.close === undefined ? {} : { close: act.close }),
        ...(act.takeOverOnRead === undefined ? {} : { takeOverOnRead: act.takeOverOnRead })
      })
      ? HttpServerResponse.jsonUnsafe({ ok: true })
      : refused
  })
)

export const ChatRoutes = Layer.mergeAll(ShopperMessage, Thread, PersonActs)
