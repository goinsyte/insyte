import { SheetsRpcs } from "@insyte/api/rpc/SheetsRpcs"
import { SheetsService } from "@insyte/modules/sheets/Sheets"
import { Effect } from "effect"

export const SheetsHandlers = SheetsRpcs.toLayer(Effect.gen(function*() {
  const sheets = yield* SheetsService
  return SheetsRpcs.of({
    "Sheets.list": (input) => sheets.list(input),
    "Sheets.counts": () => sheets.counts,
    "Sheets.folders": () => sheets.folders,
    "Sheets.get": (input) => sheets.get(input),
    "Sheets.create": (input) => sheets.create(input),
    "Sheets.saveTabs": (input) => sheets.saveTabs(input),
    "Sheets.update": (input) => sheets.update(input),
    "Sheets.share": (input) => sheets.share(input),
    "Sheets.duplicate": (input) => sheets.duplicate(input),
    "Sheets.remove": (input) => sheets.remove(input),
    "Sheets.restore": (input) => sheets.restore(input),
    "Sheets.markOpened": (input) => sheets.markOpened(input),
    "Sheets.createFolder": (input) => sheets.createFolder(input),
    "Sheets.export": (input) => sheets.export(input)
  })
}))
