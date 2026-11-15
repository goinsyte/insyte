import { WorkspaceChoiceRpcs, WorkspacesRpcs } from "@insyte/api/rpc/WorkspacesRpcs"
import { CurrentUser } from "@insyte/domain/Session"
import { BetterAuth } from "@insyte/integrations-better-auth/BetterAuth"
import { Members } from "@insyte/modules/members/Members"
import { Memberships } from "@insyte/modules/members/Memberships"
import { Onboarding } from "@insyte/modules/onboarding/Onboarding"
import { Workspaces } from "@insyte/modules/workspaces/Workspaces"
import { WorkspaceSettings } from "@insyte/modules/workspaces/WorkspaceSettings"
import { Effect, Layer } from "effect"
import { currentSessionId } from "../../../platform/Sessions.ts"

export const WorkspacesHandlers = Layer.mergeAll(
  WorkspacesRpcs.toLayer(Effect.gen(function*() {
    const settings = yield* WorkspaceSettings
    const members = yield* Members
    return WorkspacesRpcs.of({
      "Workspaces.getAccount": () => settings.account,
      "Workspaces.saveAccount": (input) => settings.saveAccount(input),
      "Workspaces.setAlerts": (input) => settings.setAlerts(input),
      "Workspaces.setRetention": (input) => settings.setRetention(input),
      "Workspaces.getRegional": () => settings.regional,
      "Workspaces.saveRegional": (input) => settings.saveRegional(input),
      "Workspaces.getSecurity": () => settings.security,
      "Workspaces.transferOwnership": ({ memberId }) => members.transferOwnership(memberId)
    })
  })),
  WorkspaceChoiceRpcs.toLayer(Effect.gen(function*() {
    const workspaces = yield* Workspaces
    const memberships = yield* Memberships
    const onboarding = yield* Onboarding
    const betterAuth = yield* BetterAuth
    // The session asking, by id: a switch, a new workspace and leaving one change that session's choice only.
    const session = (headers: unknown) =>
      currentSessionId(new Headers(headers as Record<string, string>)).pipe(
        Effect.provideService(BetterAuth, betterAuth)
      )
    return WorkspaceChoiceRpcs.of({
      "Workspaces.list": () => workspaces.list,
      "Workspaces.create": Effect.fn("Workspaces.create")(function*(input, { headers }) {
        return yield* onboarding.another(input, yield* session(headers))
      }),
      "Workspaces.switch": Effect.fn("Workspaces.switch")(function*({ workspaceId }, { headers }) {
        return yield* workspaces.switchTo(yield* session(headers), { workspaceId })
      }),
      "Workspaces.leave": Effect.fn("Workspaces.leave")(function*({ workspaceId }, { headers }) {
        return yield* memberships.leave(yield* session(headers), workspaceId)
      }),
      "Workspaces.listInvites": () => memberships.invites,
      // Joining makes that workspace the newest membership: a session that had not chosen one yet keeps the one it was
      // in, and the person opens the new one themselves ("Openen").
      "Workspaces.acceptInvite": Effect.fn("Workspaces.acceptInvite")(function*({ id }, { headers }) {
        const user = yield* CurrentUser
        const [current] = yield* workspaces.memberships
        if (current !== undefined && (user.activeWorkspaceId ?? null) === null) {
          yield* workspaces.switchTo(yield* session(headers), { workspaceId: current.workspaceId }).pipe(Effect.orDie)
        }
        return yield* memberships.accept(id)
      }),
      "Workspaces.declineInvite": ({ id }) => memberships.decline(id),
      "Workspaces.restoreInvite": ({ id }) => memberships.restore(id)
    })
  }))
)
