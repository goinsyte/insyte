import { OnboardingRpcs } from "@insyte/api/rpc/OnboardingRpcs"
import { Onboarding } from "@insyte/modules/onboarding/Onboarding"
import { Effect } from "effect"

export const OnboardingHandlers = OnboardingRpcs.toLayer(Effect.gen(function*() {
  const onboarding = yield* Onboarding
  return OnboardingRpcs.of({
    "Onboarding.me": () => onboarding.me,
    "Onboarding.advance": (input) => onboarding.advance(input),
    "Onboarding.start": () => onboarding.start,
    "Onboarding.completeTask": (input) => onboarding.completeTask(input)
  })
}))
