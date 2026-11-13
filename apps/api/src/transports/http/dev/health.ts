import { Db } from "@insyte/database/Db"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { ConnectionGate } from "@insyte/modules/stores/domain/Ports"
import { checkWorkspace, dueWorkspaces } from "@insyte/modules/stores/use-cases/health"
import { sweepStore } from "@insyte/modules/stores/use-cases/reconcile"
import { Effect } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../../platform/RequestDb.ts"
import { notInProduction, workspaceParam } from "./shared.ts"

/** What a test sets on a store before the check: hours and days are relative to now. */
interface Stage {
  /** The last order webhook came this many hours ago. */
  readonly deliveryHoursAgo?: number
  /** The sweep's newest order change, this many hours ago. */
  readonly watermarkHoursAgo?: number
  /** The import finished this many hours ago. */
  readonly importedHoursAgo?: number
  /** The store was (re)connected this many hours ago. */
  readonly connectedHoursAgo?: number
  /** The last sweep that read the store through, this many hours ago. */
  readonly sweptHoursAgo?: number
  /** The last sweep Shopify throttled, this many hours ago. */
  readonly throttledHoursAgo?: number
  /** The grant lapses in this many days. */
  readonly refreshExpiresInDays?: number
  readonly scopes?: ReadonlyArray<string>
  readonly connectionStatus?: string
  /** `false`: the connection's sealed token is gone (and the gate lets go of it), so a sweep finds none. */
  readonly credentials?: boolean
  /** What the sweeps wrote on the connection: failures in a row and why, low and calm sweeps, the share left. */
  readonly failures?: number
  readonly failure?: string
  readonly lowSweeps?: number
  readonly calmSweeps?: number
  readonly headroom?: number
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000)

/**
 * `POST /api/__dev/stores/health?workspace=…&store=…`: sets what the test says on the store and its connection
 * (`stage`), optionally sweeps that one store as the cron would (`sweep`), then runs the workspace's health check (M17
 * step 6) as the cron does, without the rest of the cron. Answers whether the cron would have checked the workspace
 * (`due`, read before the check), the connection's sweep outcomes, the store's cursors and every incident on its
 * connection. Refused in production.
 */
export const HealthCheck = HttpRouter.add(
  "POST",
  "/api/__dev/stores/health",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const workspace = yield* workspaceParam
    const request = yield* HttpServerRequest.HttpServerRequest
    const store = new URL(request.url, "http://local").searchParams.get("store") ?? ""
    const body = (yield* request.json.pipe(Effect.orDie)) as {
      stage?: Stage
      sweep?: boolean
      check?: boolean
      now?: number
    }
    const stage = body.stage ?? {}
    const db = yield* Db
    const inWorkspace = Effect.provideService(CurrentWorkspace, { id: workspace as WorkspaceId })
    yield* db.scopedFor((sql) =>
      Effect.gen(function*() {
        const [row] = yield* sql<{ connectionId: string }>`select connection_id from stores where id = ${store}`
        if (row === undefined) return
        const health: Record<string, unknown> = {}
        if (stage.watermarkHoursAgo !== undefined) {
          health["ordersWatermarkAt"] = hoursAgo(stage.watermarkHoursAgo).toISOString()
        }
        if (stage.throttledHoursAgo !== undefined) {
          health["throttledAt"] = hoursAgo(stage.throttledHoursAgo).toISOString()
        }
        if (stage.refreshExpiresInDays !== undefined) {
          health["refreshExpiresAt"] = new Date(Date.now() + stage.refreshExpiresInDays * 86_400_000).toISOString()
        }
        for (const key of ["failures", "failure", "lowSweeps", "calmSweeps", "headroom"] as const) {
          if (stage[key] !== undefined) health[key] = stage[key]
        }
        if (Object.keys(health).length > 0) {
          yield* sql`update connections set health = health || ${JSON.stringify(health)}::jsonb
                     where id = ${row.connectionId}`
        }
        if (stage.deliveryHoursAgo !== undefined) {
          yield* sql`update stores set last_order_hook_at = ${hoursAgo(stage.deliveryHoursAgo)} where id = ${store}`
        }
        if (stage.importedHoursAgo !== undefined) {
          yield* sql`update stores set last_synced_at = ${hoursAgo(stage.importedHoursAgo)} where id = ${store}`
        }
        if (stage.connectedHoursAgo !== undefined) {
          yield* sql`update stores set connected_at = ${hoursAgo(stage.connectedHoursAgo)} where id = ${store}`
        }
        if (stage.sweptHoursAgo !== undefined) {
          yield* sql`update connections set last_synced_at = ${hoursAgo(stage.sweptHoursAgo)}
                     where id = ${row.connectionId}`
        }
        if (stage.scopes !== undefined) {
          yield* sql`update connections set scopes = ${[...stage.scopes]}::text[] where id = ${row.connectionId}`
        }
        if (stage.connectionStatus !== undefined) {
          yield* sql`update connections set status = ${stage.connectionStatus} where id = ${row.connectionId}`
        }
        if (stage.credentials === false) {
          yield* sql`delete from connection_credentials where connection_id = ${row.connectionId}`
        }
        return row.connectionId
      })
    ).pipe(
      Effect.tap((connectionId) =>
        connectionId !== undefined && stage.credentials === false
          ? Effect.flatMap(ConnectionGate, (gate) => gate.forget(connectionId))
          : Effect.void
      ),
      inWorkspace,
      Effect.orDie
    )
    if (body.sweep === true) yield* sweepStore(store, 200).pipe(inWorkspace, Effect.orDie)
    const due = (yield* dueWorkspaces().pipe(Effect.orDie)).includes(workspace)
    if (body.check !== false) yield* checkWorkspace(body.now).pipe(inWorkspace, Effect.orDie)
    const result = yield* db.scopedFor((sql) =>
      Effect.all({
        connection: sql<{ health: Record<string, unknown>; lastSweptAt: Date | null }>`
          select c.health, c.last_synced_at as last_swept_at from connections c join stores s on s.connection_id = c.id
          where s.id = ${store}`,
        cursors: sql<{ resource: string; watermarkAt: Date | null }>`
          select k.resource, k.watermark_at from sync_cursors k join stores s on s.connection_id = k.connection_id
          where s.id = ${store} order by k.resource`,
        incidents: sql<{ kind: string; open: boolean; notified: boolean; facts: unknown; tried: unknown }>`
          select i.kind, i.resolved_at is null as open, i.notified_member_id is not null as notified, i.facts, i.tried
          from connection_incidents i join stores s on s.connection_id = i.connection_id
          where s.id = ${store} order by i.opened_at`
      })
    ).pipe(inWorkspace, Effect.orDie)
    return HttpServerResponse.jsonUnsafe({
      due,
      health: result.connection[0]?.health ?? null,
      lastSweptAt: result.connection[0]?.lastSweptAt?.getTime() ?? null,
      cursors: result.cursors.map((c) => ({ resource: c.resource, watermarkAt: c.watermarkAt?.getTime() ?? null })),
      incidents: result.incidents
    })
  }).pipe(withRequestDb)
)
