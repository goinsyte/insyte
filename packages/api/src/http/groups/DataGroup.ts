import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { NotFoundV1, ScopeMissingV1 } from "../Errors.ts"
import { ById } from "../Requests.ts"

/*
 * The Data hub (M14 step 5): the workspace's CSV imports and its exports, as metadata. A key reads them with
 * `data.read`; asking for an export and downloading its file stay in the console, for the member who asked.
 */

export const ImportV1 = Schema.Struct({
  id: Schema.String,
  file_name: Schema.String,
  header: Schema.Array(Schema.String).annotate({ description: "The file's first row, the column names." }),
  row_count: Schema.Int,
  state: Schema.Literals(["uploaded", "parsing", "parsed", "failed", "done"]).annotate({
    description:
      "`done` once a member imported it; `parsed` while it waits for that; `failed` when it could not be read."
  }),
  error: Schema.NullOr(
    Schema.Literals(["not_csv", "empty", "too_large", "too_wide", "cell_too_long", "parse_failed", "unreadable"])
  ).annotate({
    description: "Why it could not be read: not text, no rows, over 50,000 rows, a row over 100 columns, a cell over "
      + "32,767 characters, a quote that never closes, or the read gave up."
  }),
  created_by: Schema.String,
  created_at: Schema.String,
  committed_at: Schema.NullOr(Schema.String)
}).annotate({ identifier: "Import" })

export const ImportListV1 = Schema.Struct({ data: Schema.Array(ImportV1) }).annotate({ identifier: "ImportList" })

export const ExportV1 = Schema.Struct({
  id: Schema.String,
  source: Schema.String.annotate({
    description: "What it was written from: `orders`, or `import` (an imported file)."
  }),
  source_id: Schema.NullOr(Schema.String).annotate({ description: "The import's id, for an export of one." }),
  file_name: Schema.String,
  state: Schema.Literals(["queued", "running", "ready", "failed", "expired"]),
  rows_written: Schema.Int,
  rows_total: Schema.NullOr(Schema.Int),
  failure: Schema.NullOr(Schema.Literals(["too_many_rows", "failed"])).annotate({
    description: "Why a `failed` export failed: `too_many_rows` when it would hold more than 1,000,000 rows."
  }),
  requested_by: Schema.String,
  created_at: Schema.String,
  finished_at: Schema.NullOr(Schema.String),
  expires_at: Schema.NullOr(Schema.String).annotate({
    description: "When the file is removed: seven days after it was written."
  })
}).annotate({ identifier: "Export" })

export const ExportListV1 = Schema.Struct({ data: Schema.Array(ExportV1) }).annotate({ identifier: "ExportList" })

export class DataGroup extends HttpApiGroup.make("data")
  .add(
    HttpApiEndpoint.get("imports", "/imports", {
      success: ImportListV1,
      error: [ScopeMissingV1]
    }).annotate(
      OpenApi.Description,
      "Data: the workspace's CSV imports not removed, newest first, at most 200. Needs `data.read`."
    ),
    HttpApiEndpoint.get("exports", "/exports", {
      success: ExportListV1,
      error: [ScopeMissingV1]
    }).annotate(
      OpenApi.Description,
      "Data: the exports the workspace's members asked for, newest first, at most 100. The file itself downloads only in the console, for the member who asked. Needs `data.read`."
    ),
    HttpApiEndpoint.get("export", "/exports/:id", {
      params: ById,
      success: ExportV1,
      error: [ScopeMissingV1, NotFoundV1]
    }).annotate(OpenApi.Description, "One export and how far it is. Needs `data.read`.")
  )
  .annotate(OpenApi.Title, "Data")
{}
