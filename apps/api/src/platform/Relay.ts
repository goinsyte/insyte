import { Db } from "@insyte/database/Db"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { InvitationLinks } from "@insyte/modules/members/domain/Ports"
import { Mailer } from "@insyte/modules/shared/domain/Mailer"
import { type OutboxEvent, Relay } from "@insyte/modules/shared/domain/Outbox"
import { ProductAnalytics, type ProductEvent } from "@insyte/modules/shared/domain/ProductAnalytics"
import { env, waitUntil } from "cloudflare:workers"
import { Effect, Layer, Schema } from "effect"
import type { SqlClient } from "effect/sql"

/*
 * The outbox relay (M1.4). A use case's committed events are kicked onto the `EVENTS` queue (`RelayLive`); the minute
 * cron sweeps anything a kick missed (`sweep`); the queue's consumer delivers each event to every sink exactly once
 * (`deliver`): the event row is locked in its workspace's scope, each sink's run is recorded in `outbox_sinks` before it
 * runs, and the row is marked relayed. Delivered twice, the second pass finds it relayed and does nothing.
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

type SinkServices = ProductAnalytics | Mailer | InvitationLinks

/** What a sink does with an event, in the event's workspace; `undefined` when the event is not its business. */
interface Sink {
  readonly name: string
  readonly run: (
    id: string,
    event: OutboxEvent,
    sql: SqlClient.SqlClient
  ) => Effect.Effect<void, never, SinkServices> | undefined
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
    case "onboarding.step_completed":
      return {
        outboxId: id,
        event: "onboarding_step_completed",
        distinctId: event.userId,
        groups: { workspace: event.workspaceId },
        properties: { step: event.step }
      }
    case "member.invited":
      // A resend is the same invitation again: counted once, when first sent.
      return event.round > 0 ? undefined : {
        outboxId: id,
        event: "member_invited",
        distinctId: event.userId,
        groups: { workspace: event.workspaceId }
      }
    case "member.joined":
      return {
        outboxId: id,
        event: "invitation_accepted",
        distinctId: event.userId,
        groups: { workspace: event.workspaceId },
        properties: { via: event.via }
      }
  }
}

/**
 * The invitation's mail (M3.4), once its undo window has passed: only if it is still open and still in the round the
 * mail was written for (a resend or a revoke since then is its own story), with the facts read now. A mail that does
 * not go fails the delivery, so the queue tries again.
 */
const invitationMail = (event: Extract<OutboxEvent, { type: "member.invited" }>, sql: SqlClient.SqlClient) =>
  Effect.gen(function*() {
    const [row] = yield* sql<{
      email: string
      message: string | null
      expiresAt: Date
      workspace: string
      inviter: string
      role: string
    }>`
      select i.email, i.message, i.expires_at, w.name as workspace, u.name as inviter, r.label as role
      from invitations i
      join workspaces w on w.id = i.workspace_id
      join members m on m.id = i.invited_by
      join auth."user" u on u.id = m.user_id
      join roles r on r.workspace_id = i.workspace_id and r.id = i.role_id
      where i.id = ${event.invitationId} and i.round = ${event.round} and i.expires_at > now()
        and i.accepted_at is null and i.revoked_at is null and i.declined_at is null`
    if (row === undefined) return
    const { url } = yield* (yield* InvitationLinks).invitation(event.invitationId, event.round)
    yield* (yield* Mailer).send({
      kind: "team.invite",
      to: row.email,
      url,
      invitation: {
        workspace: row.workspace,
        inviter: row.inviter,
        role: row.role,
        message: row.message ?? undefined,
        expiresAt: row.expiresAt
      }
    })
  }).pipe(Effect.orDie)

const SINKS: ReadonlyArray<Sink> = [
  {
    name: "mail",
    run: (_id, event, sql) => event.type === "member.invited" ? invitationMail(event, sql) : undefined
  },
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
        const [row] = yield* sql<
          {
            event: string
            payload: Record<string, unknown>
            relayedAt: Date | null
            cancelled: boolean
            early: boolean
          }
        >`
          select event, payload, relayed_at, cancelled_at is not null as cancelled,
                 coalesce(not_before, created_at) > now() as early
          from outbox where id = ${id} for update skip locked`
        // Relayed already, undone, or still inside its undo window (the sweep brings it when it is due).
        if (row === undefined || row.relayedAt !== null || row.cancelled || row.early) return
        yield* decodeEvent({ type: row.event })
        const event = { type: row.event, ...row.payload } as OutboxEvent
        for (const sink of SINKS) {
          const run = sink.run(id, event, sql)
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
