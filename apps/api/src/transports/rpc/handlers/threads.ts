import { ThreadsRpcs } from "@insyte/api/rpc/ThreadsRpcs"
import { InboxService } from "@insyte/modules/inbox/Inbox"
import { Effect } from "effect"

export const ThreadsHandlers = ThreadsRpcs.toLayer(Effect.gen(function*() {
  const inbox = yield* InboxService
  return ThreadsRpcs.of({
    "Threads.list": (input) => inbox.list(input),
    "Threads.get": ({ id }) => inbox.get(id),
    "Threads.markRead": (input) => inbox.markRead(input),
    "Threads.star": (input) => inbox.star(input),
    "Threads.label": (input) => inbox.label(input),
    "Threads.archive": (input) => inbox.archive(input),
    "Threads.spam": (input) => inbox.spam(input),
    "Threads.trash": (input) => inbox.trash(input),
    "Threads.snooze": (input) => inbox.snooze(input),
    "Threads.putBack": (input) => inbox.putBack(input),
    "Threads.assign": (input) => inbox.assign(input),
    "Threads.unassign": (input) => inbox.unassign(input),
    "Threads.linkTicket": (input) => inbox.linkTicket(input),
    "Threads.reply": (input) => inbox.reply(input),
    "Threads.forward": (input) => inbox.forward(input),
    "Threads.compose": (input) => inbox.compose(input),
    "Mailboxes.list": () => inbox.mailboxes,
    "Mailboxes.connect": (input) => inbox.connect(input),
    "Mailboxes.disconnect": (input) => inbox.disconnect(input),
    "Mailboxes.setDefault": (input) => inbox.setDefault(input),
    "Mailboxes.setSignature": (input) => inbox.setSignature(input)
  })
}))
