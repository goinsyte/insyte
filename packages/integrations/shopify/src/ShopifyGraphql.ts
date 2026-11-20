import {
  ShopifyGraphql,
  ShopifyRefused,
  ShopifyThrottled,
  type ThrottleStatus
} from "@insyte/modules/stores/domain/Ports"
import { Config, Effect, Layer, Redacted, Schema } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"

/*
 * The Admin GraphQL API (M6.3; integrations.md §2): one query at a time (a webhook's object, the reconcile sweep's
 * pages, the first import's pages, the writes). Every answer carries the bucket (`extensions.cost.throttleStatus`) for
 * the gate; a `THROTTLED` answer says how long to wait. No bulk operations: Shopify gives an app access to them only
 * with an IP allowlist, and a Worker has no fixed address.
 */

const Throttle = Schema.Struct({
  maximumAvailable: Schema.Finite,
  currentlyAvailable: Schema.Finite,
  restoreRate: Schema.Finite
})

const Answer = Schema.Struct({
  data: Schema.optional(Schema.NullOr(Schema.Unknown)),
  errors: Schema.optional(Schema.Array(Schema.Struct({
    message: Schema.String,
    extensions: Schema.optional(Schema.Struct({
      code: Schema.optional(Schema.String),
      requiredAccess: Schema.optional(Schema.String)
    }))
  }))),
  extensions: Schema.optional(Schema.Struct({
    cost: Schema.optional(
      Schema.Struct({ requestedQueryCost: Schema.optional(Schema.Finite), throttleStatus: Throttle })
    )
  }))
})

/** "Required access: `write_gift_cards` access scope." → `write_gift_cards`. */
export const scopeIn = (text: string): string | undefined => /\b((?:read|write)_[a-z_]+)\b/.exec(text)?.[1]

export const ShopifyGraphqlLive = Layer.effect(
  ShopifyGraphql,
  Effect.gen(function*() {
    const version = yield* Config.String("SHOPIFY_API_VERSION").pipe(Config.withDefault("2026-10"))
    const http = yield* HttpClient.HttpClient

    const graphql = Effect.fn("Shopify.graphql")(function*(
      shop: string,
      token: Redacted.Redacted<string>,
      query: string,
      variables: Record<string, unknown>
    ) {
      const response = yield* http.execute(
        HttpClientRequest.post(`https://${shop}/admin/api/${version}/graphql.json`).pipe(
          HttpClientRequest.setHeader("x-shopify-access-token", Redacted.value(token)),
          HttpClientRequest.bodyJsonUnsafe({ query, variables })
        )
      ).pipe(
        Effect.timeout("20 seconds"),
        Effect.mapError((error) => new ShopifyRefused({ status: 0, reason: `graphql failed: ${error._tag}` }))
      )
      if (response.status === 429) {
        const seconds = Number(response.headers["retry-after"] ?? "2")
        return yield* new ShopifyThrottled({ retryAfterMs: (Number.isFinite(seconds) ? seconds : 2) * 1000 })
      }
      if (response.status >= 400) {
        return yield* new ShopifyRefused({ status: response.status, reason: `graphql answered ${response.status}` })
      }
      const answer = yield* HttpClientResponse.schemaBodyJson(Answer)(response).pipe(
        Effect.mapError(() => new ShopifyRefused({ status: response.status, reason: "graphql answer unreadable" }))
      )
      const cost = answer.extensions?.cost
      const throttle: ThrottleStatus | null = cost?.throttleStatus ?? null
      if (answer.errors?.some((e) => e.extensions?.code === "THROTTLED")) {
        const needed = (cost?.requestedQueryCost ?? 10) - (throttle?.currentlyAvailable ?? 0)
        const rate = throttle?.restoreRate ?? 50
        return yield* new ShopifyThrottled({ retryAfterMs: Math.max(1000, Math.ceil((needed / rate) * 1000)) })
      }
      // The store's token may not do this: the app's scopes grew since the store approved them.
      const denied = answer.errors?.find((e) => e.extensions?.code === "ACCESS_DENIED")
      if (denied !== undefined) {
        const scope = scopeIn(`${denied.extensions?.requiredAccess ?? ""} ${denied.message}`)
        return yield* new ShopifyRefused({
          status: 403,
          reason: denied.message,
          ...(scope === undefined ? {} : { scope })
        })
      }
      if (answer.errors !== undefined && answer.errors.length > 0) {
        return yield* new ShopifyRefused({ status: 200, reason: answer.errors.map((e) => e.message).join("; ") })
      }
      return { data: answer.data, throttle }
    })

    return ShopifyGraphql.of({
      query: (shop, token, query, variables) => graphql(shop, token, query, variables)
    })
  })
)
