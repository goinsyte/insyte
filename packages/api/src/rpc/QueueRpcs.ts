import { NotFound } from "@insyte/domain/Errors"
import { IdInput, ListInput, QueueChange, QueueItemClosed, QueueList } from "@insyte/modules/queue/domain/Queue"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

/**
 * The queue on Start (M10.1): the rows the person may open and the tab counts; seeing a row, and taking it back, each
 * with an undo token. Every member may open Start; the rows narrow to the role's areas and stores.
 */
export class QueueRpcs extends RpcGroup.make(
  Rpc.make("Queue.list", { payload: ListInput, success: QueueList }),
  Rpc.make("Queue.markSeen", {
    payload: IdInput,
    success: QueueChange,
    error: Schema.Union([NotFound, QueueItemClosed])
  }),
  Rpc.make("Queue.reopen", { payload: IdInput, success: QueueChange, error: Schema.Union([NotFound, QueueItemClosed]) })
)
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
