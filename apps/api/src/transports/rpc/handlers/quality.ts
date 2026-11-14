import { QualityLinkRpcs, QualityRpcs } from "@insyte/api/rpc/QualityRpcs"
import { ShopperRequest } from "@insyte/api/rpc/Shopper"
import { QualityLinkService, QualityService } from "@insyte/modules/quality/Quality"
import { Effect, Layer } from "effect"
import { checkKey, ipKey, LIMITS, takeAll } from "../../../platform/PortalGuards.ts"
import { RateLimits } from "../../../platform/RateLimits.ts"

export const QualityHandlers = Layer.mergeAll(
  QualityRpcs.toLayer(Effect.gen(function*() {
    const quality = yield* QualityService
    return QualityRpcs.of({
      "Quality.list": ({ productId }) => quality.list(productId),
      "Quality.stats": (input) => quality.stats(input),
      "Quality.request": (input) => quality.request(input),
      "Quality.approve": ({ id }) => quality.approve(id),
      "Quality.reject": (input) => quality.reject(input),
      "Quality.setPhase": (input) => quality.setPhase(input),
      "Quality.link": ({ id }) => quality.link(id)
    })
  })),
  // The supplier's link: a submission counts against its check and the IP, before the use case.
  QualityLinkRpcs.toLayer(Effect.gen(function*() {
    const link = yield* QualityLinkService
    const limits = yield* RateLimits
    return QualityLinkRpcs.of({
      "QualityLink.check": ({ token }) => link.check(token),
      "QualityLink.submit": (input) =>
        Effect.gen(function*() {
          const { ip } = yield* ShopperRequest
          const checkId = yield* link.checkOf(input.token)
          yield* takeAll([[checkKey(checkId), LIMITS.submitPerCheck], [yield* ipKey(ip), LIMITS.startPerIp]])
          return yield* link.submit(input)
        }).pipe(Effect.provideService(RateLimits, limits))
    })
  }))
)
