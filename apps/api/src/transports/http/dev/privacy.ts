import { Db } from "@insyte/database/Db"
import { type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect, Layer } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { privacyExportSweep } from "../../../platform/PrivacySweep.ts"
import { withRequestDb } from "../../../platform/RequestDb.ts"
import { devOnly, workspaceParam } from "./shared.ts"

/*
 * Je gegevens' dev routes (M17 step 5), for the worker tests and a developer trying it: they change or read any
 * workspace's privacy requests and rows, so they answer only locally and on a preview (never on staging or
 * production, which hold real workspaces).
 */

const refused = HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })

const param = (name: string) =>
  Effect.map(
    HttpServerRequest.HttpServerRequest,
    (request) => new URL(request.url, "http://local").searchParams.get(name) ?? ""
  )

/**
 * `POST /api/__dev/privacy/deletion-due?workspace=<id>`: the workspace's waiting deletion as if its seven days were
 * over, so a test can watch the purge without waiting them out.
 */
const DeletionDue = HttpRouter.add(
  "POST",
  "/api/__dev/privacy/deletion-due",
  Effect.gen(function*() {
    if (!(yield* devOnly)) return refused
    const workspace = (yield* workspaceParam) as WorkspaceId
    const db = yield* Db
    const rows = yield* db.scopedFor((sql) =>
      sql<{ id: string }>`update gdpr_requests set due_at = now() - interval '1 minute'
                          where kind = 'workspace_delete' and state = 'waiting' returning id`
    ).pipe(Effect.provideService(CurrentWorkspace, { id: workspace }))
    return HttpServerResponse.jsonUnsafe({ due: rows.length })
  }).pipe(Effect.orDie, withRequestDb)
)

/**
 * `POST /api/__dev/privacy/age?workspace=<id>&request=<id>&days=<n>`: a request as if made, started and finished `n`
 * days ago (and a deletion as due as long ago), for the sweep.
 */
const Age = HttpRouter.add(
  "POST",
  "/api/__dev/privacy/age",
  Effect.gen(function*() {
    if (!(yield* devOnly)) return refused
    const workspace = (yield* workspaceParam) as WorkspaceId
    const request = yield* param("request")
    const days = Number(yield* param("days"))
    const db = yield* Db
    const rows = yield* db.scopedFor((sql) =>
      sql<{ id: string }>`
        update gdpr_requests set received_at = received_at - make_interval(days => ${days}),
          started_at = started_at - make_interval(days => ${days}),
          completed_at = completed_at - make_interval(days => ${days}),
          due_at = due_at - make_interval(days => ${days})
        where id = ${request} returning id`
    ).pipe(Effect.provideService(CurrentWorkspace, { id: workspace }))
    return HttpServerResponse.jsonUnsafe({ aged: rows.length })
  }).pipe(Effect.orDie, withRequestDb)
)

/** `POST /api/__dev/privacy/sweep`: the daily sweep now (scheduled exports, expired files, stranded deletions). */
const Sweep = HttpRouter.add(
  "POST",
  "/api/__dev/privacy/sweep",
  Effect.gen(function*() {
    if (!(yield* devOnly)) return refused
    yield* privacyExportSweep()
    return HttpServerResponse.jsonUnsafe({ swept: true })
  }).pipe(withRequestDb)
)

/**
 * `GET /api/__dev/privacy/census?workspace=<id>[&find=<text>]`: every table that holds a workspace's rows, with how
 * many it holds; with `find`, every table and column whose text holds it (any case). What an export and an erasure
 * are checked against, read from the catalogue rather than from the slices.
 */
const Census = HttpRouter.add(
  "GET",
  "/api/__dev/privacy/census",
  Effect.gen(function*() {
    if (!(yield* devOnly)) return refused
    const workspace = (yield* workspaceParam) as WorkspaceId
    const find = yield* param("find")
    const db = yield* Db
    const result = yield* db.scopedFor((sql) =>
      Effect.gen(function*() {
        const columns = yield* sql<{ table: string; column: string; type: string }>`
          select c.table_name as table, c.column_name as column, c.udt_name as type
          from information_schema.columns c
          join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
          where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
            and exists (select 1 from information_schema.columns w where w.table_schema = 'public'
                          and w.table_name = c.table_name and w.column_name = 'workspace_id')
            and not exists (select 1 from pg_inherits i where i.inhrelid = (quote_ident(c.table_name))::regclass)
          order by c.table_name, c.ordinal_position`
        const tables = [...new Set(columns.map((c) => c.table))]
        const counts: Record<string, number> = {}
        for (const table of tables) {
          const [row] = yield* sql.unsafe<{ n: number }>(`select count(*)::int as n from "${table}"`)
          counts[table] = row?.n ?? 0
        }
        const found: Array<{ table: string; column: string }> = []
        if (find !== "") {
          for (const c of columns.filter((c) => ["text", "jsonb", "_text", "json"].includes(c.type))) {
            const [row] = yield* sql.unsafe<{ n: number }>(
              `select count(*)::int as n from "${c.table}" where strpos(lower("${c.column}"::text), lower($1)) > 0`,
              [find]
            )
            if ((row?.n ?? 0) > 0) found.push({ table: c.table, column: c.column })
          }
        }
        return { counts, found }
      })
    ).pipe(Effect.provideService(CurrentWorkspace, { id: workspace }))
    return HttpServerResponse.jsonUnsafe(result)
  }).pipe(Effect.orDie, withRequestDb)
)

export const PrivacyRoutes = Layer.mergeAll(DeletionDue, Age, Sweep, Census)
