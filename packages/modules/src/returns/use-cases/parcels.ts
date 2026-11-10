import { Db } from "@insyte/database/Db"
import { mintId, type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { Tracking, type TrackingSnapshot } from "../../tracking/domain/Tracking.ts"

/*
 * A return's parcel on its way back (M9.2): the tracking number on its label (Sendcloud's, or the shopper's own, "zelf
 * versturen") registered with AfterShip by the 15-minute sweep, as an outgoing parcel is; AfterShip's webhook then says
 * where it is. On its way, a return waiting for its parcel is Onderweg; delivered at the return address, its history says
 * so (the team still marks it received when it has looked). Without AfterShip nothing is registered.
 */

/** As many registrations per workspace per sweep. */
const PER_SWEEP = 50

/** One workspace's return parcels, registered. */
export const registerParcels = Effect.fn("Returns.registerParcels")(function*() {
  const tracking = yield* Tracking
  if (!tracking.configured) return
  const db = yield* Db
  const due = yield* db.scopedFor((sql) =>
    sql<{ id: string; number: string; tracking: string; carrier: string | null }>`
      select id, number, label ->> 'tracking' as tracking, label ->> 'carrier' as carrier from returns
      where label ->> 'tracking' is not null and parcel_aftership_id is null and parcel_attempts < 10
        and status in ('awaiting_parcel', 'in_transit')
      order by created_at limit ${PER_SWEEP}`
  )
  for (const r of due) {
    const registered = yield* tracking.register({
      ref: { kind: "return", id: r.id },
      trackingNumber: r.tracking,
      carrier: r.carrier,
      title: r.number
    }).pipe(Effect.result)
    yield* db.scopedFor((sql) =>
      registered._tag === "Success"
        ? sql`update returns set parcel_aftership_id = ${registered.success.aftershipId}, parcel_error = null
              where id = ${r.id}`
        : sql`update returns set parcel_attempts = parcel_attempts + ${registered.failure.retryable ? 1 : 10},
                parcel_error = ${registered.failure.reason} where id = ${r.id}`
    )
  }
})

/** The sweep's turn for return parcels, over every workspace with one to register. */
export const sweepParcels = Effect.fn("Returns.sweepParcels")(function*() {
  const db = yield* Db
  const due = yield* db.routing((sql) =>
    sql<{ workspaceId: WorkspaceId }>`select workspace_id from return_parcels_due()`
  )
  for (const { workspaceId } of due) {
    yield* registerParcels().pipe(
      Effect.provideService(CurrentWorkspace, { id: workspaceId }),
      Effect.catchCause((cause) =>
        Effect.logWarning("return parcel registration failed for a workspace", { workspaceId, cause })
      )
    )
  }
})

const history = (
  sql: SqlClient.SqlClient,
  returnId: string,
  kind: "in_transit" | "note",
  name: string | null,
  text: string
) =>
  sql`insert into return_events (id, workspace_id, return_id, actor, name, kind, text)
      values (${mintId("rev")}, app_workspace_id(), ${returnId}, 'carrier', ${name}, ${kind}, ${text})`

/** What AfterShip says of a return's parcel, applied once per change of status. */
const apply = (sql: SqlClient.SqlClient, returnId: string, snapshot: TrackingSnapshot) =>
  Effect.gen(function*() {
    const [r] = yield* sql<{ status: string; parcelStatus: string | null; carrier: string | null }>`
      select status, parcel_status, label ->> 'carrier' as carrier from returns where id = ${returnId} for update`
    if (r === undefined || r.parcelStatus === snapshot.status) return
    yield* sql`update returns set parcel_status = ${snapshot.status} where id = ${returnId}`
    switch (snapshot.status) {
      case "in_transit":
      case "out_for_delivery":
        if (r.status === "awaiting_parcel") {
          yield* sql`update returns set status = 'in_transit' where id = ${returnId}`
          yield* history(sql, returnId, "in_transit", r.carrier, "Pakket aangenomen, onderweg naar het retouradres")
        }
        return
      case "delivered":
        return yield* history(sql, returnId, "note", r.carrier, "Bezorgd op het retouradres")
      case "exception":
        return yield* history(
          sql,
          returnId,
          "note",
          r.carrier,
          `Probleem onderweg${snapshot.exception === null ? "" : `: ${snapshot.exception}`}`
        )
      default:
        return
    }
  })

/** AfterShip's webhook for a return's parcel: in the return's workspace, as `system`. */
export const parcelUpdated = Effect.fn("Returns.parcelUpdated")(
  function*(returnId: string, snapshot: TrackingSnapshot) {
    const db = yield* Db
    const [route] = yield* db.routing((sql) =>
      sql<{ workspaceId: WorkspaceId }>`select workspace_id from route_return(${returnId})`
    )
    if (route === undefined) return
    yield* db.scopedFor((sql) => apply(sql, returnId, snapshot)).pipe(
      Effect.provideService(CurrentWorkspace, { id: route.workspaceId })
    )
  }
)
