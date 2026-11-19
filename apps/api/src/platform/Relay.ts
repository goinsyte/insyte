import { Db } from "@insyte/database/Db"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import type { AgentTask } from "@insyte/modules/agent/domain/Triggers"
import {
  isWebhookSource,
  startFor as startWebhookRuns,
  WEBHOOK_SOURCE_EVENTS
} from "@insyte/modules/developer/use-cases/deliveries"
import { eventOf, Relay } from "@insyte/modules/shared/domain/Outbox"
import { env, waitUntil } from "cloudflare:workers"
import { Cause, Effect, Exit, Layer } from "effect"
import type { SqlClient } from "effect/sql"
import type * as Registry from "./relay/registry.ts"
import { type PendingKind, taskOf } from "./relay/tasks.ts"

/*
 * The outbox relay (M1.4). A use case's committed events are kicked onto the `EVENTS` queue (`RelayLive`); the minute
 * cron sweeps anything a kick missed (`sweep`); the queue's consumer delivers each event to every sink exactly once
 * (`deliver`): the event row is locked in its workspace's scope, each sink's run is recorded in `outbox_sinks` before it
 * runs, and the row is marked relayed. Delivered twice, the second pass finds it relayed and does nothing. What must not
 * hold the event's transaction open (a webhook delivery's run, a model call) runs after it, once.
 *
 * This is the core: the kick, the claim and the sweep. The sinks are subscribers, one file per slice in
 * `relay/subscribers/`, listed in `relay/registry.ts` in the order they run (ADR-0041). The registry, and every
 * slice's sink with it, is imported on the first delivery an isolate makes, not when a Worker starts (ADR-0041 §3):
 * the API and the public Worker only kick, and never load it.
 */

let loading: Promise<typeof Registry> | undefined

/**
 * The events a row that does not read as its event is never set aside for: a shopper's privacy request, the workspace's
 * billing, and what an endpoint subscribes to. Such a row stays due, waits longer each time (up to an hour), and is an
 * error in the log each time, until a fix reads it.
 */
const neverSetAside = (event: string) =>
  event.startsWith("privacy.") || event.startsWith("billing.") || WEBHOOK_SOURCE_EVENTS.has(event) ||
  ACCESS_ENDED.has(event)

/**
 * An access that ended (W13.6): its realtime sink closes the person's sockets (`closeMember`), which must not be given
 * up on, or a revoked contact or a removed member keeps the tabs they had open.
 */
const ACCESS_ENDED: ReadonlySet<string> = new Set(["supplier.contact_revoked", "member.access_ended"])

const NOT_ITS_EVENT = "the payload does not match its event's schema"

/**
 * How often an event's sinks may fail before it is set aside as a dead letter (about two hours of tries, the waits
 * doubling from a minute up to an hour). One that must not be lost (`neverSetAside`) is tried hourly for as long as it
 * fails, an error in the log each time.
 */
const FAILURES_BEFORE_SET_ASIDE = 8

/** The error's kind, never its message: a tagged error's tag, else the error's name. */
const codeOf = (cause: Cause.Cause<unknown>): string => {
  const error = Cause.squash(cause) as { readonly _tag?: unknown; readonly name?: unknown } | null
  const code = typeof error?._tag === "string" ? error._tag : typeof error?.name === "string" ? error.name : "Unknown"
  return code.replace(/[^\w.-]/g, "").slice(0, 80) || "Unknown"
}

/** The sinks by event type (`relay/registry.ts`), loaded once per isolate; a load that fails is tried again. */
const routes = Effect.promise(() =>
  loading ??= import("./relay/registry.ts").catch((error: unknown) => {
    loading = undefined
    throw error
  })
)

/**
 * What goes onto `EVENTS`: committed events to deliver, a ticket to classify (M15 step 2), a trigger the agent sink
 * heard (M15 step 6), or a published chapter to embed (M15 step 7), which the consumer runs beside the deliveries, never in front of them
 * (`transports/jobs/Queue.ts`).
 */
