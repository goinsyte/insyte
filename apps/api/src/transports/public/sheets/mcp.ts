import { SheetsTools } from "@insyte/api/mcp/tools/SheetsTools"
import { Effect, Layer } from "effect"
import { SheetsV1 } from "./SheetsV1.ts"

export const SheetsMcp = SheetsTools.toLayer(Effect.gen(function*() {
  const read = yield* SheetsV1
  return {
    list_sheets: () => read.sheets,
    get_sheet: ({ sheet_id }) => read.sheet(sheet_id)
  }
})).pipe(Layer.provide(SheetsV1.layer))
