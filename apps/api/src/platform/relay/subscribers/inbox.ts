import { sendQueued } from "@insyte/modules/inbox/use-cases/send"
import { Effect } from "effect"
import { subscriber } from "../Subscriber.ts"

export const Support = subscriber("support", {
  // A message the team wrote in the inbox (M11 step 2), once its undo window has passed: through its mailbox.
  "thread.message_queued": (_id, event, sql) => sendQueued(sql, event.messageId).pipe(Effect.orDie)
})
