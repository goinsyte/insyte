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
import { Effect, Layer } from "effect"
import type * as Registry from "./relay/registry.ts"

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
  event.startsWith("privacy.") || event.startsWith("billing.") || WEBHOOK_SOURCE_EVENTS.has(event)

const NOT_ITS_EVENT = "the payload does not match its event's schema"

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
  | { readonly classifyTicket: { readonly workspaceId: string; readonly ticketId: string } }
  | { readonly agent: AgentTask }
  | { readonly embedKnowledge: { readonly workspaceId: string; readonly articleId: string; readonly version: number } }

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
    const relayed = yield* db.scopedFor((sql) =>
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
          if (claimed.length > 0) yield* run
        }
        yield* sql`update outbox set relayed_at = now(), attempts = attempts + 1, dead_letter_reason = null
                   where id = ${id}`
        return { event }
      })
    ).pipe(Effect.provideService(CurrentWorkspace, { id: workspaceId as WorkspaceId }))
    if (relayed === undefined) continue
    if ("early" in relayed) {
      early.push({ id, seconds: relayed.early })
      continue
    }
    if (isWebhookSource(relayed.event)) yield* startWebhookRuns(id, relayed.event)
    // A ticket's topic by Insyte AI (M15 step 2): its own message on the queue, so a model call that takes seconds
    // holds up no other event. Sent once, when the event is relayed; the rules' topic stands until it is done.
    if (relayed.event.type === "ticket.topic_requested") {
      const message: EventsMessage = { classifyTicket: { workspaceId, ticketId: relayed.event.ticketId } }
      yield* Effect.tryPromise(() => env.EVENTS.send(message)).pipe(
        Effect.catchCause((cause) => Effect.logWarning("a ticket's topic was not asked for", { cause }))
      )
    }
    // A chapter published (M15 step 7): its pieces embedded on their own message, found by their words meanwhile.
    if (relayed.event.type === "knowledge.published") {
      const { articleId, version } = relayed.event
      const message: EventsMessage = { embedKnowledge: { workspaceId, articleId, version } }
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
