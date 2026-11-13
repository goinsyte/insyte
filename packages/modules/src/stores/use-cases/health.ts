import { Db } from "@insyte/database/Db"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { Relay } from "../../shared/domain/Outbox.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import {
  assess,
  BROKEN,
  ConnectionHealth,
  findingSentence,
  HealthLine,
  HealthView,
  Incident,
  type IncidentFacts,
  type IncidentKind,
  IncidentKind as Kinds,
  needsWrite,
  type Observed,
  type OpenIncident,
  stateOf,
  type Sweep,
  type Tried,
  triedSentence
} from "../domain/Health.ts"

/*
 * Sync health (M17 step 6, PLAN 49). The check runs after the reconcile sweep: one query reads every store's connection
 * across workspaces (`observeAll`), and only a workspace with something to write (`needsWrite`) gets a transaction of
 * its own, which reads its connections again, decides with `assess`, and writes what changed. Opening a webhook gap rewinds the store's sweep to where the webhooks stopped, so the next
 * sweeps read the gap again (with more pages while it is open, `reconcile.ts`). An incident nobody has heard of yet is
 * told to the person on call: whoever connected the store, else the owner. Reading the health is `data` Bekijken ("de
 * synchronisatie zien") or `integrations` Bekijken; the shell's line is every member's, inside the role's stores.
 */

/** At most this many steps are kept per incident: the first and the latest say what happened. */
const TRIED_KEPT = 10
const RECENT_DAYS = 7

interface Row {
  readonly storeId: string
  readonly storeName: string
  readonly storeStatus: string
  readonly importedAt: Date | null
  readonly connectionId: string
  readonly connectionStatus: string
  readonly scopes: ReadonlyArray<string>
  readonly health: Record<string, unknown>
  readonly connectedBy: string | null
  readonly lastDeliveryAt: Date | null
  readonly watermarkAt: Date | null
}

interface OpenRow {
  readonly id: string
  readonly connectionId: string
  readonly kind: IncidentKind
  readonly openedAt: Date
  readonly facts: IncidentFacts
  readonly tried: ReadonlyArray<Tried>
  readonly notifiedMemberId: string | null
}

const time = (value: unknown) => {
  const at = typeof value === "string" ? Date.parse(value) : typeof value === "number" ? value : Number.NaN
  return Number.isFinite(at) ? at : null
}

/** A step as stored: the backfill's give-up writes one without a time, which is the incident's own. */
const triedOf = (raw: unknown, openedAt: number): ReadonlyArray<Tried> =>
  Array.isArray(raw)
    ? raw.flatMap((t: Record<string, unknown>) => {
      const s = t["step"]
      if (s !== "backfill" && s !== "refresh" && s !== "reconcile" && s !== "throttle") return []
      const outcome = t["outcome"] === "failed" || t["outcome"] === "refused" ? t["outcome"] : "done"
      return [
        {
          at: time(t["at"]) ?? openedAt,
          step: s,
          outcome: s === "backfill" ? "failed" : outcome,
          since: time(t["since"]),
          reason: typeof t["reason"] === "string" ? t["reason"] : null
        } satisfies Tried
      ]
    })
    : []

const same = (a: IncidentFacts, b: IncidentFacts) => JSON.stringify(a) === JSON.stringify(b)

/** The person on call for a connection: who connected it while they are still in the team, else the owner. */
const onCall = (sql: SqlClient.SqlClient, connectedBy: string | null) =>
  Effect.map(
    sql<{ id: string }>`
      select id from members
      where deactivated_at is null and removed_at is null and (id = ${connectedBy ?? ""} or role_id = 'owner')
      order by id = ${connectedBy ?? ""} desc, joined_at limit 1`,
    (rows) => rows[0]?.id ?? null
  )

/**
 * One workspace's check (the transaction's workspace, as `system`), with what this sweep saw of each store it read.
 * Answers the outbox rows to kick.
 */
