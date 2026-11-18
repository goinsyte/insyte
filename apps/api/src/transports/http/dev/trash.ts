import { Db } from "@insyte/database/Db"
import { type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { sweepWorkspace as sweepTrash } from "@insyte/modules/trash/use-cases/trash"
import { Effect } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { TrashKindsLive } from "../../../platform/links/TrashKinds.ts"
import { withRequestDb } from "../../../platform/RequestDb.ts"
import { devOnly, notInProduction, workspaceParam } from "./shared.ts"

/** The tables whose removed rows the Prullenbak holds (`trash_items_v`). */
const TRASHED = ["tickets", "automations", "sheets", "courses", "webhook_endpoints", "cost_lines", "suppliers"] as const

/**
 * `POST /api/__dev/trash/sweep?workspace=<id>&age=<days>[&joined=<days>]`: the workspace's trashed items as if deleted
 * `age` days earlier, then the Prullenbak's daily sweep for that workspace (M17 step 20.1a), so the 30 days need not be
 * waited out. `joined`: the kinds that joined later (`trash_kind_joins`, 0101) as if they joined that many days ago,
 * for every workspace of the stage. Refused in production.
 */
export const TrashSweep = HttpRouter.add(
  "POST",
  "/api/__dev/trash/sweep",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const workspace = (yield* workspaceParam) as WorkspaceId
    const request = yield* HttpServerRequest.HttpServerRequest
    const params = new URL(request.url, "http://local").searchParams
    const days = (name: string) => {
      const n = Number(params.get(name) ?? "0")
      return Number.isFinite(n) ? n : 0
    }
    const joined = params.get("joined")
    const db = yield* Db
    yield* db.scopedFor((sql) =>
      Effect.gen(function*() {
        yield* Effect.forEach(
          TRASHED,
          (table) =>
            sql`update ${sql(table)} set deleted_at = deleted_at - make_interval(days => ${days("age")})
              where deleted_at is not null`
        )
        if (joined !== null) {
          yield* sql`update trash_kind_joins set joined_at = now() - make_interval(days => ${days("joined")})`
        }
      })
    ).pipe(Effect.provideService(CurrentWorkspace, { id: workspace }))
    const purged = yield* sweepTrash().pipe(
      Effect.provideService(CurrentWorkspace, { id: workspace }),
      Effect.provide(TrashKindsLive)
    )
    return HttpServerResponse.jsonUnsafe({ purged })
  }).pipe(Effect.orDie, withRequestDb)
)

/**
 * `GET /api/__dev/trash/supplier?workspace=<id>&id=<supplier>`: what a supplier's row still holds, removed or purged,
 * with how many products it supplies and the diffs of the log's lines about it (as text): for the Prullenbak's tests of
 * a purge. Only where nothing real lives.
 */
export const TrashSupplier = HttpRouter.add(
  "GET",
  "/api/__dev/trash/supplier",
  Effect.gen(function*() {
    if (!(yield* devOnly)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const workspace = (yield* workspaceParam) as WorkspaceId
    const request = yield* HttpServerRequest.HttpServerRequest
    const id = new URL(request.url, "http://local").searchParams.get("id") ?? ""
    const db = yield* Db
    const [row] = yield* db.scopedFor((sql) =>
      sql<
        {
          name: string
          vendor: string | null
          contactEmail: string | null
          purged: boolean
          deleted: boolean
          supplies: number
          audit: string
        }
      >`
        select name, vendor, contact_email, purged_at is not null as purged, deleted_at is not null as deleted,
               (select count(*)::int from product_supply p where p.supplier_id = s.id) as supplies,
               (select coalesce(string_agg(a.diff::text, ' '), '') from audit_events a
                 where a.subject_type = 'supplier' and a.subject_id = s.id) as audit
        from suppliers s where id = ${id}`
    ).pipe(Effect.provideService(CurrentWorkspace, { id: workspace }))
    return HttpServerResponse.jsonUnsafe({ supplier: row ?? null })
  }).pipe(Effect.orDie, withRequestDb)
)
