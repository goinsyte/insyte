import { AffiliateMember } from "@insyte/api/rpc/AffiliateMember"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { CurrentAffiliate, NotAffiliate } from "@insyte/modules/affiliates/domain/Affiliates"
import { withAffiliates } from "@insyte/modules/affiliates/lazy"
import { Effect, Layer } from "effect"

/**
 * `CurrentPrincipal` and `CurrentAffiliate` from the person's affiliates (M16 step 3): the newest. Read per call, so
 * an affiliate the brand removed a moment ago is out now. A paused affiliate still reads its portal.
 */
export const AffiliateMemberLive = Layer.succeed(
  AffiliateMember,
  AffiliateMember.of((effect) =>
    Effect.flatMap(withAffiliates((m) => m.applicant.held()), (held) => {
      const active = held[0]
      return active === undefined
        ? Effect.fail(new NotAffiliate())
        : effect.pipe(
          Effect.provideService(CurrentPrincipal, active.principal),
          Effect.provideService(CurrentAffiliate, active.affiliate)
        )
    })
  )
)