export const checkWorkspace = Effect.fn("Stores.health.check")(
  function*(sweeps: ReadonlyMap<string, Sweep>, now = Date.now()) {
    const db = yield* Db
    const outboxIds = yield* db.scopedFor((sql) =>
      Effect.gen(function*() {
        const rows = yield* sql<Row>`
          select s.id as store_id, s.name as store_name, s.status as store_status, s.last_synced_at as imported_at,
                 c.id as connection_id, c.status as connection_status, c.scopes, c.health, c.connected_by,
                 (select max(e.received_at) from inbound_events e
                  where e.store_id = s.id and e.topic like 'orders/%') as last_delivery_at,
                 (select k.watermark_at from sync_cursors k
                  where k.connection_id = c.id and k.resource = 'orders') as watermark_at
          from stores s join connections c on c.id = s.connection_id
          where c.provider = 'shopify'`
        const open = yield* sql<OpenRow>`
          select id, connection_id, kind, opened_at, facts, tried, notified_member_id from connection_incidents
          where resolved_at is null`
        const [workspace] = yield* sql<{ id: string }>`select app_workspace_id() as id`
        const workspaceId = workspace!.id

        // A sweep that failed counts against the connection (a sweep that went through cleared it, `reconcile.ts`).
        const failures = new Map<string, number>()
        for (const r of rows) {
          if (sweeps.get(r.storeId)?.ok !== false) continue
          const n = (Number(r.health["failures"]) || 0) + 1
          failures.set(r.connectionId, n)
          yield* sql`update connections set health = jsonb_set(health, '{failures}', ${n}::text::jsonb),
                       last_error_at = now()
                     where id = ${r.connectionId}`
        }

        let changed = false
        const told: Array<string> = []
        for (const r of rows) {
          const mine = open.filter((i) => i.connectionId === r.connectionId)
          const verdicts = assess(
            {
              connectionStatus: r.connectionStatus,
              storeStatus: r.storeStatus,
              scopes: r.scopes,
              refreshExpiresAt: time(r.health["refreshExpiresAt"]),
              lastOrderDeliveryAt: r.lastDeliveryAt?.getTime() ?? null,
              ordersWatermarkAt: r.watermarkAt?.getTime() ?? null,
              importedAt: r.importedAt?.getTime() ?? null,
              failures: failures.get(r.connectionId) ?? (Number(r.health["failures"]) || 0)
            },
            sweeps.get(r.storeId),
            new Map(mine.map((i) => [i.kind, i.openedAt.getTime()])),
            now
          )
          for (const kind of Kinds.literals) {
            const verdict = verdicts[kind]
            const held = mine.find((i) => i.kind === kind)
            if (verdict === "unknown") continue
            if (verdict === "ended") {
              if (held === undefined) continue
              yield* sql`update connection_incidents set resolved_at = now() where id = ${held.id}`
              changed = true
              continue
            }
            if (held === undefined) {
              yield* sql`
                insert into connection_incidents (id, workspace_id, connection_id, kind, facts, tried)
                values (${mintId("inc")}, app_workspace_id(), ${r.connectionId}, ${kind},
                        ${JSON.stringify(verdict.facts)}::jsonb, ${JSON.stringify(verdict.tried)}::jsonb)
                on conflict (connection_id, kind) where resolved_at is null do nothing`
              changed = true
              // The gap read again: every resource's sweep starts over from where the webhooks stopped.
              if (kind === "webhook_gap" && verdict.facts.since !== undefined) {
                const since = new Date(verdict.facts.since)
                yield* sql`update sync_cursors set watermark_at = least(coalesce(watermark_at, ${since}), ${since})
                           where connection_id = ${r.connectionId}
                             and resource in ('orders', 'products', 'customers')`
              }
              continue
            }
            if (verdict.again.length === 0 && same(held.facts, verdict.facts)) continue
            const tried = [...triedOf(held.tried, held.openedAt.getTime()), ...verdict.again]
            const kept = tried.length > TRIED_KEPT ? [tried[0]!, ...tried.slice(-(TRIED_KEPT - 1))] : tried
            yield* sql`update connection_incidents set facts = ${JSON.stringify(verdict.facts)}::jsonb,
                         tried = ${JSON.stringify(kept)}::jsonb
                       where id = ${held.id}`
            changed = true
          }
        }

        // Whoever is on call hears of every incident nobody has heard of yet, the backfill's give-up included.
        const untold = yield* sql<
          OpenRow & { readonly storeId: string; readonly storeName: string; connectedBy: string | null }
        >`
          select i.id, i.connection_id, i.kind, i.opened_at, i.facts, i.tried, s.id as store_id,
                 s.name as store_name, c.connected_by
          from connection_incidents i join connections c on c.id = i.connection_id
          join stores s on s.connection_id = c.id and s.status <> 'disconnected'
          where i.resolved_at is null and i.notified_member_id is null`
        for (const i of untold) {
          const memberId = yield* onCall(sql, i.connectedBy)
          if (memberId === null) continue
          yield* sql`update connection_incidents set notified_member_id = ${memberId} where id = ${i.id}`
          told.push(
            yield* Outbox.write(sql, workspaceId, {
              type: "connection.incident",
              workspaceId,
              incidentId: i.id,
              memberId,
              storeId: i.storeId,
              storeName: i.storeName,
              kind: i.kind,
              finding: findingSentence(i.kind, i.facts, now),
              tried: triedOf(i.tried, i.openedAt.getTime()).map(triedSentence)
            })
          )
          changed = true
        }
        if (!changed) return told
        const ids = [...new Set(rows.map((r) => r.connectionId))]
        return [
          ...told,
          yield* Outbox.write(sql, workspaceId, { type: "records.changed", workspaceId, kind: "connection", ids })
        ]
      })
    )
    if (outboxIds.length > 0) yield* (yield* Relay).kick(outboxIds)
    return outboxIds.length
  }
)

