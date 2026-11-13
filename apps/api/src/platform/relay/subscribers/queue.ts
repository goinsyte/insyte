import { refreshIn, refreshWorkspace, sweepWorkspaces } from "@insyte/modules/queue/Queue"
import type { OutboxEvent } from "@insyte/modules/shared/domain/Outbox"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { roomOf } from "../../Room.ts"
import { subscriber } from "../Subscriber.ts"

/** The record kinds whose change may open, update or close a queue row on Start (M10.1). */
const QUEUED = new Set(["order", "return", "quality_check", "store", "product", "chargeback", "connection"])

/** The queue sink (M10.1): the workspace's queue brought in line, and its open tabs told when it changed. */
const queue = Effect.fn("Relay.queue")(
  function*(event: Extract<OutboxEvent, { type: "records.changed" }>, sql: SqlClient.SqlClient) {
    if (!(yield* refreshIn(sql))) return
    yield* Effect.promise(() =>
      roomOf(event.workspaceId).broadcast({ v: 1, type: "records.changed", kind: "queue_item", ids: [] })
    )
  },
  Effect.orDie
)

/** Every 15 minutes: each workspace's queue brought in line (what no event says: a stock-out, a review coming due). */
export const queueSweep = Effect.fn("Relay.queueSweep")(function*() {
  for (const workspaceId of yield* sweepWorkspaces) {
    if (!(yield* refreshWorkspace(workspaceId))) continue
    yield* Effect.promise(() =>
      roomOf(workspaceId).broadcast({ v: 1, type: "records.changed", kind: "queue_item", ids: [] })
    )
  }
}, Effect.orDie)

export const Queue = subscriber("queue", {
  "records.changed": (_id, event, sql) => QUEUED.has(event.kind) ? queue(event, sql) : undefined
})
