import type { CurrentPrincipal, CurrentWorkspace } from "@insyte/domain/Principal"
import { Context, type Effect } from "effect"
import type { SqlClient, SqlError } from "effect/sql"

/*
 * The only door to Postgres (04 §6). One connection per request, through Hyperdrive, and every tenant statement inside
 * a transaction that first sets the RLS context. A use case never holds a `SqlClient` outside the callback and never
 * passes a workspace id. `DbLive` arrives with the connection in M1.2.
 */

type InTransaction<Extra> = <A, E, R>(
  f: (sql: SqlClient.SqlClient) => Effect.Effect<A, E, R>
) => Effect.Effect<A, E | SqlError.SqlError, R | Extra>

export interface DbService {
  /** As the request's principal. */
  readonly scoped: InTransaction<CurrentPrincipal>
  /** Background work that resolved its workspace (a queue, a Workflow step, a cron fan-out). Runs as `system`. */
  readonly scopedFor: InTransaction<CurrentWorkspace>
  /** Routing lookups only, through security-definer functions: shop domain → workspace, key prefix → key. */
  readonly routing: InTransaction<never>
}

export class Db extends Context.Service<Db, DbService>()("database/Db") {}
