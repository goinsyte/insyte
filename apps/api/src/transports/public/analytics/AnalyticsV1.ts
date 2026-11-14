import type { InvalidRequestV1 } from "@insyte/api/http/Errors"
import { CurrentApiKey } from "@insyte/api/http/Security"
import { AnalyticsService } from "@insyte/modules/analytics/Analytics"
import { Context, Effect, Layer } from "effect"
import { badQuery, scopeMissing } from "../shared/errors.ts"
import { figuresV1, overviewV1 } from "./present.ts"

/* Analyse (M19.2, M19.3): month `a` against month `b`, and INSYTE()'s figures per month, inside the key's stores. */

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const METRIC = /^[a-z_]{1,60}$/

const listOf = (
  text: string
) => [...new Set(text.split(",").map((x) => x.trim().toLowerCase()).filter((x) => x !== ""))]

const make = Effect.gen(function*() {
  const analytics = yield* AnalyticsService
  return {
    analyticsOverview: (a: string, b: string) =>
      analytics.overview({ a, b }).pipe(
        Effect.map(overviewV1),
        Effect.catchTags({
          Forbidden: scopeMissing,
          Invalid: () =>
            Effect.flatMap(CurrentApiKey, (key) =>
              Effect.fail<InvalidRequestV1>({
                error: {
                  code: "InvalidRequestV1",
                  message: "Both months must have begun.",
                  request_id: key.requestId,
                  field: "a"
                }
              }))
        })
      ),
    figures: (metrics: string, months?: string) => {
      const named = listOf(metrics)
      if (named.length === 0 || named.length > 20 || named.some((m) => !METRIC.test(m))) {
        return badQuery("metrics", "Name one to 20 figures, separated by commas, as INSYTE() names them.")
      }
      const wanted = months === undefined ? [] : listOf(months)
      if (months !== undefined && (wanted.length === 0 || wanted.length > 24 || wanted.some((m) => !MONTH.test(m)))) {
        return badQuery("months", "Name one to 24 months, YYYY-MM, separated by commas.")
      }
      const requests = named.flatMap((metric) =>
        wanted.length === 0 ? [{ metric }] : wanted.map((month) => ({ metric, month }))
      )
      return analytics.lookup({ requests }).pipe(Effect.map(figuresV1), Effect.catchTag("Forbidden", scopeMissing))
    }
  }
})

/**
 * Analyse, as the key the door let in.
 *
 * @effect-expect-leaking CurrentPrincipal CurrentApiKey Db
 */
export class AnalyticsV1 extends Context.Service<AnalyticsV1, Effect.Success<typeof make>>()(
  "api-worker/AnalyticsV1"
) {
  static readonly layer = Layer.effect(this, make).pipe(Layer.provide(AnalyticsService.layer))
}
