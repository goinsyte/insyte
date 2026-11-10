import { PortalRpcs } from "@insyte/api/rpc/PortalRpcs"
import { ShopperRequest } from "@insyte/api/rpc/Shopper"
import { HumanCheckFailed } from "@insyte/modules/returns/domain/Portal"
import { PortalService } from "@insyte/modules/returns/Portal"
import { Effect } from "effect"
import { HumanCheck } from "../../../platform/HumanCheck.ts"
import { ipKey, LIMITS, numberKey, orderKey, takeAll } from "../../../platform/PortalGuards.ts"
import { RateLimits } from "../../../platform/RateLimits.ts"

/**
 * The returns portal's calls (M9.3). The edge first: finding an order counts against the visitor's IP and the order
 * number, then asks Turnstile; a request counts against its order and the IP. Only then the use case.
 */
export const PortalHandlers = PortalRpcs.toLayer(Effect.gen(function*() {
  const portal = yield* PortalService
  const limits = yield* RateLimits
  const human = yield* HumanCheck
  const guard = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.provideService(RateLimits, limits))
  return PortalRpcs.of({
    "Portal.store": ({ handle }) => portal.store(handle),
    "Portal.lookup": (input) =>
      Effect.gen(function*() {
        const { ip } = yield* ShopperRequest
        yield* guard(takeAll([
          [yield* guard(ipKey(ip)), LIMITS.lookupPerIp],
          [numberKey(input.handle, input.number), LIMITS.lookupPerOrder]
        ]))
        if (human.required && !(yield* human.verify(input.human ?? null, ip))) {
          return yield* new HumanCheckFailed()
        }
        return yield* portal.lookup(input)
      }),
    "Portal.start": (input) =>
      Effect.gen(function*() {
        const { ip } = yield* ShopperRequest
        const orderId = yield* portal.orderOf(input.token)
        yield* guard(takeAll([
          [orderKey(orderId), LIMITS.startPerOrder],
          [yield* guard(ipKey(ip)), LIMITS.startPerIp]
        ]))
        return yield* portal.start(input)
      })
  })
}))
