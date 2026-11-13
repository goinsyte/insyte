import { Db } from "@insyte/database/Db"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { digestDue, sendDue } from "@insyte/modules/notifications/use-cases/deliveries"
import { fanOut } from "@insyte/modules/notifications/use-cases/fanout"
import type { OutboxEvent } from "@insyte/modules/shared/domain/Outbox"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { roomOf } from "../../Room.ts"
import { type EventType, onEach, subscriber } from "../Subscriber.ts"

/**
 * The notifications sink (M5.2): rows for whoever should hear of the event, then each one's tabs their count; what
 * goes out by e-mail goes now, on this transaction (M11 step 13.5).
 */
const notifications = Effect.fn("Relay.notifications")(
  function*(event: OutboxEvent, sql: SqlClient.SqlClient) {
    const heard = yield* fanOut(sql, event.workspaceId, event)
    yield* sendDue(sql)
    const room = roomOf(event.workspaceId)
    yield* Effect.forEach(
      heard,
      ({ recipientId, unread }) =>
        Effect.promise(() => room.sendTo(recipientId, { v: 1, type: "notes.changed", unread }))
    )
  },
  Effect.orDie
)

/** The events someone may hear of (M5.2): whom, and whether, is `fanOut`'s to say. */
const NOTIFIED = [
  "member.joined",
  "access.requested",
  "access.decided",
  "order.delayed",
  "return.requested",
  "ticket.assigned",
  "ticket.mentioned",
  "chat.mentioned",
  "quality_check.submitted",
  "chargeback.opened",
  "chargeback.deadline_near",
  "automation.notify",
  "webhook.disabled",
  "course.assigned",
  "course.question",
  "course.answered",
  "statements.closed",
  "supplier.problem_reported",
  "supplier.shipment_refused",
  "export.finished"
] as const satisfies ReadonlyArray<EventType>

/** The workspaces whose notes wait to go out: quiet hours over, or a mail to try again. */
const notifyWorkspaces = Effect.flatMap(Effect.service(Db), (db) =>
  db.routing((sql) =>
    Effect.map(
      sql<{ workspaceId: WorkspaceId }>`select workspace_id from notify_due_workspaces()`,
      (rows) => rows.map((r) => r.workspaceId)
    )
  ))

/** Every minute: the notes that may go out now, in each workspace that has some (M11 step 13.5). */
export const notifySweep = Effect.fn("Relay.notifySweep")(function*() {
  for (const workspaceId of yield* notifyWorkspaces) yield* notifyWorkspace(workspaceId)
}, Effect.orDie)

/** One workspace's notes due at `at`, sent, as `system`. */
export const notifyWorkspace = (workspaceId: WorkspaceId, at?: Date) =>
  Effect.flatMap(Effect.service(Db), (db) => db.scopedFor((sql) => sendDue(sql, at))).pipe(
    Effect.provideService(CurrentWorkspace, { id: workspaceId })
  )

/** The workspaces with a member whose digest is due at `at` (0055). */
const digestWorkspaces = (at: Date) =>
  Effect.flatMap(Effect.service(Db), (db) =>
    db.routing((sql) =>
      Effect.map(
        sql<{ workspaceId: WorkspaceId }>`select workspace_id from digest_workspaces(${at})`,
        (rows) => rows.map((r) => r.workspaceId)
      )
    ))

/** Every 15 minutes: the daily digests whose hour has come at the cron's time, per workspace (M11 step 13.5). */
export const digestSweep = Effect.fn("Relay.digestSweep")(function*(at: Date) {
  for (const workspaceId of yield* digestWorkspaces(at)) yield* digestWorkspace(workspaceId, at)
}, Effect.orDie)

/** One workspace's digests due at `at` (over the notes since `since`, a test's), sent, as `system`. */
export const digestWorkspace = (workspaceId: WorkspaceId, at?: Date, since?: Date) =>
  Effect.flatMap(Effect.service(Db), (db) => db.scopedFor((sql) => digestDue(sql, at, since))).pipe(
    Effect.provideService(CurrentWorkspace, { id: workspaceId })
  )

/** The notifications sink (M5.2), for the events someone may hear of. */
export const Notifications = subscriber(
  "notifications",
  onEach(NOTIFIED, (_id, event, sql) => notifications(event, sql))
)
