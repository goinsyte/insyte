import { Schema } from "effect"
import { FilterGroup } from "../../shared/domain/Filter.ts"
import { UndoTicket } from "../../shared/domain/Undo.ts"

/*
 * The Data hub as the console, `/v1` and MCP read and change it (M14 step 5; widgets/02 Part C "/data", api.md
 * §2.30): the hub's counts, CSV imports (uploaded, parsed on the jobs Worker, previewed, imported, removed with undo)
 * and exports (asked for, written by the `ExportWorkflow`, downloaded for seven days). Times are epoch milliseconds.
 */

/** The largest CSV the hub takes, and the most rows and columns it keeps of one. */
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024
export const MAX_IMPORT_ROWS = 50_000
export const MAX_IMPORT_COLUMNS = 100
/** The rows a preview shows. */
export const PREVIEW_ROWS = 8

export class DataOverview extends Schema.Class<DataOverview>("data/DataOverview")({
  /** Every order in the reader's stores, drafts aside. */
  orders: Schema.Int,
  /** The rows of every imported file (committed, not removed). */
  importedRows: Schema.Int,
  /** How many files are imported. */
  imports: Schema.Int,
  stores: Schema.Struct({ connected: Schema.Int, total: Schema.Int }),
  /** The workspace's external accounts by provider, the newest state of each. */
  connections: Schema.Array(Schema.Struct({
    provider: Schema.String,
    status: Schema.String,
    lastSyncedAt: Schema.NullOr(Schema.Finite)
  }))
}) {}

export const ImportState = Schema.Literals(["uploaded", "parsing", "parsed", "failed", "done"])
export type ImportState = typeof ImportState.Type

/** Why a file could not be read: not text, no rows under its header, more rows than the hub keeps, a broken line. */
export const ImportError = Schema.Literals(["not_csv", "empty", "too_large", "parse_failed"])
export type ImportError = typeof ImportError.Type

export class ImportFile extends Schema.Class<ImportFile>("data/ImportFile")({
  id: Schema.String,
  fileName: Schema.String,
  /** The first row, trimmed; a blank name shows as "Kolom N". */
  header: Schema.Array(Schema.String),
  rowCount: Schema.Int,
  columnCount: Schema.Int,
  state: ImportState,
  error: Schema.NullOr(ImportError),
  /** The line a `parse_failed` file broke on, from 1. */
  errorLine: Schema.NullOr(Schema.Int),
  createdAt: Schema.Finite,
  createdBy: Schema.String,
  committedAt: Schema.NullOr(Schema.Finite)
}) {}

/** The imports still being read or waiting to be imported, and those imported, newest first. */
export class ImportList extends Schema.Class<ImportList>("data/ImportList")({
  rows: Schema.Array(ImportFile)
}) {}

/** An uploaded file as the drop zone shows it once read: the file and its first rows. */
export class ImportPreview extends Schema.Class<ImportPreview>("data/ImportPreview")({
  import: ImportFile,
  firstRows: Schema.Array(Schema.Array(Schema.String))
}) {}

/** A page of an imported file's rows, `n` from 1, as Tabel shows them. */
export class ImportRows extends Schema.Class<ImportRows>("data/ImportRows")({
  rows: Schema.Array(Schema.Array(Schema.String)),
  /** Every row under the search. */
  total: Schema.Int,
  /** The row number to read after, or `null` after the last page. */
  next: Schema.NullOr(Schema.Int)
}) {}

/** What a change to an import did, and the token that puts it back. */
export class ImportChange extends Schema.Class<ImportChange>("data/ImportChange")({
  import: ImportFile,
  undo: Schema.NullOr(UndoTicket)
}) {}

export const UploadImportInput = Schema.Struct({ fileId: Schema.String })
export type UploadImportInput = typeof UploadImportInput.Type

export const ImportIdInput = Schema.Struct({ importId: Schema.String })
export type ImportIdInput = typeof ImportIdInput.Type

