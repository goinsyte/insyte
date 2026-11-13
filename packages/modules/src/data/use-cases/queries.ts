import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { ExportRow, ImportFile, ImportNotFound } from "../domain/Data.ts"

/* The Data hub's reads shared by its use cases: an import and an export as the transports show them. */

export interface ImportRecord {
  readonly id: string
  readonly fileId: string
  readonly fileName: string
  readonly header: ReadonlyArray<string>
  readonly rowCount: number
  readonly state: ImportFile["state"]
  readonly error: ImportFile["error"]
  readonly errorLine: number | null
  readonly createdAt: Date
  readonly createdBy: string
  readonly committedAt: Date | null
  readonly deleted: boolean
}

export const IMPORT_SELECT = `i.id, i.file_id, i.file_name, i.header, i.row_count, i.state, i.error, i.error_line,
  i.created_at, i.created_by, i.committed_at, i.deleted_at is not null as deleted`

export const importOf = (r: ImportRecord) =>
  new ImportFile({
    id: r.id,
    fileName: r.fileName,
    header: r.header,
    rowCount: r.rowCount,
    columnCount: r.header.length,
    state: r.state,
    error: r.error,
    errorLine: r.errorLine,
    createdAt: r.createdAt.getTime(),
    createdBy: r.createdBy,
    committedAt: r.committedAt === null ? null : r.committedAt.getTime()
  })

/** An import that is not removed (or, with `removed`, one that is), locked when asked. */
export const importRecord = Effect.fn("Data.importRecord")(function*(
  sql: SqlClient.SqlClient,
  id: string,
  options: { readonly lock?: boolean; readonly removed?: boolean } = {}
) {
  const [row] = yield* sql<ImportRecord>`
    select ${sql.literal(IMPORT_SELECT)} from imports i
    where i.id = ${id} and ${options.removed === true ? sql`i.deleted_at is not null` : sql`i.deleted_at is null`}
    ${sql.literal(options.lock === true ? "for update" : "")}`
  if (row === undefined) return yield* new ImportNotFound({ id })
  return row
})

export interface ExportRecord {
  readonly id: string
  readonly source: string
  readonly sourceRef: string | null
  readonly fileName: string
  readonly state: ExportRow["state"]
  readonly rowsWritten: number
  readonly rowsTotal: number | null
  readonly fileId: string | null
  readonly fileFull: string | null
  readonly requestedBy: string
  readonly createdAt: Date
  readonly finishedAt: Date | null
  readonly expiresAt: Date | null
  readonly error: string | null
}

export const EXPORT_SELECT = `e.id, e.source, e.source_ref, e.file_name, e.state, e.rows_written, e.rows_total,
  e.file_id, f.name as file_full, e.requested_by, e.created_at, e.finished_at, e.expires_at, e.error`

/** An export as the console shows it; its link only for the member who asked, while it lasts. */
export const exportOf = (r: ExportRecord, me: string) =>
  new ExportRow({
    id: r.id,
    source: r.source,
    sourceRef: r.sourceRef,
    fileName: r.fileFull ?? r.fileName,
    state: r.state,
    rowsWritten: r.rowsWritten,
    rowsTotal: r.rowsTotal,
    fileUrl: r.state === "ready" && r.fileId !== null && r.requestedBy === me ? `/api/files/${r.fileId}` : null,
    failure: r.state !== "failed" ? null : r.error === "too_many_rows" ? "too_many_rows" : "failed",
    requestedBy: r.requestedBy,
    createdAt: r.createdAt.getTime(),
    finishedAt: r.finishedAt === null ? null : r.finishedAt.getTime(),
    expiresAt: r.expiresAt === null ? null : r.expiresAt.getTime()
  })
