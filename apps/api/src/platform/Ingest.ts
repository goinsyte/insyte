import { Db } from "@insyte/database/Db"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { sweepParcels } from "@insyte/modules/returns/use-cases/parcels"
import { checkWorkspace, dueWorkspaces } from "@insyte/modules/stores/use-cases/health"
import { sweepStore } from "@insyte/modules/stores/use-cases/reconcile"
import { apply } from "@insyte/modules/stores/use-cases/webhooks"
import { sweep } from "@insyte/modules/tracking/use-cases/tracking"
import { Cause, Effect, Exit, ManagedRuntime } from "effect"
import { SyncLayer } from "./BackgroundLayer.ts"
import { Telemetry } from "./Observability.ts"
import { withRequestDb } from "./RequestDb.ts"

/*
 * The webhooks' consumer and the reconcile sweep (M6.3), on the sync runtime (Shopify's GraphQL, the gate). A delivery
 * that fails goes back to the queue: after `ShopifyThrottled` exactly when the bucket allows, else in thirty seconds;
 * its retries spent, it lands in the dead letters with its row still unprocessed. The sweep runs every fifteen
 * minutes from the minute cron, one store at a time, each in its own workspace, the store whose connection waited
 * longest first; one store's failure is logged and counted on its connection, and the rest go on. It stops starting
 * stores after `SWEEP_BUDGET_MS`, inside the cron's fifteen minutes, and the next run starts where this one stopped.
 *
 * The health check (M17 step 6) runs beside it, from the same cron, never after it: it reads what the sweeps wrote on
 * each connection, makes no Shopify call, asks one query across workspaces which have something to look at, and opens
 * a transaction only for those.
 */

export type { IngestMessage } from "./IngestQueue.ts"
import type { IngestMessage } from "./IngestQueue.ts"

export const syncRuntime = ManagedRuntime.make(SyncLayer)

const inWorkspace = <A, E, R>(workspaceId: string, effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provideService(CurrentWorkspace, { id: workspaceId as WorkspaceId }))

/** One batch of deliveries, each acked or retried on its own. */
export const ingest = async (batch: MessageBatch<IngestMessage>) => {
  for (const message of batch.messages) {
    const { inboundEventId, workspaceId } = message.body
    const program = withRequestDb(inWorkspace(workspaceId, apply(inboundEventId))) as Effect.Effect<void, unknown>
    const exit = await syncRuntime.runPromiseExit(program)
    if (Exit.isSuccess(exit)) {
      message.ack()
      continue
    }
    const failure = Cause.findErrorOption(exit.cause)
    const throttled = failure._tag === "Some" && (failure.value as { _tag?: string })._tag === "ShopifyThrottled"
      ? Math.ceil((failure.value as unknown as { retryAfterMs: number }).retryAfterMs / 1000)
      : 30
    await syncRuntime.runPromise(
      withRequestDb(inWorkspace(
        workspaceId,
        Effect.flatMap(
          Effect.service(Db),
          (db) =>
            db.scopedFor((sql) =>
              sql`update inbound_events set error = ${Cause.pretty(exit.cause).slice(0, 500)}
                where id = ${inboundEventId}`
            )
        )
      )).pipe(Effect.ignore) as Effect.Effect<void>
    )
    message.retry({ delaySeconds: throttled })
  }
  await Telemetry.flush()
}

/** Every connected, imported store, reconciled in turn. */
/** The 15-minute tracking sweep (M8.4): register new parcels with AfterShip, poll quiet ones, flag those not moving. */
export const trackingSweep = sweep().pipe(
  // …and the return parcels coming back (M9.2).
  Effect.andThen(sweepParcels()),
  withRequestDb,
  Effect.withSpan("Tracking.sweepAll")
)

/** A sweep stops starting stores after this long: the cron's limit is fifteen minutes, and the next sweep comes then. */
const SWEEP_BUDGET_MS = 10 * 60_000
/** Extra pages of orders one sweep reads, over all the stores with a webhook gap: a wide outage cannot stall it. */
const GAP_PAGES_PER_SWEEP = 200
/** The health check stops starting workspaces after this long; the rest are looked at in fifteen minutes. */
const CHECK_BUDGET_MS = 5 * 60_000

export const reconcile = Effect.gen(function*() {
  const db = yield* Db
  const stores = yield* db.routing((sql) =>
    sql<{ workspaceId: string; storeId: string }>`select workspace_id, store_id from stores_to_reconcile()`
  )
  const started = Date.now()
  let gapPages = GAP_PAGES_PER_SWEEP
  let swept = 0
  for (const { workspaceId, storeId } of stores) {
    if (Date.now() - started > SWEEP_BUDGET_MS) break
    swept++
    gapPages -= yield* inWorkspace(workspaceId, sweepStore(storeId, gapPages))
  }
  yield* Effect.annotateCurrentSpan({ stores: stores.length, swept, gapPagesLeft: gapPages })
}).pipe(withRequestDb, Effect.withSpan("Stores.reconcileAll"))

/** The health check: the workspaces with something to look at, each in its own transaction; one's failure is logged. */
export const healthCheck = Effect.gen(function*() {
  const due = yield* dueWorkspaces()
  const started = Date.now()
  let checked = 0
  for (const workspaceId of due) {
    if (Date.now() - started > CHECK_BUDGET_MS) break
    checked++
    yield* inWorkspace(workspaceId, checkWorkspace()).pipe(
      Effect.catchCause((cause) => Effect.logWarning("health check failed for a workspace", { workspaceId, cause }))
    )
  }
  yield* Effect.annotateCurrentSpan({ due: due.length, checked })
}).pipe(withRequestDb, Effect.withSpan("Stores.healthAll"))
