import { Db } from "@insyte/database/Db"
import { env } from "cloudflare:workers"
import { Effect } from "effect"
import type { EventsMessage } from "./Relay.ts"

/*
 * The tasks still pending (W13.6, `pending_tasks`, 0109), sent again by the cron: an agent's answer, a ticket's topic
 * or a chapter's embedding whose message was lost or dead-lettered, ten minutes after it was asked for and then after
 * longer waits, until it ran (the consumer crosses it off) or it is too late to matter (`pending_tasks_due` drops it:
 * an hour for the agent, a day for a topic, a week for a chapter). Each task acts once however often it comes.
 * Loaded by the cron, not when the jobs Worker starts.
 */

/** At most this many a turn; the rest the next. */
const PER_TURN = 100

export const pendingSweep = Effect.fn("Tasks.pendingSweep")(function*() {
  const db = yield* Db
  const due = yield* db.unscopedForCron((sql) =>
    sql<{ kind: string; task: EventsMessage }>`select kind, task from pending_tasks_due(${PER_TURN})`
  )
  if (due.length === 0) return 0
  yield* Effect.tryPromise(() => env.EVENTS.sendBatch(due.map((row) => ({ body: row.task })))).pipe(
    Effect.catchCause((cause) => Effect.logWarning("pending tasks were not sent again; the next turn tries", { cause }))
  )
  yield* Effect.logInfo("pending tasks sent again", { count: due.length })
  return due.length
})
