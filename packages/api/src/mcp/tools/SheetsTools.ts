import { Schema } from "effect"
import { Tool, Toolkit } from "effect/ai"
import { NotFoundV1, ScopeMissingV1 } from "../../http/Errors.ts"
import { SheetListV1, SheetV1 } from "../../http/groups/SheetsGroup.ts"
import { asKey } from "../Shared.ts"

/* Rekenbladen (M19.3): the key's member's sheets, as typed. */

export const ListSheets = Tool.make("list_sheets", {
  description:
    "Rekenbladen: the sheets of the member who made this key (their own and those shared with them), newest change first, with whether each reads Insyte's figures (linked). Needs data.read.",
  success: SheetListV1,
  failure: ScopeMissingV1,
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const GetSheet = Tool.make("get_sheet", {
  description:
    "One sheet with every tab as typed: cells by address (A1…L40) with the value or formula written, formats and column widths. Formulas are not evaluated here; INSYTE(\"metric\"; \"month\") reads a figure when the sheet is opened. Needs data.read.",
  parameters: Schema.Struct({ sheet_id: Schema.String.annotate({ description: "The sheet's id (sh_…)." }) }),
  success: SheetV1,
  failure: Schema.Union([ScopeMissingV1, NotFoundV1]),
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const SheetsTools = Toolkit.make(
  ListSheets,
  GetSheet
)
