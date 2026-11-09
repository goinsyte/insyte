import { Context, type Effect, type Redacted, Schema } from "effect"

/*
 * Klaviyo, as the marketing slice needs it (M7.5, integrations.md): the OAuth app's authorize address (PKCE, S256),
 * the code's and the refresh token's exchange, the account, its lists, and the bulk profile import. A port, so the
 * slice never names the vendor's HTTP; the adapter is `@insyte/integrations-klaviyo`, with a recorded twin for tests.
 */

/** What the token endpoint gives: a 1-hour access token, and a refresh token that lasts until the app is removed. */
export interface KlaviyoTokens {
  readonly accessToken: Redacted.Redacted<string>
  readonly refreshToken: Redacted.Redacted<string>
  readonly expiresAt: Date
  readonly scopes: ReadonlyArray<string>
}

export interface KlaviyoList {
  readonly id: string
  readonly name: string
}

/** One profile as the bulk import takes it. */
export interface KlaviyoProfile {
  readonly email: string
  readonly firstName: string | null
  readonly lastName: string | null
  readonly phone: string | null
  readonly country: string | null
  readonly properties: Readonly<Record<string, unknown>>
}

/** Klaviyo said no, or could not be reached; `reason` is Klaviyo's own word, never a token. */
export class KlaviyoRefused extends Schema.TaggedError<KlaviyoRefused>()("KlaviyoRefused", {
  status: Schema.Int,
  reason: Schema.String
}) {}

/** The grant is gone (`invalid_grant`): the app was removed in Klaviyo, or the refresh token lapsed unused. */
export class KlaviyoGrantGone extends Schema.TaggedError<KlaviyoGrantGone>()("KlaviyoGrantGone", {}) {}

/** The scopes Insyte asks for: the account's name, its lists, and writing profiles into them. */
export const KLAVIYO_SCOPES = [
  "accounts:read",
  "lists:read",
  "lists:write",
  "profiles:read",
  "profiles:write"
] as const

export class Klaviyo extends Context.Service<Klaviyo, {
  /** Whether this stage has the OAuth app (`KLAVIYO_CLIENT_ID` and its secret). */
  readonly configured: boolean
  readonly authorizeUrl: (input: { state: string; codeChallenge: string; redirectUri: string }) => string
  readonly exchange: (
    input: { code: string; codeVerifier: string; redirectUri: string }
  ) => Effect.Effect<KlaviyoTokens, KlaviyoRefused>
  readonly refresh: (
    refreshToken: Redacted.Redacted<string>
  ) => Effect.Effect<KlaviyoTokens, KlaviyoRefused | KlaviyoGrantGone>
  /** Best effort, when the operator disconnects: Klaviyo forgets the refresh token. */
  readonly revoke: (refreshToken: Redacted.Redacted<string>) => Effect.Effect<void>
  readonly account: (
    token: Redacted.Redacted<string>
  ) => Effect.Effect<{ readonly id: string; readonly name: string }, KlaviyoRefused>
  readonly lists: (token: Redacted.Redacted<string>) => Effect.Effect<ReadonlyArray<KlaviyoList>, KlaviyoRefused>
  readonly createList: (token: Redacted.Redacted<string>, name: string) => Effect.Effect<KlaviyoList, KlaviyoRefused>
  /** Up to 10,000 profiles into a list; answers the import job's id. */
  readonly importProfiles: (
    token: Redacted.Redacted<string>,
    listId: string,
    profiles: ReadonlyArray<KlaviyoProfile>
  ) => Effect.Effect<string, KlaviyoRefused>
}>()("marketing/Klaviyo") {}
