import { Db } from "@insyte/database/Db"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import { compileFilter } from "../../shared/tables/FilterSql.ts"
import * as Exports from "../../shared/use-cases/Exports.ts"
import {
  type ExportIdInput,
  ExportList,
  ExportNotFound,
  type ExportsListInput,
  ImportNotReady,
  ORDER_COLUMNS,
  type RequestExportInput,
  UnknownColumn
} from "../domain/Data.ts"
import { EXPORT_SELECT, exportOf, type ExportRecord, importRecord } from "./queries.ts"
import { ORDER_FILTER } from "./sources.ts"

/*
 * Exporteren (M14 step 5; widgets/02 "/data?view=export"): Data · Bekijken and Data · Exporteren (`data.export`), and for
 * Bestellingen also Bestellingen · Bekijken, as the rows are orders. The columns and the filter are checked here, so a
 * bad one is refused at once rather than failing in the Workflow; the file is then written by the `ExportWorkflow`
 * (`Exports.request`) and downloads for seven days, for the member who asked.
 */

const KNOWN = new Set<string>(ORDER_COLUMNS)

const today = () => new Date().toISOString().slice(0, 10)

export const request = Effect.fn("Data.export")(function*(input: RequestExportInput) {
  yield* Policy.require("data", 1)
  yield* Policy.requireAction("data.export")
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  const id = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      if (input.source === "orders") {
        yield* Policy.require("orders", 1)
        const unknown = input.columns.find((c) => !KNOWN.has(c))
        if (unknown !== undefined) return yield* new UnknownColumn({ column: unknown })
        yield* compileFilter(sql, input.filter, ORDER_FILTER)
        return yield* Exports.request(sql, {
          source: "orders",
          columns: input.columns,
          filter: input.filter,
          fileName: `bestellingen-${today()}`
        })
      }
      const record = yield* importRecord(sql, input.source.import)
      if (record.state !== "done") return yield* new ImportNotReady({ id: record.id, state: record.state })
      const bad = input.columns.find((c) => {
        const i = Number(c)
        return !/^\d+$/.test(c) || i >= record.header.length
      })
      if (bad !== undefined) return yield* new UnknownColumn({ column: bad })
      return yield* Exports.request(sql, {
        source: "import",
        sourceRef: record.id,
        columns: input.columns,
        fileName: `${record.fileName.replace(/\.(csv|tsv|txt)$/i, "")}-export`
      })
    })
  )
  return yield* get({ exportId: id }).pipe(
    Effect.catchTag("ExportNotFound", Effect.die),
    Effect.provideService(CurrentPrincipal, principal)
  )
})

/** The exports asked for, newest first: the member's own (the console), or the workspace's (`/v1`). */
export const list = Effect.fn("Data.exports.list")(function*(input: ExportsListInput) {
  yield* Policy.require("data", 1)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  const rows = yield* db.scoped((sql) =>
    sql<ExportRecord>`
      select ${sql.literal(EXPORT_SELECT)} from exports e left join files f on f.id = e.file_id
      where ${input.mine === false ? sql`true` : sql`e.requested_by = ${principal.id}`}
      order by e.created_at desc, e.id desc limit ${input.limit ?? 20}`
  )
  return new ExportList({ rows: rows.map((r) => exportOf(r, principal.id)) })
})

export const get = Effect.fn("Data.exports.get")(function*(input: ExportIdInput) {
  yield* Policy.require("data", 1)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  const [row] = yield* db.scoped((sql) =>
    sql<ExportRecord>`
      select ${sql.literal(EXPORT_SELECT)} from exports e left join files f on f.id = e.file_id
      where e.id = ${input.exportId}`
  )
  if (row === undefined) return yield* new ExportNotFound({ id: input.exportId })
  return exportOf(row, principal.id)
})
