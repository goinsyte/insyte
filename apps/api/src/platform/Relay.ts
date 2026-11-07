import { Db } from "@insyte/database/Db"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { type OutboxEvent, Relay } from "@insyte/modules/shared/domain/Outbox"
import { ProductAnalytics, type ProductEvent } from "@insyte/modules/shared/domain/ProductAnalytics"
import { env, waitUntil } from "cloudflare:workers"
import { Effect, Layer, Schema } from "effect"

/*
 * The outbox relay (M1.4). A use case's committed events are kicked onto the `EVENTS` queue (`RelayLive`); the minute
 * cron sweeps anything a kick missed (`sweep`); the queue's consumer delivers each event to every sink exactly once
 * (`deliver`): the event row is locked in its workspace's scope, each sink's run is recorded in `outbox_sinks` before it
 * runs, and the row is marked relayed. Delivered twice, the second pass finds it relayed and does nothing.
 */

export interface EventsMessage {
  readonly outboxIds: ReadonlyArray<string>
}

/** The kick: after commit, onto the queue, in `waitUntil` so the response does not wait for it. */
export const RelayLive = Layer.succeed(Relay, {
  kick: (outboxIds) =>
    outboxIds.length === 0
      ? Effect.void
      : Effect.sync(() => waitUntil(env.EVENTS.send({ outboxIds: [...outboxIds] } satisfies EventsMessage)))
})

/** What a sink does with an event; `undefined` when the event is not its business. */
interface Sink {
  readonly name: string
  readonly run: (id: string, event: OutboxEvent) => Effect.Effect<void, never, ProductAnalytics> | undefined
}

/** Product analytics (17 §5): the events the PostHog project knows, by the person's id, grouped by workspace. */
const productEventOf = (id: string, event: OutboxEvent): ProductEvent | undefined => {
  switch (event.type) {
    case "workspace.created":
      return {
        outboxId: id,
        event: "workspace_created",
        distinctId: event.userId,
        groups: { workspace: event.workspaceId }
      }
  }
}

const SINKS: ReadonlyArray<Sink> = [
  {
    name: "posthog",
    run: (id, event) => {
      const product = productEventOf(id, event)
      return product === undefined
        ? undefined
        : Effect.flatMap(Effect.service(ProductAnalytics), (a) => a.capture(product))
    }
  }
]

const decodeEvent = Schema.decodeUnknownEffect(Schema.toType(Schema.Struct({ type: Schema.String })))

/** Delivers these events, each in its workspace's scope, each sink once. */
export const deliver = Effect.fn("Relay.deliver")(function*(outboxIds: ReadonlyArray<string>) {
  const db = yield* Db
  const owners = yield* db.unscopedForCron((sql) =>
    sql<{ id: string; workspaceId: string }>`select id, workspace_id from outbox_workspaces(${[...outboxIds]})`
  )
  for (const { id, workspaceId } of owners) {
    yield* db.scopedFor((sql) =>
      Effect.gen(function*() {
        const [row] = yield* sql<{ event: string; payload: Record<string, unknown>; relayedAt: Date | null }>`
          select event, payload, relayed_at from outbox where id = ${id} for update skip locked`
        if (row === undefined || row.relayedAt !== null) return
        yield* decodeEvent({ type: row.event })
        const event = { type: row.event, ...row.payload } as OutboxEvent
        for (const sink of SINKS) {
          const run = sink.run(id, event)
          if (run === undefined) continue
          const claimed = yield* sql`insert into outbox_sinks (outbox_id, sink) values (${id}, ${sink.name})
                                     on conflict do nothing returning sink`
          if (claimed.length > 0) yield* run
        }
        yield* sql`update outbox set relayed_at = now(), attempts = attempts + 1 where id = ${id}`
      })
    ).pipe(Effect.provideService(CurrentWorkspace, { id: workspaceId as WorkspaceId }))
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
