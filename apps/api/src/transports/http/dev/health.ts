import { Db } from "@insyte/database/Db"
import { mintId, type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import type { Sweep } from "@insyte/modules/stores/domain/Health"
import { checkWorkspace } from "@insyte/modules/stores/use-cases/health"
import { Effect } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../../platform/RequestDb.ts"
import { notInProduction, workspaceParam } from "./shared.ts"

/** What a test sets on a store before the check: hours and days are relative to now. */
interface Stage {
  /** An order webhook received this many hours ago. */
  readonly deliveryHoursAgo?: number
  /** The sweep's newest order change, this many hours ago. */
  readonly watermarkHoursAgo?: number
  /** The import finished this many hours ago. */
  readonly importedHoursAgo?: number
  /** The grant lapses in this many days. */
  readonly refreshExpiresInDays?: number
  readonly scopes?: ReadonlyArray<string>
  readonly connectionStatus?: string
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000)

/**
 * `POST /api/__dev/stores/health?workspace=…&store=…`: sets what the test says on the store (`stage`), then runs one
 * workspace's health check (M17 step 6) with what the sweep "saw" of the store (`sweep`), as the cron does after the
 * reconcile sweep, without the rest of the cron. Answers the store's cursors and every incident on its connection.
 * Refused in production.
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
    const body = (yield* request.json.pipe(Effect.orDie)) as { stage?: Stage; sweep?: Sweep; now?: number }
    const stage = body.stage ?? {}
    const db = yield* Db
    const inWorkspace = Effect.provideService(CurrentWorkspace, { id: workspace as WorkspaceId })
    yield* db.scopedFor((sql) =>
      Effect.gen(function*() {
        const [row] = yield* sql<{ connectionId: string; shop: string }>`
          select s.connection_id, s.shop_domain as shop from stores s where s.id = ${store}`
        if (row === undefined) return
        if (stage.deliveryHoursAgo !== undefined) {
          yield* sql`insert into inbound_events (id, provider, delivery_id, topic, account_ref, received_at,
                                                 workspace_id, store_id, processed_at)
                     values (${mintId("evt")}, 'shopify', ${mintId("dlv")}, 'orders/updated', ${row.shop},
                             ${hoursAgo(stage.deliveryHoursAgo)}, app_workspace_id(), ${store}, now())`
        }
        if (stage.watermarkHoursAgo !== undefined) {
          yield* sql`update sync_cursors set watermark_at = ${hoursAgo(stage.watermarkHoursAgo)}
                     where connection_id = ${row.connectionId} and resource = 'orders'`
        }
        if (stage.importedHoursAgo !== undefined) {
          yield* sql`update stores set last_synced_at = ${hoursAgo(stage.importedHoursAgo)} where id = ${store}`
        }
        if (stage.refreshExpiresInDays !== undefined) {
          const at = new Date(Date.now() + stage.refreshExpiresInDays * 86_400_000).toISOString()
          yield* sql`update connections set health = health || ${JSON.stringify({ refreshExpiresAt: at })}::jsonb
                     where id = ${row.connectionId}`
        }
        if (stage.scopes !== undefined) {
          yield* sql`update connections set scopes = ${[...stage.scopes]}::text[] where id = ${row.connectionId}`
        }
        if (stage.connectionStatus !== undefined) {
          yield* sql`update connections set status = ${stage.connectionStatus} where id = ${row.connectionId}`
        }
      })
    ).pipe(inWorkspace, Effect.orDie)
    const sweeps = new Map<string, Sweep>(body.sweep === undefined ? [] : [[store, body.sweep]])
    yield* checkWorkspace(sweeps, body.now).pipe(inWorkspace, Effect.orDie)
    const result = yield* db.scopedFor((sql) =>
      Effect.all({
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
      cursors: result.cursors.map((c) => ({ resource: c.resource, watermarkAt: c.watermarkAt?.getTime() ?? null })),
      incidents: result.incidents
    })
  }).pipe(withRequestDb)
)
