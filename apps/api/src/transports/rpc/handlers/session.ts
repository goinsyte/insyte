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
      // Start once the active workspace finished onboarding, or at once for whoever joined it; until then the founder
      // goes on with onboarding (which resumes where they were).
      const active = memberships[0]
      const onboarded = active !== undefined && (active.onboarded || active.principal.role.id !== "owner")
      return new SessionMe({
        user,
        principals,
        activePrincipal: principals[0] ?? null,
        landing: onboarded ? "/dashboard" : "/onboarding"
      })
    })
  })
}))
