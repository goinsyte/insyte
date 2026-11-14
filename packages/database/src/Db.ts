import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentPrincipal, CurrentWorkspace, type Principal } from "@insyte/domain/Principal"
import { CurrentUser } from "@insyte/domain/Session"
import { Context, Effect, Layer } from "effect"
import { SqlClient, type SqlError } from "effect/sql"

/*
 * The only door to Postgres (04 §6). One connection per request, and every tenant statement inside a transaction that
 * first sets the RLS context with `set_config(…, true)`: transaction-local, so safe on a pooled connection. A use case
 * never holds a `SqlClient` outside the callback and never passes a workspace id.
 */

type InTransaction<Extra> = <A, E, R>(
  f: (sql: SqlClient.SqlClient) => Effect.Effect<A, E, R>
) => Effect.Effect<A, E | SqlError.SqlError, R | Extra>

export interface DbService {
  /** As the request's principal. */
  readonly scoped: InTransaction<CurrentPrincipal>
  /**
   * As the request's partner principal (a supplier contact; an affiliate with its programme, M16): `scoped` with
   * `app.partner_id` set, so the supplier and affiliate policies show its own projection. A principal that is no partner
   * is a defect here: the partner use cases are reached only through their own middleware.
   */
  readonly scopedPartner: InTransaction<CurrentPrincipal>
  /**
   * As the signed-in person, before any workspace: only `app.user_id` is set, so the user-scoped tables
   * (`onboarding_progress`, `auth_events`) show their own rows and every tenant table shows nothing.
   */
  readonly forUser: InTransaction<CurrentUser>
  /**
   * As the signed-in person inside one workspace, before they have a principal there: founding a workspace (its first
   * rows pass the tenant policies they will always pass), and resolving the person's principal in it.
   */
  readonly asUserIn: (workspaceId: WorkspaceId) => InTransaction<CurrentUser>
  /** Background work that resolved its workspace (a queue, a Workflow step, a cron fan-out). Runs as `system`. */
  readonly scopedFor: InTransaction<CurrentWorkspace>
  /** Routing lookups only, through security-definer functions: shop domain → workspace, key prefix → key. */
  readonly routing: InTransaction<never>
  /**
   * A cross-tenant recovery scan (the outbox relay, the sweeps). Ids and states only, never a row's content, and
   * anything then done with a row re-enters `scopedFor` with that row's workspace. `rg unscopedForCron` lists them all.
   */
  readonly unscopedForCron: InTransaction<never>
}

export class Db extends Context.Service<Db, DbService>()("database/Db") {}

interface RlsContext {
  readonly workspaceId: string
  readonly principalId: string
  readonly kind: Principal["kind"]
  readonly partnerId: string | null
  readonly userId: string | null
}

const setContext = (sql: SqlClient.SqlClient, c: RlsContext) =>
  sql`select
        set_config('app.workspace_id', ${c.workspaceId}, true),
        set_config('app.principal_id', ${c.principalId}, true),
        set_config('app.principal_kind', ${c.kind}, true),
        set_config('app.partner_id', ${c.partnerId ?? ""}, true),
        set_config('app.user_id', ${c.userId ?? ""}, true)`

/**
 * `Db` over one connection, given as the effect that yields it: `WithDb` passes one that opens the request's
 * connection on first use and reuses it after, so a request that never queries opens no socket, and a connection that
 * fails surfaces as a `SqlError` where the query is.
 */
export const makeDb = (connection: Effect.Effect<SqlClient.SqlClient, SqlError.SqlError>): DbService => {
  const inContext = <A, E, R>(c: RlsContext, f: (sql: SqlClient.SqlClient) => Effect.Effect<A, E, R>) =>
    Effect.flatMap(connection, (sql) => sql.withTransaction(Effect.andThen(setContext(sql, c), f(sql))))
  return Db.of({
    scoped: (f) =>
      Effect.flatMap(Effect.service(CurrentPrincipal), (p) =>
        inContext({
          workspaceId: p.workspaceId,
          principalId: p.id,
          kind: p.kind,
          partnerId: p.partnerId,
          userId: p.userId
        }, f)),
    scopedPartner: (f) =>
      Effect.flatMap(
        Effect.service(CurrentPrincipal),
        (p) =>
          (p.kind !== "supplier_contact" && p.kind !== "affiliate") || p.partnerId === null
            ? Effect.die(new Error(`scopedPartner needs a partner principal, not ${p.kind}`))
            : inContext({
              workspaceId: p.workspaceId,
              principalId: p.id,
              kind: p.kind,
              partnerId: p.partnerId,
              userId: p.userId
            }, f)
      ),
    forUser: (f) =>
      Effect.flatMap(
        Effect.service(CurrentUser),
        (user) =>
          Effect.flatMap(connection, (sql) =>
            sql.withTransaction(Effect.andThen(sql`select set_config('app.user_id', ${user.id}, true)`, f(sql))))
      ),
    asUserIn: (workspaceId) => (f) =>
      Effect.flatMap(
        Effect.service(CurrentUser),
        (user) =>
          Effect.flatMap(connection, (sql) =>
            sql.withTransaction(Effect.andThen(
              sql`select set_config('app.user_id', ${user.id}, true), set_config('app.workspace_id', ${workspaceId}, true),
                       set_config('app.principal_kind', 'member', true)`,
              f(sql)
            )))
      ),
    scopedFor: (f) =>
      Effect.flatMap(
        Effect.service(CurrentWorkspace),
        (ws) =>
          inContext({ workspaceId: ws.id, principalId: "system", kind: "system", partnerId: null, userId: null }, f)
      ),
    routing: (f) => Effect.flatMap(connection, f),
    unscopedForCron: (f) => Effect.flatMap(connection, f)
  })
}

/** `Db` over the connection in context (scripts, tests). */
export const DbLive: Layer.Layer<Db, never, SqlClient.SqlClient> = Layer.effect(
  Db,
  Effect.map(Effect.service(SqlClient.SqlClient), (sql) => makeDb(Effect.succeed(sql)))
)
