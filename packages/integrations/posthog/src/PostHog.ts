import { ProductAnalytics, type ProductEvent } from "@insyte/modules/shared/domain/ProductAnalytics"
import { Config, Effect, Layer, Redacted } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"

/*
 * The `ProductAnalytics` port over PostHog's capture API (17 §5), EU cloud by default. One POST per event, with the
 * person's id and the workspace as a group (`$groups`); never an email or a name. A capture that fails is logged and
 * answers success: analytics never fails the write that caused it, and the outbox's sink bookkeeping keeps it once-only.
 */

export const PostHogAnalytics = Layer.effect(
  ProductAnalytics,
  Effect.gen(function*() {
    const apiKey = yield* Config.Redacted("POSTHOG_API_KEY")
    const host = yield* Config.String("POSTHOG_HOST").pipe(Config.withDefault("https://eu.i.posthog.com"))
    const client = yield* HttpClient.HttpClient
    return ProductAnalytics.of({
      capture: Effect.fn("PostHog.capture")(function*(event: ProductEvent) {
        yield* client.execute(
          HttpClientRequest.post(`${host}/i/v0/e/`).pipe(
            HttpClientRequest.bodyJsonUnsafe({
              api_key: Redacted.value(apiKey),
              event: event.event,
              distinct_id: event.distinctId,
              properties: { ...event.properties, ...(event.groups === undefined ? {} : { $groups: event.groups }) }
            })
          )
        ).pipe(
          Effect.flatMap(HttpClientResponse.filterStatusOk),
          Effect.timeout("5 seconds"),
          Effect.catch((error) => Effect.logWarning(`posthog capture ${event.event} failed: ${String(error)}`))
        )
      })
    })
  })
)
