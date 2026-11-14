import { sendQueued } from "@insyte/modules/inbox/use-cases/send"
import { Relay } from "@insyte/modules/shared/domain/Outbox"
import { Effect } from "effect"
import { subscriber } from "../Subscriber.ts"

export const Support = subscriber("support", {
  // A message the team wrote in the inbox (M11 step 2), once its undo window has passed: through its mailbox. The
  // provider busy: the try again goes onto the queue for when it is due.
  "thread.message_queued": (_id, event, sql) =>
    Effect.gen(function*() {
      const retry = yield* sendQueued(sql, event.messageId, event)
      if (retry !== undefined) yield* (yield* Relay).kick([retry.outboxId], { afterSeconds: retry.afterSeconds })
    }).pipe(Effect.orDie)
})
