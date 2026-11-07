import { Effect, Option } from "effect"
import { HttpRouter, HttpServerResponse } from "effect/http"
import { AppInfo } from "../../platform/Bindings.ts"

/**
 * Every request's logs carry `trace_id`, `environment` and `version`, and every response carries `Insyte-Request-Id`:
 * the trace id, the string to paste into Sentry's search (17 §1).
 */
export const RequestContext = HttpRouter.middleware(
  Effect.gen(function*() {
    const { environment, version } = yield* AppInfo
    return (httpEffect) =>
      Effect.gen(function*() {
        const traceId = Option.match(yield* Effect.option(Effect.currentSpan), {
          onNone: () => "",
          onSome: (span) => span.traceId
        })
        const response = yield* httpEffect.pipe(Effect.annotateLogs({ trace_id: traceId, environment, version }))
        return traceId === "" ? response : HttpServerResponse.setHeader(response, "insyte-request-id", traceId)
      })
  }),
  { global: true }
)
