import { type ShopFacts, ShopifyAdmin, ShopifyRefused } from "@insyte/modules/stores/domain/Ports"
import { Effect, Layer, Redacted } from "effect"

/*
 * Shopify's recorded twin (integrations.md §1.1): the worker tests and local runs without an app connect a store
 * through it, so CI never calls Shopify. Any shop exists but `missing-*`; the code `refused` is refused, like a
 * replayed one; every callback signed `valid` verifies. The facts are what a fresh development store reports.
 */

export const RECORDED_FACTS: ShopFacts = {
  name: "Insyte MVP Test",
  currency: "EUR",
  timezone: "Europe/Amsterdam",
  country: "NL",
  planName: "Development"
}

export const ShopifyRecorded = Layer.succeed(ShopifyAdmin)(ShopifyAdmin.of({
  configured: true,
  authorizeUrl: ({ shop, state, redirectUri }) =>
    `https://${shop}/admin/oauth/authorize?client_id=recorded&state=${state}&redirect_uri=${
      encodeURIComponent(redirectUri)
    }`,
  verifyCallback: (query) => Effect.succeed(query["hmac"] === "valid"),
  exists: (shop) => Effect.succeed(!shop.startsWith("missing-")),
  exchange: (_shop, code) =>
    code === "refused"
      ? Effect.fail(new ShopifyRefused({ status: 400, reason: "invalid_request" }))
      : Effect.succeed({
        accessToken: Redacted.make(`recorded-access-${code}`),
        refreshToken: Redacted.make(`recorded-refresh-${code}`),
        expiresAt: new Date(Date.now() + 3_600_000),
        refreshExpiresAt: new Date(Date.now() + 90 * 86_400_000),
        scopes: ["read_orders", "read_products", "read_customers"]
      }),
  facts: () => Effect.succeed(RECORDED_FACTS)
}))
