import { Db } from "@insyte/database/Db"
import { Invalid, NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import { CurrentUser, type RevokeSession } from "@insyte/domain/Session"
import { Effect } from "effect"

/*
 * Beveiliging → Intrekken (M3.3; widgets/05 §2.4): signs out one of the person's other sessions. The row goes, so
 * that device is signed out on its next request: every request checks the row past better-auth's cookie cache
 * (`Sessions.userFrom`). There is no undo: a session's token cannot come back once it is gone. The person's current
 * session is refused; that is signing out. Recorded in the person's security log (`auth_events`), with where the
 * revoking request came from.
 */

/** Where the request came from, as the Worker read it from Cloudflare's headers. */
export interface Origin {
  readonly ip: string | null
  readonly country: string | null
  readonly userAgent: string | null
}

export const revokeSession = Effect.fn("Sessions.revoke")(
  function*(input: RevokeSession, currentSessionId: string, origin: Origin) {
    if (input.id === currentSessionId) return yield* new Invalid({ fields: { id: "current" } })
    const user = yield* CurrentUser
    const db = yield* Db
    const gone = yield* db.routing((sql) =>
      sql<{ id: string }>`delete from auth.session where id = ${input.id} and user_id = ${user.id} returning id`
    )
    // Another person's session reads as no session at all.
    if (gone.length === 0) return yield* new NotFound({ entity: "session", id: input.id })
    const event = mintId("aev")
    yield* db.routing((sql) =>
      sql`insert into auth_events (id, user_id, kind, ip, user_agent, country)
          values (${event}, ${user.id}, 'session_revoked', ${origin.ip}, ${origin.userAgent}, ${origin.country})`
    )
  }
)