interface Observation {
  readonly workspaceId: string
  readonly storeId: string
  readonly storeStatus: string
  readonly importedAt: Date | null
  readonly connectionId: string
  readonly connectionStatus: string
  readonly scopes: ReadonlyArray<string>
  readonly health: Record<string, unknown>
  readonly lastDeliveryAt: Date | null
  readonly watermarkAt: Date | null
  readonly incidents: ReadonlyArray<OpenIncident>
}

/**
 * The workspaces whose check has something to write, given what the sweep saw of each store (by workspace, then
 * store): one routing query over every store's connection, decided in memory.
 */
export const workspacesToCheck = Effect.fn("Stores.health.observe")(
  function*(sweeps: ReadonlyMap<string, ReadonlyMap<string, Sweep>>, now = Date.now()) {
    const db = yield* Db
    const rows = yield* db.routing((sql) => sql<Observation>`select * from health_observations()`)
    const due = new Set<string>()
    for (const r of rows) {
      if (due.has(r.workspaceId)) continue
      const sweep = sweeps.get(r.workspaceId)?.get(r.storeId)
      const failures = Number(r.health["failures"]) || 0
      const observed: Observed = {
        connectionStatus: r.connectionStatus,
        storeStatus: r.storeStatus,
        scopes: r.scopes,
        refreshExpiresAt: time(r.health["refreshExpiresAt"]),
        lastOrderDeliveryAt: r.lastDeliveryAt?.getTime() ?? null,
        ordersWatermarkAt: r.watermarkAt?.getTime() ?? null,
        importedAt: r.importedAt?.getTime() ?? null,
        failures: sweep?.ok === false ? failures + 1 : failures
      }
      if (needsWrite(observed, sweep, r.incidents, now)) due.add(r.workspaceId)
    }
    return [...due]
  }
)

// ---------------------------------------------------------------------------------------------------------------------
// Reading it

interface StoreRow {
  readonly storeId: string
  readonly storeName: string
  readonly shopDomain: string
  readonly storeStatus: string
  readonly connectionId: string
  readonly lastSyncedAt: Date | null
  readonly lastDeliveryAt: Date | null
}

interface IncidentRow {
  readonly id: string
  readonly connectionId: string
  readonly kind: IncidentKind
  readonly openedAt: Date
  readonly resolvedAt: Date | null
  readonly facts: IncidentFacts
  readonly tried: unknown
  readonly notified: string | null
}

const storesIn = (sql: SqlClient.SqlClient) =>
  Effect.gen(function*() {
    const scope = yield* inScope(sql, "s.id")
    return yield* sql<StoreRow>`
      select s.id as store_id, s.name as store_name, s.shop_domain, s.status as store_status, c.id as connection_id,
             greatest(c.last_synced_at, s.last_synced_at) as last_synced_at,
             (select max(e.received_at) from inbound_events e
              where e.store_id = s.id and e.topic like 'orders/%') as last_delivery_at
      from stores s join connections c on c.id = s.connection_id
      where s.status <> 'disconnected' and ${scope}
      order by s.created_at`
  })

