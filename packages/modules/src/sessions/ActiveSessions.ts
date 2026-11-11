import type { Db } from "@insyte/database/Db"
import type { Invalid, NotFound } from "@insyte/domain/Errors"
import type { ActiveSession, CurrentUser, RevokeSession } from "@insyte/domain/Session"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import { listSessions } from "./use-cases/list.ts"
import { type Origin, revokeSession } from "./use-cases/revoke.ts"

export type { Origin } from "./use-cases/revoke.ts"

type R = Db | CurrentUser

/**
 * The person's own signed-in sessions (M3.3): Instellingen → Beveiliging lists them and signs the others out. The
 * Worker names the session asking (`currentSessionId`), which better-auth read from the cookie.
 *
 * @effect-expect-leaking Db CurrentUser
 */
export class ActiveSessions extends Context.Service<ActiveSessions, {
  readonly list: (currentSessionId: string) => Effect.Effect<ReadonlyArray<ActiveSession>, never, R>
  readonly revoke: (
    input: RevokeSession,
    currentSessionId: string,
    origin: Origin
  ) => Effect.Effect<void, Invalid | NotFound, R>
}>()("modules/ActiveSessions") {
  // A database that does not answer is a defect, as everywhere.
  static readonly layer = Layer.succeed(ActiveSessions, {
    list: (current) => listSessions(current).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    revoke: (input, current, origin) =>
      revokeSession(input, current, origin).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))
  })
}
