import { Connect } from "@insyte/database/Connect"
import { Db } from "@insyte/database/Db"
import { NotFound } from "@insyte/domain/Errors"
import { withChat } from "@insyte/modules/inbox/use-cases/chat/lazy"
import { ChatChannel } from "@insyte/modules/shared/domain/ChatChannel"
import { Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import { withRequestDb } from "../RequestDb.ts"

/*
 * The website chat's port for the customer agent (M15 step 8; `shared/domain/ChatChannel.ts`), over the inbox slice's
 * chat use cases. A caller with a database in context (a relay sink, an RPC) uses its connection; one without gets one
 * of its own for the call. A database that does not answer is a defect, as everywhere.
 *
 * A principal whose role may not answer in the inbox (`Forbidden`) is told by the seam that the thread is not there for
 * it (`NotFound`); a text the chat refuses (empty, or longer than `CHAT_TEXT_MAX`) is `Invalid`.
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
      // The chat's use cases load with the first call (`lazy.ts`), not with the layer.
      thread: (threadId) => run(withChat((c) => c.thread(threadId))),
      history: (threadId, { limit }) => run(withChat((c) => c.history(threadId, limit))),
      reply: (threadId, text) =>
        run(withChat((c) => c.replyAs(threadId, text))).pipe(
          Effect.catchTag("Forbidden", () => Effect.fail(new NotFound({ entity: "thread", id: threadId })))
        ),
      handOver: (threadId, reason) => run(withChat((c) => c.handOver(threadId, reason))),
      bindCustomer: (threadId, customerId) => run(withChat((c) => c.bindCustomer(threadId, customerId)))
    })
  })
)
