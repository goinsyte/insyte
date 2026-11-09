import { Forbidden, NotFound } from "@insyte/domain/Errors"
import { OrderTracking } from "@insyte/modules/tracking/domain/Tracking"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

/** Tracking (M8.4): an order's parcels, where they are, and whether it is delayed (Bestellingen at Bekijken). */
export class TrackingRpcs extends RpcGroup.make(
  Rpc.make("Orders.tracking", {
    payload: Schema.Struct({ orderId: Schema.String }),
    success: OrderTracking,
    error: Schema.Union([Forbidden, NotFound])
  })
)
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
