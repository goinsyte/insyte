import { parcelUpdated } from "@insyte/modules/returns/use-cases/parcels"
import { ReturnParcels } from "@insyte/modules/tracking/Parcels"
import { Effect, Layer } from "effect"

/** AfterShip → a return's parcel, for the returns slice (M9.2). */
export const ReturnParcelsLive = Layer.succeed(ReturnParcels, {
  updated: (returnId, snapshot) => parcelUpdated(returnId, snapshot).pipe(Effect.orDie)
})