/** Every store's connection with its open incidents and the week's resolved ones (`Connections.health`). */
export const read = Effect.fn("Connections.health")(function*() {
  yield* Policy.require("data", 1).pipe(
    Effect.catchTag("Forbidden", (e) => Policy.require("integrations", 1).pipe(Effect.mapError(() => e)))
  )
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const stores = yield* storesIn(sql)
      const ids = stores.map((s) => s.connectionId)
      const incidents = ids.length === 0 ? [] : yield* sql<IncidentRow>`
        select i.id, i.connection_id, i.kind, i.opened_at, i.resolved_at, i.facts, i.tried, u.name as notified
        from connection_incidents i
        left join members m on m.id = i.notified_member_id
        left join auth."user" u on u.id = m.user_id
        where i.connection_id in ${sql.in(ids)}
          and (i.resolved_at is null or i.resolved_at > now() - make_interval(days => ${RECENT_DAYS}))
        order by i.resolved_at desc nulls first, i.opened_at desc`
      return new HealthView({
        connections: stores.map((s) => {
          const mine = incidents.filter((i) => i.connectionId === s.connectionId)
          const openKinds = mine.filter((i) => i.resolvedAt === null).map((i) => i.kind)
          const recent = mine.filter((i) => i.resolvedAt !== null).slice(0, 5)
          return new ConnectionHealth({
            connectionId: s.connectionId,
            provider: "shopify",
            storeId: s.storeId,
            storeName: s.storeName,
            shopDomain: s.shopDomain,
            state: stateOf(s.storeStatus, openKinds),
            lastSyncedAt: s.lastSyncedAt?.getTime() ?? null,
            lastDeliveryAt: s.lastDeliveryAt?.getTime() ?? null,
            incidents: [...mine.filter((i) => i.resolvedAt === null), ...recent].map((i) =>
              new Incident({
                id: i.id,
                kind: i.kind,
                openedAt: i.openedAt.getTime(),
                resolvedAt: i.resolvedAt?.getTime() ?? null,
                facts: i.facts,
                tried: triedOf(i.tried, i.openedAt.getTime()),
                notified: i.notified
              })
            )
          })
        })
      })
    })
  )
})

const WORST: Record<string, number> = { none: 0, ok: 1, importing: 2, warning: 3, broken: 4 }

/** The shell's one line (`Shell.frame.health`): any member's, inside the role's stores. */
export const line = Effect.fn("Connections.healthLine")(function*() {
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const stores = yield* storesIn(sql)
      const ids = stores.map((s) => s.connectionId)
      const open = ids.length === 0 ? [] : yield* sql<{ connectionId: string; kind: IncidentKind }>`
        select connection_id, kind from connection_incidents
        where resolved_at is null and connection_id in ${sql.in(ids)}
        order by opened_at`
      let state: HealthLine["state"] = "none"
      const attention: Array<HealthLine["attention"][number]> = []
      for (const s of stores) {
        const kinds = open.filter((i) => i.connectionId === s.connectionId).map((i) => i.kind)
        const one = stateOf(s.storeStatus, kinds)
        const word = one === "disconnected" ? "none" : one
        if (WORST[word]! > WORST[state]!) state = word
        if (s.storeStatus === "action_required") {
          attention.push({ storeId: s.storeId, storeName: s.storeName, kind: "action_required" })
          continue
        }
        // The worst of the store's incidents speaks for it.
        const worst = kinds.find((k) => BROKEN.has(k)) ?? kinds[0]
        if (worst !== undefined) attention.push({ storeId: s.storeId, storeName: s.storeName, kind: worst })
      }
      const synced = stores.map((s) => s.lastSyncedAt?.getTime() ?? 0).filter((t) => t > 0)
      return new HealthLine({
        state,
        stores: stores.length,
        attention,
        lastSyncedAt: synced.length === 0 ? null : Math.max(...synced)
      })
    })
  )
})