export type EventsMessage =
  | { readonly outboxIds: ReadonlyArray<string> }
  | {
    readonly classifyTicket: { readonly workspaceId: string; readonly ticketId: string; readonly eventId?: string }
  }
  | { readonly agent: AgentTask }
  | {
    readonly embedKnowledge: {
      readonly workspaceId: string
      readonly articleId: string
      readonly version: number
      readonly eventId?: string
    }
  }

/**
 * A task a person would miss if its message were lost, kept in `pending_tasks` (0109) on the transaction that relays
 * its event: a reference only (the event's outbox id and the task's kind), from which the cron builds the task again
 * (`PendingTasks.ts`, `relay/tasks.ts`). The consumer removes it once the task ran.
 */
export const keepTask = (
  sql: SqlClient.SqlClient,
  workspaceId: string,
  kind: PendingKind,
  ref: string
) =>
  sql`insert into pending_tasks (workspace_id, kind, ref) values (${workspaceId}, ${kind}, ${ref})
      on conflict (workspace_id, kind, ref) do nothing`.pipe(Effect.asVoid)

/** The longest a queue message can be delayed (Cloudflare Queues: 12 hours). */
const MAX_DELAY_SECONDS = 43_200

/** A hundred messages per `sendBatch`, the Queues limit. */
const SEND_BATCH = 100

const chunksOf = <A>(items: ReadonlyArray<A>, size: number): ReadonlyArray<ReadonlyArray<A>> =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size))

/**
 * The kick: after commit, onto the queue, in `waitUntil` so the response does not wait for it. Events that wait out an
 * undo window go onto the queue with that delay; one that arrives early is left for the sweep.
 */
export const RelayLive = Layer.succeed(Relay, {
  kick: (outboxIds, options) =>
    outboxIds.length === 0
      ? Effect.void
      : Effect.sync(() =>
        waitUntil(
          env.EVENTS.send(
            { outboxIds: [...outboxIds] } satisfies EventsMessage,
            options?.afterSeconds === undefined ? undefined : { delaySeconds: Math.ceil(options.afterSeconds) }
          )
        )
      ),
  kickEach: (events) =>
    events.length === 0 ? Effect.void : Effect.sync(() =>
      waitUntil(
        Promise.all(
          chunksOf(events, SEND_BATCH).map((chunk) =>
            env.EVENTS.sendBatch(chunk.map(({ outboxId, afterSeconds }) => ({
              body: { outboxIds: [outboxId] } satisfies EventsMessage,
              delaySeconds: Math.min(Math.ceil(afterSeconds), MAX_DELAY_SECONDS)
            })))
          )
        )
      )
    )
})

/**
 * Delivers these events, each in its workspace's scope, each sink once; then, outside the event's transaction, the
 * runs of the webhook deliveries it made (a run that started inside it could look for a row not yet committed). An
 * event that arrives inside its undo window goes back onto the queue for the time it has left: acked and dropped, it
 * waited for the cron's sweep, which previews do not run.
 */
