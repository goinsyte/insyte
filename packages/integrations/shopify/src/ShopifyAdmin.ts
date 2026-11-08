import { type ShopFacts, ShopifyAdmin, ShopifyRefused, type ShopifyTokens } from "@insyte/modules/stores/domain/Ports"
import { Config, Effect, Layer, Option, Redacted, Schema } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"

/*
 * The stores slice's Shopify port over the Admin API (M6.2, integrations.md §2). No SDK: OAuth is three plain requests
 * and the shop's facts one GraphQL query. Expiring offline tokens (`expiring=1`): a 1-hour access token and a 90-day
 * refresh token that rotates on every use. The client secret signs the callback and travels only in the exchange.
 */

/** What the app asks a store for, as `shopify.app.toml` lists it (the store approves exactly these). */
export const SCOPES = [
  "read_orders",
  "write_orders",
  "read_customers",
  "write_customers",
  "read_products",
  "write_products",
  "read_inventory",
  "write_inventory",
  "read_locations",
  "read_fulfillments",
  "write_merchant_managed_fulfillment_orders",
  "read_returns",
  "write_draft_orders",
  "write_discounts"
] as const

const Exchanged = Schema.Struct({
  access_token: Schema.String,
  scope: Schema.String,
  expires_in: Schema.optional(Schema.Finite),
  refresh_token: Schema.optional(Schema.String),
  refresh_token_expires_in: Schema.optional(Schema.Finite)
})

const ShopAnswer = Schema.Struct({
  data: Schema.Struct({
    shop: Schema.Struct({
      name: Schema.String,
      currencyCode: Schema.String,
      ianaTimezone: Schema.String,
      plan: Schema.NullOr(Schema.Struct({ displayName: Schema.String })),
      billingAddress: Schema.NullOr(Schema.Struct({ countryCodeV2: Schema.NullOr(Schema.String) }))
    })
  })
})

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("")

/** Equal strings, compared in time that does not depend on where they differ. */
const same = (a: string, b: string) => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const hmacHex = (secret: string, message: string) =>
  Effect.promise(async () => {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    )
    return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)))
  })

const after = (seconds: number | undefined) => (seconds === undefined ? null : new Date(Date.now() + seconds * 1000))

const refused = (status: number, reason: string) => new ShopifyRefused({ status, reason })

export const ShopifyAdminLive = Layer.effect(
  ShopifyAdmin,
  Effect.gen(function*() {
    const clientId = yield* Config.String("SHOPIFY_CLIENT_ID").pipe(Config.option)
    const clientSecret = yield* Config.Redacted("SHOPIFY_CLIENT_SECRET").pipe(Config.option)
    const version = yield* Config.String("SHOPIFY_API_VERSION").pipe(Config.withDefault("2026-10"))
    const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk)
    const raw = yield* HttpClient.HttpClient
    const id = Option.getOrElse(clientId, () => "")
    const secret = Option.match(clientSecret, { onNone: () => "", onSome: Redacted.value })

    return ShopifyAdmin.of({
      configured: id !== "" && secret !== "",
      authorizeUrl: ({ shop, state, redirectUri }) => {
        const url = new URL(`https://${shop}/admin/oauth/authorize`)
        url.searchParams.set("client_id", id)
        url.searchParams.set("scope", SCOPES.join(","))
        url.searchParams.set("redirect_uri", redirectUri)
        url.searchParams.set("state", state)
        return url.href
      },
      verifyCallback: (query) =>
        Effect.gen(function*() {
          const given = query["hmac"]
          if (given === undefined || secret === "") return false
          const message = Object.keys(query)
            .filter((k) => k !== "hmac" && k !== "signature")
            .sort()
            .map((k) => `${k}=${query[k]}`)
            .join("&")
          return same(yield* hmacHex(secret, message), given)
        }),
      exists: (shop) =>
        raw.execute(HttpClientRequest.get(`https://${shop}/admin/oauth/authorize?client_id=${id}`)).pipe(
          Effect.map((response) => response.status !== 404),
          Effect.timeout("10 seconds"),
          Effect.orElseSucceed(() => true)
        ),
      exchange: Effect.fn("Shopify.exchange")(function*(shop: string, code: string) {
        const response = yield* client.execute(
          HttpClientRequest.post(`https://${shop}/admin/oauth/access_token`).pipe(
            HttpClientRequest.bodyJsonUnsafe({ client_id: id, client_secret: secret, code, expiring: 1 })
          )
        ).pipe(
          Effect.timeout("15 seconds"),
          Effect.mapError((error) => refused(0, `exchange failed: ${error._tag}`))
        )
        const body = yield* HttpClientResponse.schemaBodyJson(Exchanged)(response).pipe(
          Effect.mapError(() => refused(response.status, "exchange answer unreadable"))
        )
        return {
          accessToken: Redacted.make(body.access_token),
          refreshToken: body.refresh_token === undefined ? null : Redacted.make(body.refresh_token),
          expiresAt: after(body.expires_in),
          refreshExpiresAt: after(body.refresh_token_expires_in),
          scopes: body.scope.split(",").filter((s) => s !== "")
        } satisfies ShopifyTokens
      }),
      facts: Effect.fn("Shopify.facts")(function*(shop: string, accessToken: Redacted.Redacted<string>) {
        const response = yield* client.execute(
          HttpClientRequest.post(`https://${shop}/admin/api/${version}/graphql.json`).pipe(
            HttpClientRequest.setHeader("x-shopify-access-token", Redacted.value(accessToken)),
            HttpClientRequest.bodyJsonUnsafe({
              query: "{ shop { name currencyCode ianaTimezone plan { displayName } billingAddress { countryCodeV2 } } }"
            })
          )
        ).pipe(
          Effect.timeout("15 seconds"),
          Effect.mapError((error) => refused(0, `shop query failed: ${error._tag}`))
        )
        const { data } = yield* HttpClientResponse.schemaBodyJson(ShopAnswer)(response).pipe(
          Effect.mapError(() => refused(response.status, "shop answer unreadable"))
        )
        return {
          name: data.shop.name,
          currency: data.shop.currencyCode,
          timezone: data.shop.ianaTimezone,
          country: data.shop.billingAddress?.countryCodeV2 ?? null,
          planName: data.shop.plan?.displayName ?? null
        } satisfies ShopFacts
      })
    })
  })
)
