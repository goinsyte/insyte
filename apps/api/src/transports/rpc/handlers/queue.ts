import { QueueRpcs } from "@insyte/api/rpc/QueueRpcs"
import { QueueService } from "@insyte/modules/queue/Queue"
import { Effect } from "effect"

export const QueueHandlers = QueueRpcs.toLayer(Effect.gen(function*() {
  const queue = yield* QueueService
  return QueueRpcs.of({
    "Queue.list": (input) => queue.list(input),
    "Queue.markSeen": ({ id }) => queue.markSeen(id),
    "Queue.reopen": ({ id }) => queue.reopen(id)
  })
}))