export const deliver = Effect.fn("Relay.deliver")(function*(outboxIds: ReadonlyArray<string>) {
  const db = yield* Db
  const { ROUTES } = yield* routes
  const owners = yield* db.unscopedForCron((sql) =>
    sql<{ id: string; workspaceId: string }>`select id, workspace_id from outbox_workspaces(${[...outboxIds]})`
  )
  const early: Array<{ readonly id: string; readonly seconds: number }> = []
  for (const { id, workspaceId } of owners) {
    // What the event's transaction reached, for the line when it fails: its type and the sink running.
    const at: { event?: string; sink?: string } = {}
    const exit = yield* Effect.exit(
      db.scopedFor((sql) =>
        Effect.gen(function*() {
          const [row] = yield* sql<
            {
              event: string
              payload: Record<string, unknown>
              relayedAt: Date | null
              cancelled: boolean
              deadLettered: boolean
              early: boolean
              waitSeconds: number
            }
          >`
          select event, payload, relayed_at, cancelled_at is not null as cancelled,
                 dead_lettered_at is not null as dead_lettered,
                 coalesce(not_before, created_at) > now() as early,
                 greatest(1, ceil(extract(epoch from coalesce(not_before, created_at) - now())))::int as wait_seconds
          from outbox where id = ${id} for update skip locked`
          // Relayed already, undone, or set aside: nothing to do.
          if (row === undefined || row.relayedAt !== null || row.cancelled || row.deadLettered) return undefined
          // Still inside its undo window: back onto the queue for the rest of it (below, after the transaction).
          if (row.early) return { early: row.waitSeconds } as const
          at.event = row.event
          const event = eventOf(row.event, row.payload)
          // Not its event's shape (a row written by hand, an old one). The line names the row and its kind, never the
          // payload. Never marked relayed: set aside as a dead letter (`outbox_dead_letters()` counts it for
          // `/api/health/deep`), or, for an event that must not be lost, held back and tried again later.
          if (event === undefined) {
            if (neverSetAside(row.event)) {
              yield* Effect.logError("outbox: a row does not match its event's schema; held back, tried again later", {
                outboxId: id,
                event: row.event
              })
              yield* sql`update outbox set attempts = attempts + 1, dead_letter_reason = ${NOT_ITS_EVENT},
                         not_before = now() + make_interval(mins => least(60, power(2, least(attempts, 6))::int))
                       where id = ${id}`
              return undefined
            }
            yield* Effect.logWarning("outbox: a row does not match its event's schema; dead-lettered", {
              outboxId: id,
              event: row.event
            })
            yield* sql`update outbox set dead_lettered_at = now(), dead_letter_reason = ${NOT_ITS_EVENT},
                       attempts = attempts + 1
                     where id = ${id}`
            return undefined
          }
          for (const route of ROUTES.get(event.type) ?? []) {
            const run = route.run(id, event, sql)
            if (run === undefined) continue
            const claimed = yield* sql`insert into outbox_sinks (outbox_id, sink) values (${id}, ${route.sink})
                                     on conflict do nothing returning sink`
            at.sink = route.sink
            if (claimed.length > 0) yield* run
          }
          // The tasks it asks for, kept until they ran (sent below, once this commits).
          if (event.type === "ticket.topic_requested") {
            yield* keepTask(sql, workspaceId, "classify_ticket", id)
          }
          if (event.type === "knowledge.published") {
            yield* keepTask(sql, workspaceId, "embed_knowledge", id)
          }
          yield* sql`update outbox set relayed_at = now(), attempts = attempts + 1, dead_letter_reason = null
                   where id = ${id}`
          return { event }
        })
      ).pipe(Effect.provideService(CurrentWorkspace, { id: workspaceId as WorkspaceId }))
    )
    // One event failing (a sink, its Workflow, the room) holds up none of the others: its transaction rolled back, so
    // no sink of it ran; it waits for its own try again, and the rest of the batch goes on. Only the database away
    // (this write fails too) fails the batch, which the queue then tries again.
    if (Exit.isFailure(exit)) {
      if (Cause.hasInterruptsOnly(exit.cause)) return yield* Effect.failCause(exit.cause)
      const wait = yield* failed(id, workspaceId, at, exit.cause).pipe(
        Effect.catchCause(() => Effect.failCause(exit.cause))
      )
      if (wait !== undefined) early.push({ id, seconds: wait })
      continue
    }
    const relayed = exit.value
    if (relayed === undefined) continue
    if ("early" in relayed) {
      early.push({ id, seconds: relayed.early })
      continue
    }
    if (isWebhookSource(relayed.event)) yield* startWebhookRuns(id, relayed.event)
    // A ticket's topic by Insyte AI (M15 step 2): its own message on the queue, so a model call that takes seconds
    // holds up no other event. Sent once, when the event is relayed; the rules' topic stands until it is done.
    if (relayed.event.type === "ticket.topic_requested") {
      const message = taskOf("classify_ticket", id, relayed.event)!
      yield* Effect.tryPromise(() => env.EVENTS.send(message)).pipe(
        Effect.catchCause((cause) => Effect.logWarning("a ticket's topic was not asked for", { cause }))
      )
    }
    // A chapter published (M15 step 7): its pieces embedded on their own message, found by their words meanwhile.
    if (relayed.event.type === "knowledge.published") {
      const message = taskOf("embed_knowledge", id, relayed.event)!
      yield* Effect.tryPromise(() => env.EVENTS.send(message)).pipe(
        Effect.catchCause((cause) => Effect.logWarning("a chapter's embedding was not asked for", { cause }))
      )
    }
  }
  // Once the whole batch has gone through: a batch that fails later is retried, and would send these again each time.
  for (const chunk of chunksOf(early, SEND_BATCH)) {
    yield* Effect.promise(() =>
      env.EVENTS.sendBatch(chunk.map(({ id, seconds }) => ({
        body: { outboxIds: [id] } satisfies EventsMessage,
        delaySeconds: Math.min(seconds, MAX_DELAY_SECONDS)
      })))
    )
  }
})

