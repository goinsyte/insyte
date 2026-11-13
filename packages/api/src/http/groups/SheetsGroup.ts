import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { NotFoundV1, ScopeMissingV1 } from "../Errors.ts"
import { ById } from "../Requests.ts"

/* Rekenbladen: the key's member's sheets, and one with every tab as typed. */

const SheetCellV1 = Schema.Struct({
  v: Schema.String.annotate({ description: "The cell as typed: a value, or a formula starting with `=`." }),
  fmt: Schema.optional(Schema.Literals(["general", "money", "percent", "number", "integer"])),
  bold: Schema.optional(Schema.Boolean),
  align: Schema.optional(Schema.Literals(["left", "center", "right"]))
})

const SheetTabV1 = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  cells: Schema.Record(Schema.String, SheetCellV1).annotate({ description: "Address (`A1`…`L40`) → cell." }),
  widths: Schema.Record(Schema.String, Schema.Int).annotate({ description: "Column (`A`…`L`) → width in pixels." })
})

export const SheetSummaryV1 = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  folder_id: Schema.NullOr(Schema.String),
  owner_id: Schema.String.annotate({ description: "The member who made it." }),
  shared_with: Schema.Array(Schema.String).annotate({ description: "The members it is shared with." }),
  pinned: Schema.Boolean,
  archived: Schema.Boolean,
  linked: Schema.Boolean.annotate({ description: "Whether any cell reads one of Insyte's figures (INSYTE())." }),
  created_at: Schema.String,
  updated_at: Schema.String
}).annotate({ identifier: "SheetSummary" })

export const SheetListV1 = Schema.Struct({ data: Schema.Array(SheetSummaryV1) }).annotate({ identifier: "SheetList" })

export const SheetV1 = Schema.Struct({
  ...SheetSummaryV1.fields,
  folder_name: Schema.NullOr(Schema.String),
  version: Schema.Int.annotate({ description: "The version the tabs are at; every save of the tabs raises it." }),
  tabs: Schema.Array(SheetTabV1).annotate({
    description:
      "Every tab as typed. Nothing computed is kept: a formula is the text the member wrote, and an INSYTE() figure is read when the sheet is opened."
  })
}).annotate({ identifier: "Sheet" })

export class SheetsGroup extends HttpApiGroup.make("sheets")
  .add(
    HttpApiEndpoint.get("list", "/sheets", {
      success: SheetListV1,
      error: [ScopeMissingV1]
    }).annotate(
      OpenApi.Description,
      "Rekenbladen: the sheets of the member who made the key (their own and those shared with them), newest change first, archived ones included. Needs `data.read`."
    ),
    HttpApiEndpoint.get("get", "/sheets/:id", {
      params: ById,
      success: SheetV1,
      error: [ScopeMissingV1, NotFoundV1]
    }).annotate(
      OpenApi.Description,
      "One sheet with every tab as typed (cells, formats, column widths). Needs `data.read`; a sheet the key's member cannot open is not found."
    )
  )
  .annotate(OpenApi.Title, "Sheets")
{}
