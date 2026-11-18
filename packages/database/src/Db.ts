import { NotFound } from "@insyte/domain/Errors"
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
   * As the signed-in person inside one workspace they are an active member of, without their principal: reading a
   * workspace of theirs from outside it (the switcher, onboarding's Start), and resolving the person's principal in it.
   * The membership is checked first, in the same transaction: for someone who left, was removed or was deactivated it
   * fails as `NotFound` (the workspace, for them), so a use case that takes a workspace id from a row of the person's
   * own (onboarding's) cannot act in a workspace that is no longer theirs.
   */
  readonly asUserIn: (workspaceId: WorkspaceId) => <A, E, R>(
    f: (sql: SqlClient.SqlClient) => Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E | NotFound | SqlError.SqlError, R | CurrentUser>
  /**
   * As the signed-in person inside a workspace they are not (yet, or any more) a member of, on the two paths that make
   * them one: founding it (its first rows pass the tenant policies they will always pass), and taking up or turning
   * down an invitation to it, which the caller has proved first (the link's secret, or the verified address). Its own
   * principal kind, `newcomer`, which the database holds to those paths' tables (0096); `invitationId` names the
   * invitation handled (`app.invitation_id`), the one invitation it may change. Called only from those use cases
   * (`bun run boundaries` checks).
   */
  readonly asNewcomerIn: (workspaceId: WorkspaceId, invitationId?: string) => InTransaction<CurrentUser>
  /** Background work that resolved its workspace (a queue, a Workflow step, a cron fan-out). Runs as `system`. */
  readonly scopedFor: InTransaction<CurrentWorkspace>
  /** Routing lookups only, through security-definer functions: shop domain → workspace, key prefix → key. */
  readonly routing: InTransaction<never>
  /**
   * A cross-tenant recovery scan (the outbox relay, the sweeps). Ids and states only, never a row's content, and
   * anything then done with a row re-enters `scopedFor` with that row's workspace. `rg unscopedForCron` lists them all.
   */
  readonly unscopedForCron: InTransaction<never>
  /**
   * Insyte's support team (the staff admin, M18; `staff`, 0107), as the person `staff` names (their address, from
   * Cloudflare Access): across workspaces through `staff_find_workspaces`, or inside `workspaceId` for its health.
   * Always a read-only transaction. Called only from the support slice (`bun run boundaries` checks).
   */
  readonly asStaff: (staff: string, workspaceId: WorkspaceId | null) => InTransaction<never>
  /**
   * The same person writing down what they do: the session of looking along and both audit trails (0107 lets `staff`
   * write those and refuses it the sealed secrets). Called only from the support slice's recording.
   */
  readonly recordAsStaff: (staff: string, workspaceId: WorkspaceId | null) => InTransaction<never>
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

/** The person inside one workspace, before their principal there: a member (`asUserIn`), or none (`asNewcomerIn`). */
const asPerson = (
  sql: SqlClient.SqlClient,
  userId: string,
  workspaceId: WorkspaceId,
  kind: "member" | "newcomer",
  invitationId = ""
) =>
  sql`select set_config('app.user_id', ${userId}, true), set_config('app.workspace_id', ${workspaceId}, true),
             set_config('app.principal_kind', ${kind}, true), set_config('app.invitation_id', ${invitationId}, true)`

/** First in a transaction, before any query: Postgres then refuses every write in it, and switching back. */
const READ_ONLY = "set transaction read only"

/**
 * `Db` over one connection, given as the effect that yields it: `WithDb` passes one that opens the request's
 * connection on first use and reuses it after, so a request that never queries opens no socket, and a connection that
 * fails surfaces as a `SqlError` where the query is.
 *
 * `readOnly`: every transaction, whatever door opened it, is read-only (a staff session looking along, M18). A
 * `staff_viewer` principal's transactions are read-only in any `Db`.
 */
export const makeDb = (
  connection: Effect.Effect<SqlClient.SqlClient, SqlError.SqlError>,
  options: { readonly readOnly?: boolean } = {}
): DbService => {
  /** `f` in a transaction of its own, read-only when asked or when this `Db` is. */
  const transaction = <A, E, R>(
    sql: SqlClient.SqlClient,
    readOnly: boolean,
    f: Effect.Effect<A, E, R>
  ) =>
    sql.withTransaction(
      readOnly || options.readOnly === true ? Effect.andThen(sql.unsafe(READ_ONLY), f) : f
    )
  const inContext = <A, E, R>(c: RlsContext, f: (sql: SqlClient.SqlClient) => Effect.Effect<A, E, R>) =>
    Effect.flatMap(
      connection,
      (sql) => transaction(sql, c.kind === "staff_viewer", Effect.andThen(setContext(sql, c), f(sql)))
    )
  const asStaff =
    (staff: string, workspaceId: WorkspaceId | null, readOnly: boolean) =>
    <A, E, R>(f: (sql: SqlClient.SqlClient) => Effect.Effect<A, E, R>) =>
      Effect.flatMap(connection, (sql) =>
        transaction(
          sql,
          readOnly,
          Effect.andThen(
            sql`select set_config('app.workspace_id', ${workspaceId ?? ""}, true),
                     set_config('app.principal_id', ${staff}, true),
                     set_config('app.principal_kind', 'staff', true),
                     set_config('app.partner_id', '', true),
                     set_config('app.user_id', '', true)`,
            f(sql)
          )
        ))
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
            transaction(sql, false, Effect.andThen(sql`select set_config('app.user_id', ${user.id}, true)`, f(sql))))
      ),
    asUserIn: (workspaceId) => <A, E, R>(f: (sql: SqlClient.SqlClient) => Effect.Effect<A, E, R>) =>
      Effect.flatMap(
        Effect.service(CurrentUser),
        (user) =>
          Effect.flatMap(connection, (sql) =>
            transaction(
              sql,
              false,
              Effect.andThen(
                asPerson(sql, user.id, workspaceId, "member"),
                Effect.flatMap(
                  sql`select 1 from members where workspace_id = ${workspaceId} and user_id = ${user.id}
                      and removed_at is null and deactivated_at is null`,
                  (rows): Effect.Effect<A, E | NotFound, R> =>
                    rows.length === 0
                      ? Effect.fail(new NotFound({ entity: "workspace", id: workspaceId }))
                      : f(sql)
                )
              )
            ))
      ),
    asNewcomerIn: (workspaceId, invitationId) => (f) =>
      Effect.flatMap(
        Effect.service(CurrentUser),
        (user) =>
          Effect.flatMap(
            connection,
            (sql) =>
              transaction(
                sql,
                false,
                Effect.andThen(asPerson(sql, user.id, workspaceId, "newcomer", invitationId), f(sql))
              )
          )
      ),
    scopedFor: (f) =>
      Effect.flatMap(
        Effect.service(CurrentWorkspace),
        (ws) =>
          inContext({ workspaceId: ws.id, principalId: "system", kind: "system", partnerId: null, userId: null }, f)
      ),
    // Outside a transaction, as before, unless this `Db` is read-only: then in one, so nothing they run writes.
    routing: (f) =>
      Effect.flatMap(connection, (sql) => options.readOnly === true ? transaction(sql, true, f(sql)) : f(sql)),
    unscopedForCron: (f) =>
      Effect.flatMap(connection, (sql) => options.readOnly === true ? transaction(sql, true, f(sql)) : f(sql)),
    asStaff: (staff, workspaceId) => asStaff(staff, workspaceId, true),
    recordAsStaff: (staff, workspaceId) => asStaff(staff, workspaceId, false)
  })
}

/** `Db` over the connection in context (scripts, tests). */
export const DbLive: Layer.Layer<Db, never, SqlClient.SqlClient> = Layer.effect(
  Db,
  Effect.map(Effect.service(SqlClient.SqlClient), (sql) => makeDb(Effect.succeed(sql)))
)
