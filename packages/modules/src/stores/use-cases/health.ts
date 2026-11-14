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
  EXPIRY_WARN_MS,
  FAILURES_BEFORE_INCIDENT,
  findingSentence,
  GAP_MS,
  HealthLine,
  HealthView,
  Incident,
  type IncidentFacts,
  type IncidentKind,
  IncidentKind as Kinds,
  NOTIFY_COOLDOWN_MS,
  RATE_SWEEPS,
  STALE_MS,
  stateOf,
  SYNC_SCOPES,
  type Tried,
  triedSentence
} from "../domain/Health.ts"

/*
 * Sync health (M17 step 6, PLAN 49). The check runs every 15 minutes beside the reconcile sweep, never after it: the
 * sweep writes what it saw on each connection (`reconcile.ts`), and the check reads that, so a sweep that runs long
 * cannot keep an incident from opening, resolving or being told. `health_due` names the workspaces with something to
 * look at (ids only, decided in SQL); each gets a transaction of its own, which locks its connections against a
 * disconnect or an uninstall, decides with `assess`, and writes what changed. An incident nobody has heard of yet is
 * told to the person on call: whoever connected the store, else the owner. Reading the health is `data` Bekijken ("de
 * synchronisatie zien") or `integrations` Bekijken; the shell's line is every member's, inside the stores they reach (`storeScope`).
 */

/** At most this many steps are kept per incident: the first and the latest say what happened. */
const TRIED_KEPT = 10
const RECENT_DAYS = 7

