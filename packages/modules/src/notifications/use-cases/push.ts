import { Db } from "@insyte/database/Db"
import { mintId } from "@insyte/domain/Ids"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import * as Audit from "../../shared/use-cases/Audit.ts"
import {
  PushDevice,
  PushNotRegistered,
  type PushSubscribe,
  PushTested,
  PushUnavailable
} from "../domain/Notifications.ts"
import { type PushMessage, type PushTarget, WebPush } from "../domain/Ports.ts"

/*
 * Web push (M11 step 13.5): the browsers a member allowed push on, each their own. Subscribing is the browser's
 * `PushSubscription` kept, once per endpoint (the same browser subscribed again only refreshes its keys; handed to
 * another member, it is theirs from then on). A message is encrypted to each browser and sent; the push service saying
 * one is gone removes it.
 */

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("")

/** The SHA-256 of an endpoint, hex: how a browser and the server tell which device is which. */
export const endpointHash = (endpoint: string) =>
  Effect.promise(() => crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint))).pipe(Effect.map(hex))

interface DeviceRow {
  readonly id: string
  readonly label: string
  readonly endpointHash: string
  readonly createdAt: Date
  readonly lastSentAt: Date | null
}

const deviceOf = (row: DeviceRow) =>
  new PushDevice({
    id: row.id,
    label: row.label,
    endpointHash: row.endpointHash,
    createdAt: row.createdAt.getTime(),
    lastSentAt: row.lastSentAt?.getTime() ?? null
  })

const devicesIn = (sql: SqlClient.SqlClient, memberId: string) =>
  Effect.map(
    sql<DeviceRow>`
      select id, label, endpoint_hash, created_at, last_sent_at from push_subscriptions
      where recipient_id = ${memberId} order by created_at`,
    (rows) => rows.map(deviceOf)
  )

/** How many browsers the member allowed push on, inside a transaction scoped to them. */
export const deviceCount = (sql: SqlClient.SqlClient, memberId: string) =>
  Effect.map(
    sql<{ n: number }>`select count(*)::int as n from push_subscriptions where recipient_id = ${memberId}`,
    ([row]) => row?.n ?? 0
  )

/** The member's own browsers, oldest first. */
export const devices = Effect.fn("Notifications.pushDevices")(function*() {
  const { id } = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) => devicesIn(sql, id))
})

/** "Push aanzetten": this browser's subscription kept for the member; answers it as a device. */
export const subscribe = Effect.fn("Notifications.subscribePush")(function*(input: PushSubscribe) {
  const push = yield* WebPush
  if (push.publicKey === null) return yield* new PushUnavailable()
  const principal = yield* CurrentPrincipal
  const hash = yield* endpointHash(input.endpoint)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      yield* sql`select claim_push_endpoint(${hash})`
      const [row] = yield* sql<DeviceRow>`
        insert into push_subscriptions (id, workspace_id, recipient_id, endpoint, endpoint_hash, p256dh, auth, label)
        values (${mintId("psh")}, ${principal.workspaceId}, ${principal.id}, ${input.endpoint}, ${hash},
                ${input.keys.p256dh}, ${input.keys.auth}, ${input.label.trim()})
        on conflict (endpoint_hash) do update
          set p256dh = excluded.p256dh, auth = excluded.auth, label = excluded.label
        returning id, label, endpoint_hash, created_at, last_sent_at`
      yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
        action: "notifications.push_subscribed",
        subjectType: "push_subscription",
        subjectId: row!.id,
        diff: { label: input.label.trim() }
      })
      return deviceOf(row!)
    })
  )
})

/** "Uitzetten op dit apparaat" (or a device removed): the member's own only; one already gone is fine. */
export const unsubscribe = Effect.fn("Notifications.unsubscribePush")(function*(deviceId: string) {
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const gone = yield* sql<{ id: string }>`
        delete from push_subscriptions where id = ${deviceId} and recipient_id = ${principal.id} returning id`
      if (gone.length > 0) {
        yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
          action: "notifications.push_unsubscribed",
          subjectType: "push_subscription",
          subjectId: deviceId
        })
      }
      return yield* devicesIn(sql, principal.id)
    })
  )
})

/**
 * One message to every browser of a member, inside a transaction scoped to them or to the workspace: answers how many
 * it reached, how many were gone (and removed), and the last refusal of those that were not.
 */
export const sendTo = Effect.fn("Notifications.pushTo")(function*(
  sql: SqlClient.SqlClient,
  memberId: string,
  message: PushMessage
) {
  const push = yield* WebPush
  const targets = yield* sql<PushTarget & { id: string }>`
    select id, endpoint, p256dh, auth from push_subscriptions where recipient_id = ${memberId}`
  let sent = 0
  let removed = 0
  let refused: string | null = null
  for (const target of targets) {
    const outcome = yield* push.send(target, message).pipe(
      Effect.as("sent" as const),
      Effect.catchTags({
        PushGone: () => Effect.succeed("gone" as const),
        PushRefused: (e) => Effect.succeed(e.reason)
      })
    )
    if (outcome === "sent") {
      sent++
      yield* sql`update push_subscriptions set last_sent_at = now() where id = ${target.id}`
    } else if (outcome === "gone") {
      removed++
      yield* sql`delete from push_subscriptions where id = ${target.id}`
    } else refused = outcome
  }
  return { sent, removed, refused, targets: targets.length }
})

/** "Testmelding sturen": now, to every browser the member allowed push on, quiet hours or not. */
export const test = Effect.fn("Notifications.testPush")(function*() {
  const push = yield* WebPush
  if (push.publicKey === null) return yield* new PushUnavailable()
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  const outcome = yield* db.scoped((sql) =>
    sendTo(sql, principal.id, {
      title: "Testmelding van Insyte",
      body: "Zo ziet een melding eruit op dit apparaat.",
      url: "/settings/notifications",
      tag: "insyte-test"
    })
  )
  if (outcome.targets === 0) return yield* new PushNotRegistered()
  return new PushTested({ sent: outcome.sent, removed: outcome.removed })
})
