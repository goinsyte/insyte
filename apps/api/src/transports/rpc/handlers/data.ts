import { DataRpcs } from "@insyte/api/rpc/DataRpcs"
import { DataService } from "@insyte/modules/data/Data"
import { Effect } from "effect"

export const DataHandlers = DataRpcs.toLayer(Effect.gen(function*() {
  const data = yield* DataService
  return DataRpcs.of({
    "Data.overview": () => data.overview,
    "Data.imports.list": () => data.imports.list,
    "Data.imports.upload": (input) => data.imports.upload(input),
    "Data.imports.preview": (input) => data.imports.preview(input),
    "Data.imports.rows": (input) => data.imports.rows(input),
    "Data.imports.commit": (input) => data.imports.commit(input),
    "Data.imports.remove": (input) => data.imports.remove(input),
    "Data.imports.restore": (input) => data.imports.restore(input),
    "Data.export": (input) => data.export(input),
    "Data.exports.list": (input) => data.exports.list(input),
    "Data.exports.get": (input) => data.exports.get(input)
  })
}))
