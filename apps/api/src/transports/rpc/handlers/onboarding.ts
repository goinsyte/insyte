import { namesOtherWorkspace, WORKSPACE_HEADER } from "@insyte/api/rpc/Member"
import { OnboardingRpcs } from "@insyte/api/rpc/OnboardingRpcs"
import { WorkspaceMismatch } from "@insyte/domain/Errors"
import { Onboarding } from "@insyte/modules/onboarding/Onboarding"
import { Workspaces } from "@insyte/modules/workspaces/Workspaces"
import { Effect } from "effect"

export const OnboardingHandlers = OnboardingRpcs.toLayer(Effect.gen(function*() {
  const onboarding = yield* Onboarding
  const workspaces = yield* Workspaces
  // Start's checklist is the active workspace's (the session's choice, pinned, else the newest); a tab that names
  // another one is refused before anything is read or ticked, as `Member` refuses it.
  const active = (headers: unknown) =>
    Effect.flatMap(workspaces.current, ([m]) =>
      m !== undefined &&
        namesOtherWorkspace((headers as Record<string, string | undefined>)[WORKSPACE_HEADER], m.workspaceId)
        ? Effect.fail(new WorkspaceMismatch())
        : Effect.succeed(m?.workspaceId ?? null))
  return OnboardingRpcs.of({
    "Onboarding.me": () => onboarding.me,
    "Onboarding.advance": (input) => onboarding.advance(input),
    "Onboarding.start": (_, { headers }) => Effect.flatMap(active(headers), onboarding.start),
    "Onboarding.completeTask": (input, { headers }) =>
      Effect.flatMap(active(headers), (ws) => onboarding.completeTask(input, ws))
  })
}))
