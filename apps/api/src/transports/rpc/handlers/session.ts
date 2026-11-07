import { SessionRpcs } from "@insyte/api/rpc/SessionRpcs"
import { CurrentUser, SessionMe } from "@insyte/domain/Session"
import { Effect } from "effect"

export const SessionHandlers = SessionRpcs.toLayer(Effect.succeed(SessionRpcs.of({
  // No workspace before M3: every signed-in user lands in onboarding.
  "Session.me": Effect.fn("Session.me")(function*() {
    const user = yield* CurrentUser
    return new SessionMe({ user, principals: [], activePrincipal: null, landing: "/onboarding" })
  })
})))
