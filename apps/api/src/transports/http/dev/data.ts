import { Db } from "@insyte/database/Db"
import { type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { ordersSourceOf, purgeImports } from "@insyte/modules/data/Data"
import { parseCsv } from "@insyte/modules/data/domain/csv"
import type { ExportJob, ExportPage } from "@insyte/modules/shared/domain/Exports"
import { expireIn, finish } from "@insyte/modules/shared/use-cases/Exports"
import { Effect, Layer } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { FilePartsR2 } from "../../../platform/Documents.ts"
import { withRequestDb } from "../../../platform/RequestDb.ts"
import { notInProduction, workspaceParam } from "./shared.ts"

/*
 * The Data hub's test doors (M14 step 5), each refused in production: the nightly sweep as if hours had passed, an
 * import's audit lines, an export's `finish` run a second time (a Workflow retry), and the orders source paged by a
 * few rows, so the tests cross page ends without thousands of orders.
 */

const notFound = HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })

const param = (name: string) =>
  Effect.map(
    HttpServerRequest.HttpServerRequest,
    (request) => new URL(request.url, "http://local").searchParams.get(name) ?? ""
  )

const inWorkspace = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.flatMap(
    workspaceParam,
    (workspace) => effect.pipe(Effect.provideService(CurrentWorkspace, { id: workspace as WorkspaceId }))
  )

/**
 * `POST /api/__dev/data/sweep?workspace=<id>&hours=<n>`: the workspace's exports, imports and uploaded files as if `n`
 * hours had passed, then its share of the nightly sweep (`Exports.expireIn`, `Data.purgeImports`).
 */
const DataSweep = HttpRouter.add(
  "POST",
  "/api/__dev/data/sweep",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) return notFound
    const hours = Number(yield* param("hours"))
    const by = Number.isFinite(hours) ? hours : 0
    const db = yield* Db
    yield* inWorkspace(db.scopedFor((sql) =>
      Effect.gen(function*() {
        const ago = (column: string) =>
          sql`${sql.literal(column)} = ${sql.literal(column)} - make_interval(hours => ${by})`
        yield* sql`update exports set ${ago("created_at")}, ${ago("started_at")}, ${ago("finished_at")},
                     ${ago("expires_at")}`
        yield* sql`update imports set ${ago("created_at")}, ${ago("deleted_at")}`
        yield* sql`update files set ${ago("created_at")} where kind = 'import_csv'`
      })
    ))
    const exports = yield* inWorkspace(expireIn()).pipe(Effect.provide(FilePartsR2))
    const imports = yield* inWorkspace(purgeImports())
    return HttpServerResponse.jsonUnsafe({ exports, imports })
  }).pipe(Effect.orDie, withRequestDb)
)

/** `GET /api/__dev/data/audit?workspace=<id>&subject=<id>`: the audit actions on one import or export, oldest first. */
const DataAudit = HttpRouter.add(
  "GET",
  "/api/__dev/data/audit",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) return notFound
    const subject = yield* param("subject")
    const db = yield* Db
    const rows = yield* inWorkspace(
      db.scopedFor((sql) =>
        sql<{ action: string }>`select action from audit_events where subject_id = ${subject} order by at, id`
      )
    )
    return HttpServerResponse.jsonUnsafe({ actions: rows.map((r) => r.action) })
  }).pipe(Effect.orDie, withRequestDb)
)

/**
 * `POST /api/__dev/data/finish?workspace=<id>&export=<id>&sizes=<a,b,…>`: the export's `finish` step once more, with
 * its parts' sizes, as a Workflow retrying it after it committed would. Answers the file it keeps.
 */
const DataFinish = HttpRouter.add(
  "POST",
  "/api/__dev/data/finish",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) return notFound
    const exportId = yield* param("export")
    const sizes = (yield* param("sizes")).split(",").filter((s) => s !== "").map(Number)
    const plan = { mime: "text/csv;charset=utf-8", extension: "csv", total: null, pageRows: 2000 }
    const done = yield* inWorkspace(finish({ exportId, sizes, plan })).pipe(Effect.provide(FilePartsR2))
    return HttpServerResponse.jsonUnsafe(done)
  }).pipe(Effect.orDie, withRequestDb)
)

/**
 * `GET /api/__dev/data/order-pages?workspace=<id>&rows=<n>&tie=1`: every order of the workspace through the orders
 * source, `n` to a page, each page's order numbers; with `tie`, the orders first placed within one millisecond, a
 * microsecond apart, as two orders in one millisecond would be.
 */
const DataOrderPages = HttpRouter.add(
  "GET",
  "/api/__dev/data/order-pages",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) return notFound
    const rows = Math.max(1, Number(yield* param("rows")) || 2)
    const tie = (yield* param("tie")) === "1"
    const workspaceId = yield* workspaceParam
    const db = yield* Db
    const source = ordersSourceOf(rows)
    const job: ExportJob = {
      id: "exp_dev",
      workspaceId,
      source: "orders",
      sourceRef: null,
      columns: ["number"],
      filter: null,
      storeScope: null,
      format: "csv",
      requestedBy: "system"
    }
    const pages = yield* inWorkspace(db.scopedFor((sql) =>
      Effect.gen(function*() {
        if (tie) {
          yield* sql`update orders o set placed_at = date_trunc('milliseconds', now()) + make_interval(secs => t.k / 1e6)
                     from (select id, row_number() over (order by id) as k from orders) t where t.id = o.id`
        }
        const out: Array<Array<string>> = []
        let cursor: string | null = null
        do {
          const page: ExportPage = yield* source.page(sql, job, cursor)
          // Only the first page carries the header; the others get one here, to read the same way.
          const bytes = cursor === null
            ? page.bytes
            : new Uint8Array([...new TextEncoder().encode("x\r\n"), ...page.bytes])
          const read = parseCsv(bytes, { maxRows: 100_000, maxColumns: 10, maxCellChars: 1000 })
          out.push(read.ok ? read.rows.map((r) => r[0] ?? "") : [])
          cursor = page.next
        } while (cursor !== null && out.length < 1000)
        return out
      })
    ))
    return HttpServerResponse.jsonUnsafe({ pages })
  }).pipe(Effect.orDie, withRequestDb)
)

export const DataRoutes = Layer.mergeAll(DataSweep, DataAudit, DataFinish, DataOrderPages)