interface Row {
  readonly storeId: string
  readonly storeName: string
  readonly storeStatus: string
  readonly importedAt: Date | null
  readonly connectedAt: Date | null
  readonly lastOrderHookAt: Date | null
  readonly connectionId: string
  readonly connectionStatus: string
  readonly scopes: ReadonlyArray<string>
  readonly health: Record<string, unknown>
  readonly lastSweptAt: Date | null
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

const count = (value: unknown) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
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

/**
 * The person on call for a connection: who connected it while they are still in the team and still reach its store
 * (their role's stores and their own both name it, as their `storeScope` does), else the owner.
 */
const onCall = (sql: SqlClient.SqlClient, connectedBy: string | null, storeId: string) =>
  Effect.map(
    sql<{ id: string }>`
      select m.id from members m join roles r on r.workspace_id = m.workspace_id and r.id = m.role_id
      where m.deactivated_at is null and m.removed_at is null
        and (m.role_id = 'owner'
          or (m.id = ${connectedBy ?? ""}
            and (r.stores = '"all"'::jsonb or r.stores @> jsonb_build_array(${storeId}::text))
            and (m.stores = '"all"'::jsonb or m.stores @> jsonb_build_array(${storeId}::text))))
      order by m.id = ${connectedBy ?? ""} desc, m.joined_at limit 1`,
    (rows) => rows[0]?.id ?? null
  )

/**
 * One workspace's check (the transaction's workspace, as `system`). Answers how many outbox rows it wrote. Two checks
 * of one workspace never overlap (an advisory lock), and its connections are locked while it decides, so a disconnect
 * or an uninstall waits for it or goes first, never in between.
 */
export const checkWorkspace = Effect.fn("Stores.health.check")(function*(now = Date.now()) {
  const db = yield* Db
  const outboxIds = yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      yield* sql`select pg_advisory_xact_lock(hashtext('sync-health:' || app_workspace_id()))`
      const rows = yield* sql<Row & { connectedBy: string | null }>`
        select s.id as store_id, s.name as store_name, s.status as store_status, s.last_synced_at as imported_at,
               s.connected_at, s.last_order_hook_at, c.id as connection_id, c.status as connection_status, c.scopes,
               c.health, c.connected_by, c.last_synced_at as last_swept_at
        from stores s join connections c on c.id = s.connection_id
        where c.provider = 'shopify'
        order by c.id
        for update of c`
      const open = yield* sql<OpenRow>`
        select id, connection_id, kind, opened_at, facts, tried, notified_member_id from connection_incidents
        where resolved_at is null`
      const [workspace] = yield* sql<{ id: string }>`select app_workspace_id() as id`
      const workspaceId = workspace!.id

      let changed = false
      for (const r of rows) {
        const mine = open.filter((i) => i.connectionId === r.connectionId)
        const verdicts = assess(
          {
            connectionStatus: r.connectionStatus,
            storeStatus: r.storeStatus,
            scopes: r.scopes,
            refreshExpiresAt: time(r.health["refreshExpiresAt"]),
            lastOrderDeliveryAt: r.lastOrderHookAt?.getTime() ?? null,
            ordersWatermarkAt: time(r.health["ordersWatermarkAt"]),
            importedAt: r.importedAt?.getTime() ?? null,
            connectedAt: r.connectedAt?.getTime() ?? null,
            lastSweptAt: r.lastSweptAt?.getTime() ?? null,
            throttledAt: time(r.health["throttledAt"]),
            failures: count(r.health["failures"]),
            failure: typeof r.health["failure"] === "string" ? r.health["failure"] : null,
            lowSweeps: count(r.health["lowSweeps"]),
            calmSweeps: count(r.health["calmSweeps"]),
            headroom: typeof r.health["headroom"] === "number" ? r.health["headroom"] : null
          },
          mine.map((i) => ({ kind: i.kind, openedAt: i.openedAt.getTime(), facts: i.facts })),
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
            const inserted = yield* sql`
              insert into connection_incidents (id, workspace_id, connection_id, kind, facts, tried)
              values (${mintId("inc")}, app_workspace_id(), ${r.connectionId}, ${kind},
                      ${JSON.stringify(verdict.facts)}::jsonb, ${JSON.stringify(verdict.tried)}::jsonb)
              on conflict (connection_id, kind) where resolved_at is null do nothing
              returning id`
            if (inserted.length > 0) changed = true
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

      // Whoever is on call hears of every incident nobody has heard of yet, the backfill's give-up included; a kind
      // they heard of on the same connection within the cool-down is marked heard without telling them again.
      const untold = yield* sql<
        OpenRow & {
          readonly storeId: string
          readonly storeName: string
          readonly connectedBy: string | null
          readonly heardBy: string | null
        }
      >`
        select i.id, i.connection_id, i.kind, i.opened_at, i.facts, i.tried, s.id as store_id,
               s.name as store_name, c.connected_by,
               (select p.notified_member_id from connection_incidents p
                where p.connection_id = i.connection_id and p.kind = i.kind and p.id <> i.id
                  and p.notified_member_id is not null
                  and coalesce(p.resolved_at, now()) > now() - make_interval(secs => ${NOTIFY_COOLDOWN_MS / 1000})
                order by p.opened_at desc limit 1) as heard_by
        from connection_incidents i join connections c on c.id = i.connection_id
        join stores s on s.connection_id = c.id and s.status <> 'disconnected'
        where i.resolved_at is null and i.notified_member_id is null`
      const told: Array<string> = []
      for (const i of untold) {
        const memberId = i.heardBy ?? (yield* onCall(sql, i.connectedBy, i.storeId))
        if (memberId === null) continue
        // Only the check that sets it tells: a second one finds it set and says nothing.
        const claimed = yield* sql`
          update connection_incidents set notified_member_id = ${memberId}
          where id = ${i.id} and notified_member_id is null
          returning id`
        if (claimed.length === 0) continue
        changed = true
        if (i.heardBy !== null) continue
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
            tried: triedOf(i.tried, i.openedAt.getTime()).map((t) => triedSentence(t, now))
          })
        )
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
})

/**
 * The workspaces the check has to look at: any with an incident open, a sweep failing or near the rate limit, a grant
 * lapsing or gone, a scope missing, a store unread for an hour, or webhooks behind the sweep. Ids only (`health_due`),
 * over the thresholds of `Health.ts`.
 */
export const dueWorkspaces = Effect.fn("Stores.health.due")(function*() {
  const db = yield* Db
  const ms = (n: number) => `${n / 1000} seconds`
  const rows = yield* db.unscopedForCron((sql) =>
    sql<{ workspaceId: string }>`
      select workspace_id from health_due(${ms(GAP_MS)}::interval, ${ms(STALE_MS)}::interval,
                                          ${ms(EXPIRY_WARN_MS)}::interval, ${FAILURES_BEFORE_INCIDENT},
                                          ${RATE_SWEEPS}, ${[...SYNC_SCOPES]}::text[])`
  )
  return rows.map((r) => r.workspaceId)
})

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
             greatest(c.last_synced_at, s.last_synced_at) as last_synced_at, s.last_order_hook_at as last_delivery_at
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

/** The shell's one line (`Shell.frame.health`): any member's, inside the stores they reach (`storeScope`). */
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
