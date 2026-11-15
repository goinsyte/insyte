import { OnboardingRpcs } from "@insyte/api/rpc/OnboardingRpcs"
import { Onboarding } from "@insyte/modules/onboarding/Onboarding"
import { Workspaces } from "@insyte/modules/workspaces/Workspaces"
import { Effect } from "effect"

export const OnboardingHandlers = OnboardingRpcs.toLayer(Effect.gen(function*() {
  const onboarding = yield* Onboarding
  const workspaces = yield* Workspaces
  // Start's checklist is the active workspace's (the session's choice, else the newest).
  const active = Effect.map(workspaces.memberships, ([m]) => m?.workspaceId ?? null)
  return OnboardingRpcs.of({
    "Onboarding.me": () => onboarding.me,
    "Onboarding.advance": (input) => onboarding.advance(input),
    "Onboarding.start": () => Effect.flatMap(active, onboarding.start),
    "Onboarding.completeTask": (input) => Effect.flatMap(active, (ws) => onboarding.completeTask(input, ws))
  })
}))
