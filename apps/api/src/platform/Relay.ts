import { Db } from "@insyte/database/Db"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { isWebhookSource, startFor as startWebhookRuns } from "@insyte/modules/developer/use-cases/deliveries"
import { type OutboxEvent, Relay } from "@insyte/modules/shared/domain/Outbox"
import { env, waitUntil } from "cloudflare:workers"
import { Effect, Layer, Schema } from "effect"
import { ROUTES } from "./relay/registry.ts"

/*
 * The outbox relay (M1.4). A use case's committed events are kicked onto the `EVENTS` queue (`RelayLive`); the minute
 * cron sweeps anything a kick missed (`sweep`); the queue's consumer delivers each event to every sink exactly once
 * (`deliver`): the event row is locked in its workspace's scope, each sink's run is recorded in `outbox_sinks` before it
 * runs, and the row is marked relayed. Delivered twice, the second pass finds it relayed and does nothing.
 *
 * This is the core: the kick, the claim and the sweep. The sinks are subscribers, one file per slice in
 * `relay/subscribers/`, listed in `relay/registry.ts` in the order they run (ADR-0041).
 */

export interface EventsMessage {
  readonly outboxIds: ReadonlyArray<string>
}

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
      )
})

const decodeEvent = Schema.decodeUnknownEffect(Schema.toType(Schema.Struct({ type: Schema.String })))

/** The longest a queue message can be delayed (Cloudflare Queues: 12 hours). */
const MAX_DELAY_SECONDS = 43_200

/**
 * Delivers these events, each in its workspace's scope, each sink once; then, outside the event's transaction, the
 * runs of the webhook deliveries it made (a run that started inside it could look for a row not yet committed). An
 * event that arrives inside its undo window goes back onto the queue for the time it has left: acked and dropped, it
 * waited for the cron's sweep, which previews do not run.
 */
export const deliver = Effect.fn("Relay.deliver")(function*(outboxIds: ReadonlyArray<string>) {
  const db = yield* Db
  const owners = yield* db.unscopedForCron((sql) =>
    sql<{ id: string; workspaceId: string }>`select id, workspace_id from outbox_workspaces(${[...outboxIds]})`
  )
  for (const { id, workspaceId } of owners) {
    const relayed = yield* db.scopedFor((sql) =>
      Effect.gen(function*() {
        const [row] = yield* sql<
          {
            event: string
            payload: Record<string, unknown>
            relayedAt: Date | null
            cancelled: boolean
            early: boolean
            waitSeconds: number
          }
        >`
          select event, payload, relayed_at, cancelled_at is not null as cancelled,
                 coalesce(not_before, created_at) > now() as early,
                 greatest(1, ceil(extract(epoch from coalesce(not_before, created_at) - now())))::int as wait_seconds
          from outbox where id = ${id} for update skip locked`
        // Relayed already, or undone: nothing to do.
        if (row === undefined || row.relayedAt !== null || row.cancelled) return undefined
        // Still inside its undo window: back onto the queue for the rest of it (below, after the transaction).
        if (row.early) return { early: row.waitSeconds } as const
        yield* decodeEvent({ type: row.event })
        const event = { type: row.event, ...row.payload } as OutboxEvent
        for (const route of ROUTES.get(event.type) ?? []) {
          const run = route.run(id, event, sql)
          if (run === undefined) continue
          const claimed = yield* sql`insert into outbox_sinks (outbox_id, sink) values (${id}, ${route.sink})
                                     on conflict do nothing returning sink`
          if (claimed.length > 0) yield* run
        }
        yield* sql`update outbox set relayed_at = now(), attempts = attempts + 1 where id = ${id}`
        return { event }
      })
    ).pipe(Effect.provideService(CurrentWorkspace, { id: workspaceId as WorkspaceId }))
    if (relayed === undefined) continue
    if ("early" in relayed) {
      const delaySeconds = Math.min(relayed.early, MAX_DELAY_SECONDS)
      yield* Effect.promise(() => env.EVENTS.send({ outboxIds: [id] } satisfies EventsMessage, { delaySeconds }))
      continue
    }
    if (isWebhookSource(relayed.event)) yield* startWebhookRuns(id, relayed.event)
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
