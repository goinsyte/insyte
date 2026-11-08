import { InvitationRpcs, LandingRpcs } from "@insyte/api/rpc/LandingRpcs"
import { Landing } from "@insyte/modules/members/Landing"
import { Effect, Layer } from "effect"

export const LandingHandlers = Layer.mergeAll(
  LandingRpcs.toLayer(Effect.gen(function*() {
    const landing = yield* Landing
    return LandingRpcs.of({
      "Landing.resolve": (ref) => landing.resolve(ref),
      "Landing.requestNew": (ref) => landing.requestNew(ref),
      "Landing.requestSeat": (ref) => landing.requestSeat(ref)
    })
  })),
  InvitationRpcs.toLayer(Effect.gen(function*() {
    const landing = yield* Landing
    return InvitationRpcs.of({
      "Landing.accept": (ref) => landing.accept(ref),
      "Landing.decline": (ref) => landing.decline(ref)
    })
  }))
)
