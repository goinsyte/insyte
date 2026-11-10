import type { Db } from "@insyte/database/Db"
import { Context, type Effect } from "effect"
import type { TrackingSnapshot } from "./domain/Tracking.ts"

/**
 * A return's parcel, as AfterShip's webhook tells it (M9.2): the returns slice owns what that means for the return, over
 * the request's connection; composed where the app is put together.
 */
export class ReturnParcels extends Context.Service<ReturnParcels, {
  readonly updated: (returnId: string, snapshot: TrackingSnapshot) => Effect.Effect<void, never, Db>
}>()("tracking/ReturnParcels") {}
