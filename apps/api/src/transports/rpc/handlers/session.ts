import { SessionRpcs } from "@insyte/api/rpc/SessionRpcs"
import { CurrentUser, type PrincipalSummary, SessionMe } from "@insyte/domain/Session"
import { Workspaces } from "@insyte/modules/workspaces/Workspaces"
import { Effect } from "effect"

export const SessionHandlers = SessionRpcs.toLayer(Effect.gen(function*() {
  const workspaces = yield* Workspaces
  return SessionRpcs.of({
    "Session.me": Effect.fn("Session.me")(function*() {
      const user = yield* CurrentUser
      const principals = (yield* workspaces.memberships).map((m): PrincipalSummary => ({
        kind: "member",
        id: m.memberId,
        workspaceId: m.workspaceId,
        workspaceName: m.workspaceName,
        roleLabel: m.principal.role.label
      }))
      // Onboarding runs until its last step lands on Start (step 3.3); until then everyone lands in onboarding.
      return new SessionMe({ user, principals, activePrincipal: principals[0] ?? null, landing: "/onboarding" })
    })
  })
}))
