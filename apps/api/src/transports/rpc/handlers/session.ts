import { SessionRpcs } from "@insyte/api/rpc/SessionRpcs"
import { CurrentUser, type PrincipalSummary, SessionMe } from "@insyte/domain/Session"
import { countryOf } from "@insyte/integrations-better-auth/Auth"
import { BetterAuth } from "@insyte/integrations-better-auth/BetterAuth"
import { ActiveSessions } from "@insyte/modules/sessions/ActiveSessions"
import { Workspaces } from "@insyte/modules/workspaces/Workspaces"
import { Effect } from "effect"
import { currentSessionId } from "../../../platform/Sessions.ts"

/** An RPC's headers as the Fetch API's, for better-auth and Cloudflare's own. */
const webHeaders = (headers: unknown) => new Headers(headers as Record<string, string>)

export const SessionHandlers = SessionRpcs.toLayer(Effect.gen(function*() {
  const workspaces = yield* Workspaces
  const sessions = yield* ActiveSessions
  const betterAuth = yield* BetterAuth
  const current = (headers: Headers) => currentSessionId(headers).pipe(Effect.provideService(BetterAuth, betterAuth))
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
    }),
    "Session.listSessions": Effect.fn("Session.listSessions")(function*(_, { headers }) {
      return yield* sessions.list(yield* current(webHeaders(headers)))
    }),
    "Session.revoke": Effect.fn("Session.revoke")(function*(input, { headers }) {
      const web = webHeaders(headers)
      return yield* sessions.revoke(input, yield* current(web), {
        ip: web.get("cf-connecting-ip"),
        country: countryOf(web),
        userAgent: web.get("user-agent")?.slice(0, 512) ?? null
      })
    })
  })
}))
