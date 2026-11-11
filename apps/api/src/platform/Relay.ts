import { Db } from "@insyte/database/Db"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import {
  drainIn,
  drainWorkspace,
  markRecentWorkspace,
  sweepWorkspaces as factsWorkspaces
} from "@insyte/modules/facts/Facts"
import { ForwardSends } from "@insyte/modules/forwarding/domain/Forwarding"
import { MarketingSyncs } from "@insyte/modules/marketing/domain/Marketing"
import { InvitationLinks } from "@insyte/modules/members/domain/Ports"
import { digestDue, sendDue } from "@insyte/modules/notifications/use-cases/deliveries"
import { fanOut } from "@insyte/modules/notifications/use-cases/fanout"
import { sendDelayMail } from "@insyte/modules/orders/use-cases/delay-mail"
import { settleSent } from "@insyte/modules/proposals/Proposals"
import { refreshIn, refreshWorkspace, reopenRowIn, sweepWorkspaces } from "@insyte/modules/queue/Queue"
import { ReturnLabels } from "@insyte/modules/returns/domain/Ports"
import { shopperMail } from "@insyte/modules/returns/use-cases/mails"
import type { FileStore } from "@insyte/modules/shared/domain/Documents"
import { Mailer } from "@insyte/modules/shared/domain/Mailer"
import { type OutboxEvent, Relay } from "@insyte/modules/shared/domain/Outbox"
import { ProductAnalytics, type ProductEvent } from "@insyte/modules/shared/domain/ProductAnalytics"
import { ShopifyWrites } from "@insyte/modules/shared/domain/ShopifyWrites"
import { Backfills } from "@insyte/modules/stores/domain/Ports"
import { env, waitUntil } from "cloudflare:workers"
import { Effect, Layer, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import { roomOf } from "./Room.ts"

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

type SinkServices =
  | ProductAnalytics
  | Mailer
  | InvitationLinks
  | Backfills
  | ShopifyWrites
  | MarketingSyncs
  | ForwardSends
  | ReturnLabels
  | FileStore

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
    case "access.requested":
    case "access.decided":
      // Notifications are their business (M5); the product events do not count them.
      return undefined
    case "store.synced":
      return undefined
    case "store.connected":
      return {
        outboxId: id,
        event: "store_connected",
        distinctId: event.userId,
        groups: { workspace: event.workspaceId },
        properties: { platform: "shopify" }
      }
    case "marketing.sync_requested":
      return {
        outboxId: id,
        event: "marketing_synced",
        distinctId: event.userId,
        groups: { workspace: event.workspaceId }
      }
    case "order.delayed":
      return undefined
    case "forwarding.send_requested":
      // A supplier's standing instruction is not a person handling an order.
      return event.userId === "system" ? undefined : {
        outboxId: id,
        event: "order_handled",
        distinctId: event.userId,
        groups: { workspace: event.workspaceId },
        properties: { action: "forward", count: event.legIds.length }
      }
    case "records.changed":
    case "product.updated":
    case "customer.updated":
    case "customer.created":
      return undefined
    // A return's mails and its Shopify side are not a person's moment; starting and settling one are counted elsewhere.
    case "return.started":
    case "return.approved":
    case "return.rejected":
    case "return.label_issued":
    case "return.resolution_requested":
    case "return.resolved":
    case "return.requested":
    case "return.label_requested":
    case "quality_check.submitted":
    // The delay mail is counted as the filing that put it in line.
    case "order.delay_mail":
      return undefined
    // Filing a plate (M10.2): the mechanism the product rests on, counted by the command it carried.
    case "proposal.filed":
      return {
        outboxId: id,
        event: "proposal_filed",
        distinctId: event.userId,
        groups: { workspace: event.workspaceId },
        properties: { action: event.action }
      }
    // Handling an order in Insyte is an activation moment (M7): counted by what was done and to how many.
    case "order.updated":
    case "order.cancelled":
    case "refund.requested":
      // A supplier's own parcel (M8.3) is not a person handling an order.
      return event.userId.startsWith("supplier:") ? undefined : {
        outboxId: id,
        event: "order_handled",
        distinctId: event.userId,
        groups: { workspace: event.workspaceId },
        properties: {
          action: event.type === "order.cancelled"
            ? "cancel"
            : event.type === "refund.requested"
            ? "refund"
            : event.change,
          count: event.orderIds.length
        }
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

/** Which shopper mail each return event sends (M9.3). */
const RETURN_MAIL = {
  "return.requested": "received",
  "return.started": "received",
  "return.approved": "approved",
  "return.rejected": "rejected",
  "return.label_issued": "label",
  "return.resolved": "resolved"
} as const

type ReturnMailEvent = Extract<OutboxEvent, { type: keyof typeof RETURN_MAIL }>

const isReturnMail = (event: OutboxEvent): event is ReturnMailEvent => event.type in RETURN_MAIL

/**
 * The shopper's mails about their returns (M9.3), once a team's change has waited out its undo window: each return's,
 * once per kind. A mail that does not go fails the delivery, so the queue tries again.
 */
const returnMails = (event: ReturnMailEvent, sql: SqlClient.SqlClient) =>
  Effect.forEach(
    event.returnIds,
    (id) => shopperMail(sql, id, RETURN_MAIL[event.type], event.type === "return.started" ? "team" : "portal"),
    { discard: true }
  ).pipe(Effect.orDie)

/**
 * The shopper's delay mail (M10.2), once the filing's undo window has passed: sent with the words the plate showed, and
 * the plate told whether it went. One that did not go is not tried again by itself: its row is back in front of the
 * team, with the plate's "Opnieuw proberen".
 */
const delayMail = Effect.fn("Relay.delayMail")(
  function*(event: Extract<OutboxEvent, { type: "order.delay_mail" }>, sql: SqlClient.SqlClient) {
    const sent = yield* sendDelayMail(sql, event.mailId)
    if (sent.outcome === "skipped") return
    const failed = yield* settleSent(
      sql,
      { type: "order", id: sent.orderId, action: "NotifyDelayedOrder" },
      sent.outcome === "failed" ? sent.error : null
    )
    for (const row of failed) yield* reopenRowIn(sql, row)
    yield* refreshIn(sql)
    yield* Effect.promise(() =>
      roomOf(event.workspaceId).broadcast({ v: 1, type: "records.changed", kind: "queue_item", ids: [] })
    )
  },
  Effect.orDie
)

/** The realtime sink (M5.1): a changed record's kind and ids to its workspace's room; the tabs refetch. */
const realtime = (event: Extract<OutboxEvent, { type: "records.changed" }>) =>
  Effect.promise(() =>
    roomOf(event.workspaceId).broadcast({ v: 1, type: "records.changed", kind: event.kind, ids: [...event.ids] })
  ).pipe(Effect.withSpan("Relay.realtime"))

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

/** The record kinds whose change may open, update or close a queue row on Start (M10.1). */
const QUEUED = new Set(["order", "return", "quality_check", "store", "product"])

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

const digestWorkspaces = Effect.flatMap(Effect.service(Db), (db) =>
  db.routing((sql) =>
    Effect.map(
      sql<{ workspaceId: WorkspaceId }>`select workspace_id from digest_workspaces()`,
      (rows) => rows.map((r) => r.workspaceId)
    )
  ))

/** Every 15 minutes: the daily digests whose hour has come, per workspace (M11 step 13.5). */
export const digestSweep = Effect.fn("Relay.digestSweep")(function*() {
  for (const workspaceId of yield* digestWorkspaces) yield* digestWorkspace(workspaceId)
}, Effect.orDie)

/** One workspace's digests due at `at` (over the notes since `since`, a test's), sent, as `system`. */
export const digestWorkspace = (workspaceId: WorkspaceId, at?: Date, since?: Date) =>
  Effect.flatMap(Effect.service(Db), (db) => db.scopedFor((sql) => digestDue(sql, at, since))).pipe(
    Effect.provideService(CurrentWorkspace, { id: workspaceId })
  )

/** The record kinds whose change may touch a day's facts (M10.4): orders and what hangs off them, a store's import. */
const FACTED = new Set(["order", "refund", "fulfilment", "delivery", "store"])

/**
 * The facts sink (M10.4): one batch of the days the change marked recomputed on this transaction; a long first import's
 * remainder is the sweep's.
 */
const facts = (sql: SqlClient.SqlClient) =>
  drainIn(sql).pipe(Effect.asVoid, Effect.orDie, Effect.withSpan("Relay.facts"))

/** Batches of days one workspace gets per sweep: a first import of years drains over a few turns, not one. */
const FACTS_BATCHES_PER_SWEEP = 12

/**
 * Every 15 minutes: the days no change drained yet, per workspace; at night (`nightly`) every store's last three days
 * are marked first, which absorbs what no trigger saw (domain.md §10).
 */
export const factsSweep = Effect.fn("Relay.factsSweep")(function*(nightly: boolean) {
  if (nightly) { for (const workspaceId of yield* factsWorkspaces(true)) yield* markRecentWorkspace(workspaceId) }
  for (const workspaceId of yield* factsWorkspaces(false)) yield* drainWorkspace(workspaceId, FACTS_BATCHES_PER_SWEEP)
}, Effect.orDie)

const NOTIFIED = new Set<OutboxEvent["type"]>([
  "member.joined",
  "access.requested",
  "access.decided",
  "order.delayed",
  "return.requested",
  "ticket.assigned",
  "ticket.mentioned",
  "quality_check.submitted"
])

const SINKS: ReadonlyArray<Sink> = [
  {
    name: "notifications",
    run: (_id, event, sql) => NOTIFIED.has(event.type) ? notifications(event, sql) : undefined
  },
  {
    name: "realtime",
    run: (_id, event) => event.type === "records.changed" ? realtime(event) : undefined
  },
  {
    name: "queue",
    run: (_id, event, sql) => event.type === "records.changed" && QUEUED.has(event.kind) ? queue(event, sql) : undefined
  },
  {
    name: "facts",
    run: (_id, event, sql) => event.type === "records.changed" && FACTED.has(event.kind) ? facts(sql) : undefined
  },
  {
    name: "mail",
    run: (_id, event, sql) =>
      event.type === "member.invited"
        ? invitationMail(event, sql)
        : isReturnMail(event)
        ? returnMails(event, sql)
        : event.type === "order.delay_mail"
        ? delayMail(event, sql)
        : undefined
  },
  {
    // A connected store's first import (M6.3): one Workflow per connect, named by this event.
    name: "backfill",
    run: (id, event) =>
      event.type === "store.connected"
        ? Effect.flatMap(
          Effect.service(Backfills),
          (backfills) => backfills.start({ key: `bf-${id}`, workspaceId: event.workspaceId, storeId: event.storeId })
        )
        : undefined
  },
  {
    // An order, a product or a customer changed in Insyte (M7): to Shopify, one Workflow per event, named by it.
    name: "shopify",
    run: (id, event) =>
      event.type === "order.updated" || event.type === "order.cancelled" || event.type === "refund.requested" ||
        event.type === "product.updated" || event.type === "customer.updated" || event.type === "customer.created" ||
        event.type === "return.resolution_requested" ||
        // A return approved or rejected in Insyte goes to Shopify only where it came from there (M9.3).
        ((event.type === "return.approved" || event.type === "return.rejected") && event.toShopify.length > 0)
        ? Effect.flatMap(
          Effect.service(ShopifyWrites),
          (writes) => writes.start({ key: `sw-${id}`, workspaceId: event.workspaceId, write: event })
        )
        : undefined
  },
  {
    // Customers sent to a marketing list (M7.5): one Workflow per event, named by it.
    name: "marketing",
    run: (id, event) =>
      event.type === "marketing.sync_requested"
        ? Effect.flatMap(
          Effect.service(MarketingSyncs),
          (syncs) => syncs.start({ key: `ms-${id}`, workspaceId: event.workspaceId, syncId: event.syncId })
        )
        : undefined
  },
  {
    // Legs forwarded to their suppliers (M8.2): one Workflow per event, named by it.
    name: "forwarding",
    run: (id, event) =>
      event.type === "forwarding.send_requested"
        ? Effect.flatMap(
          Effect.service(ForwardSends),
          (sends) => sends.start({ key: `fw-${id}`, workspaceId: event.workspaceId, legIds: event.legIds })
        )
        : undefined
  },
  {
    // Return labels asked for (M9.2): one Workflow per event, named by it.
    name: "returns",
    run: (id, event) =>
      event.type === "return.label_requested"
        ? Effect.flatMap(
          Effect.service(ReturnLabels),
          (labels) => labels.start({ key: `rl-${id}`, workspaceId: event.workspaceId, returnIds: event.returnIds })
        )
        : undefined
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
