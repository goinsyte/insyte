import type { CurrentWorkspace } from "@insyte/domain/Principal"
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
  /** A fresh access token for the refresh token; the refresh token rotates, so the old one is spent. */
  readonly refresh: (
    shop: string,
    refreshToken: Redacted.Redacted<string>
  ) => Effect.Effect<ShopifyTokens, ShopifyRefused>
  readonly facts: (shop: string, accessToken: Redacted.Redacted<string>) => Effect.Effect<ShopFacts, ShopifyRefused>
}>()("stores/ShopifyAdmin") {}

/* ─── The backfill (M6.3): bulk operations, the gate in front of every call ─── */

/** Shopify's leaky bucket after a call (`extensions.cost.throttleStatus`), in query cost points. */
export interface ThrottleStatus {
  readonly maximumAvailable: number
  readonly currentlyAvailable: number
  readonly restoreRate: number
}

/** Shopify asked for patience: try again after `retryAfterMs`. */
export class ShopifyThrottled extends Schema.TaggedError<ShopifyThrottled>()("ShopifyThrottled", {
  retryAfterMs: Schema.Finite
}) {}

export interface BulkStatus {
  readonly status: "CREATED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELED" | "CANCELING" | "EXPIRED"
  readonly errorCode: string | null
  readonly objectCount: number
  /** The result file once completed; `null` for a completed query that found nothing. */
  readonly url: string | null
}

/** Up to `maxLines` lines of a bulk result from byte `offset`, and where the next read starts. */
export interface BulkPage {
  readonly lines: ReadonlyArray<unknown>
  readonly next: number
  readonly done: boolean
}

export class ShopifyBulk extends Context.Service<ShopifyBulk, {
  readonly start: (
    shop: string,
    token: Redacted.Redacted<string>,
    query: string
  ) => Effect.Effect<
    { readonly id: string; readonly throttle: ThrottleStatus | null },
    ShopifyRefused | ShopifyThrottled
  >
  readonly status: (
    shop: string,
    token: Redacted.Redacted<string>,
    id: string
  ) => Effect.Effect<BulkStatus & { readonly throttle: ThrottleStatus | null }, ShopifyRefused | ShopifyThrottled>
  readonly read: (url: string, offset: number, maxLines: number) => Effect.Effect<BulkPage, ShopifyRefused>
}>()("stores/ShopifyBulk") {}

/** The account cannot give a token: disconnected, or its refresh was refused (the operator reconnects). */
export class TokenRefused extends Schema.TaggedError<TokenRefused>()("TokenRefused", {
  reason: Schema.Literals(["disconnected", "expired"])
}) {}

/**
 * The gate every call for one external account passes (integrations.md §1.3): a valid access token, refreshed by one
 * caller at a time (Shopify's refresh token rotates: two refreshes at once spend each other), and the account's
 * bucket, which `reserve` waits on and `observe` corrects with what the vendor reported.
 */
export class ConnectionGate extends Context.Service<ConnectionGate, {
  readonly accessToken: (
    connectionId: string
  ) => Effect.Effect<Redacted.Redacted<string>, TokenRefused, CurrentWorkspace>
  readonly reserve: (connectionId: string, cost: number) => Effect.Effect<void, ShopifyThrottled>
  readonly observe: (connectionId: string, status: ThrottleStatus) => Effect.Effect<void>
  /** Lets go of a held token (a disconnect): the next caller reads the credentials again. */
  readonly forget: (connectionId: string) => Effect.Effect<void>
}>()("stores/ConnectionGate") {}

/** Starts a store's backfill (a Workflow); starting one already started for that connect does nothing. */
export class Backfills extends Context.Service<Backfills, {
  readonly start: (
    input: { readonly key: string; readonly workspaceId: string; readonly storeId: string }
  ) => Effect.Effect<void>
}>()("stores/Backfills") {}