export const ImportRowsInput = Schema.Struct({
  importId: Schema.String,
  q: Schema.optional(Schema.String.check(Schema.isMaxLength(200))),
  /** The last row number of the page before. */
  after: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 2000 })))
})
export type ImportRowsInput = typeof ImportRowsInput.Type

/** The order columns an export offers, in the hub's order (widgets/02 "Kolommen"). */
export const ORDER_COLUMNS = [
  "number",
  "customer",
  "email",
  "total",
  "currency",
  "status",
  "payment",
  "fulfillment",
  "items",
  "tracking",
  "placed"
] as const
export type OrderColumn = (typeof ORDER_COLUMNS)[number]

/** Bestellingen, or an imported file. */
export const ExportSourceInput = Schema.Union([
  Schema.Literal("orders"),
  Schema.Struct({ import: Schema.String })
])
export type ExportSourceInput = typeof ExportSourceInput.Type

export const RequestExportInput = Schema.Struct({
  source: ExportSourceInput,
  /** An order column's id, or an imported file's column by its index ("0", "1", …). Order is kept. */
  columns: Schema.Array(Schema.String.check(Schema.isMaxLength(40))).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(MAX_IMPORT_COLUMNS)
  ),
  /** Bestellingen only: the rows the list's filter keeps. */
  filter: Schema.optional(FilterGroup)
})
export type RequestExportInput = typeof RequestExportInput.Type

export const ExportState = Schema.Literals(["queued", "running", "ready", "failed", "expired"])
export type ExportState = typeof ExportState.Type

export class ExportRow extends Schema.Class<ExportRow>("data/ExportRow")({
  id: Schema.String,
  /** The registry's source: `orders`, `import`, or another slice's. */
  source: Schema.String,
  sourceRef: Schema.NullOr(Schema.String),
  /** The name it downloads as, with its extension once it is written. */
  fileName: Schema.String,
  state: ExportState,
  rowsWritten: Schema.Int,
  rowsTotal: Schema.NullOr(Schema.Int),
  /** Where the file downloads (`/api/files/:id`) while it is ready, for the member who asked. */
  fileUrl: Schema.NullOr(Schema.String),
  requestedBy: Schema.String,
  createdAt: Schema.Finite,
  finishedAt: Schema.NullOr(Schema.Finite),
  expiresAt: Schema.NullOr(Schema.Finite)
}) {}

export class ExportList extends Schema.Class<ExportList>("data/ExportList")({
  rows: Schema.Array(ExportRow)
}) {}

export const ExportIdInput = Schema.Struct({ exportId: Schema.String })
export type ExportIdInput = typeof ExportIdInput.Type

export const ExportsListInput = Schema.Struct({
  /** The requester's own (the console), or every export in the workspace (`/v1`). */
  mine: Schema.optional(Schema.Boolean),
  limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 })))
})
export type ExportsListInput = typeof ExportsListInput.Type

/** No such import (or removed): the same answer either way. */
export class ImportNotFound extends Schema.TaggedError<ImportNotFound>()("ImportNotFound", { id: Schema.String }) {}

/** The import is not in the state the command needs (still being read, failed, already imported). */
export class ImportNotReady extends Schema.TaggedError<ImportNotReady>()("ImportNotReady", {
  id: Schema.String,
  state: ImportState
}) {}

/** The uploaded file is not one this member can import (gone, someone else's, not a CSV upload, already used). */
export class UploadNotFound extends Schema.TaggedError<UploadNotFound>()("UploadNotFound", { id: Schema.String }) {}

export class ExportNotFound extends Schema.TaggedError<ExportNotFound>()("ExportNotFound", { id: Schema.String }) {}

/** A column the source does not have. */
export class UnknownColumn extends Schema.TaggedError<UnknownColumn>()("UnknownColumn", { column: Schema.String }) {}
