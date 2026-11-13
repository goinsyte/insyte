import { DataTools } from "@insyte/api/mcp/tools/DataTools"
import { Effect, Layer } from "effect"
import { DataV1 } from "./DataV1.ts"

export const DataMcp = DataTools.toLayer(Effect.gen(function*() {
  const read = yield* DataV1
  return {
    list_imports: () => read.imports,
    list_exports: () => read.exports,
    get_export: ({ export_id }) => read.export(export_id)
  }
})).pipe(Layer.provide(DataV1.layer))
