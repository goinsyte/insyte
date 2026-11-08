import { Context, type Effect, type Redacted, Schema } from "effect"

/*
 * Shopify, as the stores slice needs it (M6.2, integrations.md §2): the install's authorize address and its signed
 * callback, the code's exchange for expiring offline tokens, and the shop's own facts. A port, so the slice never
 * names the vendor's HTTP; the adapter is `@insyte/integrations-shopify`, with a recorded twin for tests.
 */

/** What an install gives: a 1-hour access token and a 90-day refresh token that rotates on every use. */
export interface ShopifyTokens {
  readonly accessToken: Redacted.Redacted<string>
  readonly refreshToken: Redacted.Redacted<string> | null
  readonly expiresAt: Date | null
  readonly refreshExpiresAt: Date | null
  readonly scopes: ReadonlyArray<string>
}

export interface ShopFacts {
  readonly name: string
  readonly currency: string
  readonly timezone: string
  readonly country: string | null
  readonly planName: string | null
}

/** Shopify said no, or could not be reached; `reason` is Shopify's own word, never a token. */
export class ShopifyRefused extends Schema.TaggedError<ShopifyRefused>()("ShopifyRefused", {
  status: Schema.Int,
  reason: Schema.String
}) {}

export class ShopifyAdmin extends Context.Service<ShopifyAdmin, {
  /** Whether this stage has an app to install (`SHOPIFY_CLIENT_ID` and its secret); without, stores can only wait. */
  readonly configured: boolean
  /** Shopify's approval page for `shop`, returning to `redirectUri` with `state`. */
  readonly authorizeUrl: (input: { shop: string; state: string; redirectUri: string }) => string
  /** The callback's query is Shopify's: its `hmac` signs the rest with the app's secret. */
  readonly verifyCallback: (query: Readonly<Record<string, string>>) => Effect.Effect<boolean>
  /** Whether a shop answers at that address (Shopify serves 404 for one that does not exist). */
  readonly exists: (shop: string) => Effect.Effect<boolean>
  readonly exchange: (shop: string, code: string) => Effect.Effect<ShopifyTokens, ShopifyRefused>
  readonly facts: (shop: string, accessToken: Redacted.Redacted<string>) => Effect.Effect<ShopFacts, ShopifyRefused>
}>()("stores/ShopifyAdmin") {}
