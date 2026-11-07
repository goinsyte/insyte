import { SessionRpcs } from "@insyte/api/rpc/SessionRpcs"
import { CurrentUser, type PrincipalSummary, SessionMe } from "@insyte/domain/Session"
import { Workspaces } from "@insyte/modules/workspaces/Workspaces"
import { Effect } from "effect"

export const SessionHandlers = SessionRpcs.toLayer(Effect.gen(function*() {
  const workspaces = yield* Workspaces
  return SessionRpcs.of({
    "Session.me": Effect.fn("Session.me")(function*() {
      const user = yield* CurrentUser
      const memberships = yield* workspaces.memberships
      const principals = memberships.map((m): PrincipalSummary => ({
        kind: "member",
        id: m.memberId,
        workspaceId: m.workspaceId,
        workspaceName: m.workspaceName,
        roleLabel: m.principal.role.label
      }))
      // Start once the active workspace finished onboarding; until then, onboarding (which resumes where they were).
      const onboarded = memberships[0]?.onboarded === true
      return new SessionMe({
        user,
        principals,
        activePrincipal: principals[0] ?? null,
        landing: onboarded ? "/dashboard" : "/onboarding"
      })
    })
  })
}))
