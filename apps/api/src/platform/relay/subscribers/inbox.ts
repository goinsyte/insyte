import { withChannels } from "@insyte/modules/inbox/use-cases/chat/lazy"
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
    }).pipe(Effect.orDie),
  // A store's website chat switched off, or put back by an Undo (M15 step 8): its theme's embed follows it.
  "webchat.changed": (_id, event, sql) => withChannels((c) => c.syncEmbed(sql, event)).pipe(Effect.orDie)
})
