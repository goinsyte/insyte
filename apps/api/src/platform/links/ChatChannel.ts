import { Connect } from "@insyte/database/Connect"
import { Db } from "@insyte/database/Db"
import { NotFound } from "@insyte/domain/Errors"
import * as Chat from "@insyte/modules/inbox/use-cases/chat/chat"
import { ChatChannel } from "@insyte/modules/shared/domain/ChatChannel"
import { Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import { withRequestDb } from "../RequestDb.ts"

/*
 * The website chat's port for the customer agent (M15 step 8; `shared/domain/ChatChannel.ts`), over the inbox slice's
 * chat use cases. A caller with a database in context (a relay sink, an RPC) uses its connection; one without gets one
 * of its own for the call. A database that does not answer is a defect, as everywhere.
 *
 * The seam's reply knows `NotFound`, `TakenOver` and `ThreadClosed` only: a principal whose role may not answer in the
 * inbox (`Forbidden`) is told the thread is not there for it, and a text the chat refuses (empty, or longer than
 * `CHAT_TEXT_MAX`) is a defect: the caller keeps its replies within the chat's length.
 */
export const ChatChannelLive = Layer.effect(
  ChatChannel,
  Effect.gen(function*() {
    const connect = yield* Connect
    const run = <A, E, R>(effect: Effect.Effect<A, E | SqlError.SqlError, R | Db>) =>
      Effect.flatMap(Effect.serviceOption(Db), (db) =>
        db._tag === "Some"
          ? Effect.provideService(effect, Db, db.value)
          : withRequestDb(effect).pipe(Effect.provideService(Connect, connect))).pipe(
          Effect.catchIf(SqlError.isSqlError, Effect.die)
        ) as Effect.Effect<A, Exclude<E, SqlError.SqlError>, Exclude<R, Db>>
    return ChatChannel.of({
      thread: (threadId) => run(Chat.thread(threadId)),
      history: (threadId, { limit }) => run(Chat.history(threadId, limit)),
      reply: (threadId, text) =>
        run(Chat.replyAs(threadId, text)).pipe(
          Effect.catchTags({
            Forbidden: () => Effect.fail(new NotFound({ entity: "thread", id: threadId })),
            Invalid: (invalid) => Effect.die(invalid)
          })
        ),
      handOver: (threadId, reason) => run(Chat.handOver(threadId, reason)),
      bindCustomer: (threadId, customerId) => run(Chat.bindCustomer(threadId, customerId))
    })
  })
)
