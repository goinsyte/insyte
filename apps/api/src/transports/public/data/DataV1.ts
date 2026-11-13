import { DataService } from "@insyte/modules/data/Data"
import { Context, Effect, Layer } from "effect"
import { notFound, scopeMissing } from "../shared/errors.ts"
import { exportListV1, exportV1, importListV1 } from "./present.ts"

/* The Data hub (M14 step 5): the workspace's imports and exports, read with `data.read`. */

const make = Effect.gen(function*() {
  const data = yield* DataService
  return {
    imports: data.imports.list.pipe(
      Effect.map(importListV1),
      Effect.catchTag("Forbidden", scopeMissing)
    ),
    exports: data.exports.list({ mine: false, limit: 100 }).pipe(
      Effect.map(exportListV1),
      Effect.catchTag("Forbidden", scopeMissing)
    ),
    export: (id: string) =>
      data.exports.get({ exportId: id }).pipe(
        Effect.map(exportV1),
        Effect.catchTags({ Forbidden: scopeMissing, ExportNotFound: () => notFound({ entity: "export" }) })
      )
  }
})

/**
 * The Data hub, as the key the door let in.
 *
 * @effect-expect-leaking CurrentPrincipal CurrentApiKey Db
 */
export class DataV1 extends Context.Service<DataV1, Effect.Success<typeof make>>()("api-worker/DataV1") {
  static readonly layer = Layer.effect(this, make).pipe(Layer.provide(DataService.layer))
}
