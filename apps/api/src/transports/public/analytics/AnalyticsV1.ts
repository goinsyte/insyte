import type { InvalidRequestV1 } from "@insyte/api/http/Errors"
import { CurrentApiKey } from "@insyte/api/http/Security"
import { AnalyticsService } from "@insyte/modules/analytics/Analytics"
import { Context, Effect, Layer } from "effect"
import { scopeMissing } from "../shared/errors.ts"
import { overviewV1 } from "./present.ts"

/* Analyse (M19.2, M19.3): month `a` against month `b`, inside the key's stores. */

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
      )
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
