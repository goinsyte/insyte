import { Shopper, ShopperRequest } from "@insyte/api/rpc/Shopper"
import { Effect, Layer } from "effect"
import { ipOf } from "../../platform/EdgeGuards.ts"

/** Where a portal call came from (M9.3): the visitor's IP, carried in the RPC's headers by the console's binding. */
export const ShopperLive = Layer.succeed(Shopper)(
  Shopper.of((effect, { headers }) =>
    Effect.provideService(effect, ShopperRequest, { ip: ipOf(new Headers(headers as Record<string, string>)) })
  )
)
