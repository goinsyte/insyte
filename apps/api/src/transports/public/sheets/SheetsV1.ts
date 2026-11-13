import { SheetsService } from "@insyte/modules/sheets/Sheets"
import { Context, Effect, Layer } from "effect"
import { notFound, scopeMissing } from "../shared/errors.ts"
import { sheetListV1, sheetV1 } from "./present.ts"

/* Rekenbladen (M19.2, M19.3): the sheets of the member who made the key, and one with every tab as typed. */

const make = Effect.gen(function*() {
  const sheets = yield* SheetsService
  return {
    sheets: sheets.list({}).pipe(
      Effect.map(sheetListV1),
      Effect.catchTag("Forbidden", scopeMissing)
    ),
    sheet: (id: string) =>
      Effect.gen(function*() {
        const d = yield* sheets.get({ id })
        // The detail carries no creation time; the list row does.
        const row = (yield* sheets.list({})).rows.find((r) => r.id === id)
        return sheetV1(d, row)
      }).pipe(
        Effect.catchTags({ Forbidden: scopeMissing, SheetNotFound: () => notFound({ entity: "sheet" }) })
      )
  }
})

/**
 * Rekenbladen, as the key the door let in.
 *
 * @effect-expect-leaking CurrentPrincipal CurrentApiKey Db
 */
export class SheetsV1 extends Context.Service<SheetsV1, Effect.Success<typeof make>>()("api-worker/SheetsV1") {
  static readonly layer = Layer.effect(this, make).pipe(Layer.provide(SheetsService.layer))
}
