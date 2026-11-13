import { CostsService } from "@insyte/modules/costs/Costs"
import { Context, Effect, Layer } from "effect"
import { badQuery, scopeMissing } from "../shared/errors.ts"
import { costFiguresV1, costsV1 } from "./present.ts"

/* Kosten (M13 step 5, M19.2, M19.3): the cost lines over a range of months, and the figures of the months named. */

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

const make = Effect.gen(function*() {
  const costs = yield* CostsService
  return {
    costs: (from?: string, to?: string) =>
      costs.list({ ...(from === undefined ? {} : { from }), ...(to === undefined ? {} : { to }) }).pipe(
        Effect.map(costsV1),
        Effect.catchTags({
          Forbidden: scopeMissing,
          Invalid: () => badQuery("from", "The range runs from `from` to `to`, at most 36 months.")
        })
      ),
    costFigures: (months: string) => {
      const list = [...new Set(months.split(",").map((m) => m.trim()).filter((m) => m !== ""))]
      if (list.length === 0 || list.length > 36 || list.some((m) => !MONTH.test(m))) {
        return badQuery("months", "Name one to 36 months, YYYY-MM, separated by commas.")
      }
      return costs.figures({ months: list }).pipe(
        Effect.map(costFiguresV1),
        Effect.catchTag("Forbidden", scopeMissing)
      )
    }
  }
})

/**
 * Kosten, as the key the door let in.
 *
 * @effect-expect-leaking CurrentPrincipal CurrentApiKey Db
 */
export class CostsV1 extends Context.Service<CostsV1, Effect.Success<typeof make>>()("api-worker/CostsV1") {
  static readonly layer = Layer.effect(this, make).pipe(Layer.provide(CostsService.layer))
}