/**
 * An event whose delivery failed: tried again after a wait that doubles each time (a minute, two, … an hour), or, past
 * `FAILURES_BEFORE_SET_ASIDE`, set aside as a dead letter, unless it must not be lost. The reason names the sink and
 * the error's kind, never the payload. Answers the seconds to wait, or `undefined` once it is set aside.
 */
const failed = Effect.fn("Relay.failed")(function*(
  id: string,
  workspaceId: string,
  at: { readonly event?: string; readonly sink?: string },
  cause: Cause.Cause<unknown>
) {
  const db = yield* Db
  const code = codeOf(cause)
  const reason = `sink ${at.sink ?? "none"} failed: ${code}`.slice(0, 200)
  const kept = at.event === undefined || neverSetAside(at.event)
  const [row] = yield* db.scopedFor((sql) =>
    sql<{ attempts: number; setAside: boolean; waitSeconds: number | null }>`
      update outbox set attempts = attempts + 1, dead_letter_reason = ${reason},
             dead_lettered_at = case when not ${kept} and attempts + 1 >= ${FAILURES_BEFORE_SET_ASIDE} then now() end,
             not_before = case when ${kept} or attempts + 1 < ${FAILURES_BEFORE_SET_ASIDE}
                               then now() + make_interval(mins => least(60, power(2, least(attempts, 6))::int)) end
      where id = ${id} and relayed_at is null
      returning attempts, dead_lettered_at is not null as set_aside,
                ceil(extract(epoch from not_before - now()))::int as wait_seconds`
  ).pipe(Effect.provideService(CurrentWorkspace, { id: workspaceId as WorkspaceId }))
  yield* Effect.logError(
    row?.setAside === true
      ? "outbox: an event's delivery failed too often; dead-lettered"
      : "outbox: an event's delivery failed; tried again later",
    { outboxId: id, event: at.event ?? null, sink: at.sink ?? null, code, attempts: row?.attempts ?? null }
  )
  return row === undefined || row.setAside || row.waitSeconds === null ? undefined : Math.max(1, row.waitSeconds)
})

/** The minute cron's sweep: every due event a kick missed, back onto the queue in batches. */
export const sweep = Effect.fn("Relay.sweep")(function*() {
  const db = yield* Db
  const due = yield* db.unscopedForCron((sql) => sql<{ id: string }>`select id from outbox_due(200)`)
  for (let at = 0; at < due.length; at += 50) {
    const outboxIds = due.slice(at, at + 50).map((row) => row.id)
    yield* Effect.promise(() => env.EVENTS.send({ outboxIds } satisfies EventsMessage))
  }
  return due.length
})
