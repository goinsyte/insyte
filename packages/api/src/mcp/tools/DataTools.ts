import { Schema } from "effect"
import { Tool, Toolkit } from "effect/ai"
import { NotFoundV1, ScopeMissingV1 } from "../../http/Errors.ts"
import { ExportListV1, ExportV1, ImportListV1 } from "../../http/groups/DataGroup.ts"
import { asKey } from "../Shared.ts"

/* The Data hub (M14 step 5): the workspace's CSV imports and exports, as metadata. */

export const ListImports = Tool.make("list_imports", {
  description:
    "Data: the workspace's CSV imports not removed, newest first, with their column names, row count and state (done once imported). Needs data.read.",
  success: ImportListV1,
  failure: ScopeMissingV1,
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const ListExports = Tool.make("list_exports", {
  description:
    "Data: the exports the workspace's members asked for, newest first, with their state and rows written. The file downloads only in the console, for the member who asked. Needs data.read.",
  success: ExportListV1,
  failure: ScopeMissingV1,
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const GetExport = Tool.make("get_export", {
  description: "One export and how far it is (queued, running, ready, failed, expired). Needs data.read.",
  parameters: Schema.Struct({ export_id: Schema.String.annotate({ description: "The export's id (exp_…)." }) }),
  success: ExportV1,
  failure: Schema.Union([ScopeMissingV1, NotFoundV1]),
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const DataTools = Toolkit.make(
  ListImports,
  ListExports,
  GetExport
)
