import { Context, Effect, type Scope } from "effect"
import { SqlClient, type SqlError } from "effect/sql"

/*
 * Opening a connection, as a port. The Worker implements it over Hyperdrive and `cloudflare:sockets`
 * (`apps/api/src/platform/Hyperdrive.ts`); scripts and tests over a local `PgClient`. This package stays free of any
 * platform: no `cloudflare:*` import, no Node global.
 */

export interface ConnectService {
  /** One connection, closed when the scope closes. On Workers that scope is the request: a socket cannot outlive it. */
  readonly open: Effect.Effect<SqlClient.SqlClient, SqlError.SqlError, Scope.Scope>
}

export class Connect extends Context.Service<Connect, ConnectService>()("database/Connect") {}

/** Runs `effect` with a connection of its own, closed when it ends. */
export const withConnection = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E | SqlError.SqlError, Exclude<R, SqlClient.SqlClient> | Connect> =>
  Effect.scoped(
    Effect.gen(function*() {
      const connect = yield* Connect
      const sql = yield* connect.open
      return yield* Effect.provideService(effect, SqlClient.SqlClient, sql)
    })
  ) as Effect.Effect<A, E | SqlError.SqlError, Exclude<R, SqlClient.SqlClient> | Connect>
