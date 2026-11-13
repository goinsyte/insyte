import { Db } from "@insyte/database/Db"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { sweepParcels } from "@insyte/modules/returns/use-cases/parcels"
import { reconcileStore } from "@insyte/modules/stores/use-cases/reconcile"
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
 * minutes from the minute cron, one store at a time, each in its own workspace; one store's failure is logged and the
 * rest go on.
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

export const reconcile = Effect.gen(function*() {
  const db = yield* Db
  const stores = yield* db.routing((sql) =>
    sql<{ workspaceId: string; storeId: string }>`select workspace_id, store_id from stores_to_reconcile()`
  )
  for (const { workspaceId, storeId } of stores) {
    yield* inWorkspace(workspaceId, reconcileStore(storeId)).pipe(
      Effect.catchCause((cause) => Effect.logWarning("reconcile failed for a store", { storeId, cause }))
    )
  }
}).pipe(withRequestDb, Effect.withSpan("Stores.reconcileAll"))
