import { Db } from "@insyte/database/Db"
import { eventOf } from "@insyte/modules/shared/domain/Outbox"
import { env } from "cloudflare:workers"
import { Effect } from "effect"
import type { EventsMessage } from "./Relay.ts"
import { type PendingKind, taskOf } from "./relay/tasks.ts"

/*
 * The tasks still pending (W13.6, `pending_tasks`, 0109), sent again by the cron: an agent's answer, a ticket's topic
 * or a chapter's embedding whose message was lost or dead-lettered, ten minutes after it was asked for and then after
 * longer waits, until it ran (the consumer crosses it off) or it is too late to matter (`pending_tasks_due` drops it:
 * an hour for the agent, a day for a topic, a week for a chapter). Each task acts once however often it comes. A row
 * is a reference: the task is built again from its outbox event (`relay/tasks.ts`). Loaded by the cron, not when the
 * jobs Worker starts.
 */

/** At most this many a turn; the rest the next. */
const PER_TURN = 100

/** The Queues' limits on one `sendBatch`: a hundred messages, 256 KB in all (kept well under). */
const BATCH_MESSAGES = 100
const BATCH_BYTES = 200_000

/** The messages in batches within the Queues' limits. */
export const batchesOf = (bodies: ReadonlyArray<EventsMessage>): ReadonlyArray<ReadonlyArray<EventsMessage>> => {
  const batches: Array<Array<EventsMessage>> = []
  let current: Array<EventsMessage> = []
  let bytes = 0
  for (const body of bodies) {
    const size = JSON.stringify(body).length
    if (current.length > 0 && (current.length >= BATCH_MESSAGES || bytes + size > BATCH_BYTES)) {
      batches.push(current)
      current = []
      bytes = 0
    }
    current.push(body)
    bytes += size
  }
  if (current.length > 0) batches.push(current)
  return batches
}

export const pendingSweep = Effect.fn("Tasks.pendingSweep")(function*() {
  const db = yield* Db
  const due = yield* db.unscopedForCron((sql) =>
    sql<{ kind: PendingKind; ref: string; event: string | null; payload: Record<string, unknown> | null }>`
      select kind, ref, event, payload from pending_tasks_due(${PER_TURN})`
  )
  if (due.length === 0) return 0
  const bodies = due.flatMap((row) => {
    const event = row.event === null || row.payload === null ? undefined : eventOf(row.event, row.payload)
    const task = event === undefined ? undefined : taskOf(row.kind, row.ref, event)
    return task === undefined ? [] : [task]
  })
  // An event gone or not read as its event: its reference waits until it is too late, and is dropped then.
  if (bodies.length < due.length) {
    yield* Effect.logWarning("pending tasks whose event was not found were not sent again", {
      count: due.length - bodies.length
    })
  }
  for (const batch of batchesOf(bodies)) {
    yield* Effect.tryPromise(() => env.EVENTS.sendBatch(batch.map((body) => ({ body })))).pipe(
      Effect.catchCause((cause) =>
        Effect.logWarning("pending tasks were not sent again; the next turn tries", { cause })
      )
    )
  }
  yield* Effect.logInfo("pending tasks sent again", { count: bodies.length })
  return bodies.length
})
