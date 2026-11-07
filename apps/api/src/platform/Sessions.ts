import { Db } from "@insyte/database/Db"
import { UserId } from "@insyte/domain/Ids"
import type { SessionUser } from "@insyte/domain/Session"
import { Effect, Option, Schema } from "effect"
import { requestAuth } from "./RequestAuth.ts"

/*
 * The session cookie → the signed-in user, the one door every RPC and server render goes through (12 §5). Two checks:
 * better-auth verifies the cookie (a cache hit costs no query), then the session row must still exist and be unexpired
 * on our own connection, so a sign-out or a revoked session takes effect at once despite the 5-minute cookie cache.
 * Workspaces and principals join in M3.
 */

const decodeUserId = Schema.decodeUnknownOption(UserId)

export const userFrom = Effect.fn("Sessions.userFrom")(function*(headers: Headers) {
  const auth = yield* requestAuth
  const found = yield* Effect.promise(() => auth.api.getSession({ headers })).pipe(
    Effect.orElseSucceed(() => null)
  )
  if (found === null) return Option.none<SessionUser>()
  const db = yield* Db
  const [live] = yield* db.routing((sql) =>
    sql<{ id: string }>`select id from auth.session where id = ${found.session.id} and expires_at > now()`
  ).pipe(Effect.orElseSucceed(() => []))
  if (live === undefined) return Option.none<SessionUser>()
  return Option.map(decodeUserId(found.user.id), (id): SessionUser => ({
    id,
    email: found.user.email,
    name: found.user.name,
    emailVerified: found.user.emailVerified,
    image: found.user.image ?? null,
    twoFactorEnabled: found.user.twoFactorEnabled === true
  }))
})
