import { TrackingRpcs } from "@insyte/api/rpc/TrackingRpcs"
import { TrackingService } from "@insyte/modules/tracking/Tracking"
import { Effect } from "effect"

export const TrackingHandlers = TrackingRpcs.toLayer(Effect.gen(function*() {
  const tracking = yield* TrackingService
  return TrackingRpcs.of({ "Orders.tracking": ({ orderId }) => tracking.forOrder(orderId) })
}))
