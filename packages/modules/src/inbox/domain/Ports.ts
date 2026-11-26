import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, type Effect } from "effect"
import type { SqlClient, SqlError } from "effect/sql"

/*
 * What the inbox needs of another slice (architecture.md: never its use-cases/), implemented where the app is
 * composed (`apps/api/src/platform/SliceLinks.ts`).
 */

/**
 * "Aan ticket koppelen": a ticket made from a thread, on the inbox's transaction, and taken away again on Undo.
 *
 * @effect-expect-leaking CurrentPrincipal
 */
export class ThreadTickets extends Context.Service<ThreadTickets, {
  readonly make: (sql: SqlClient.SqlClient, input: {
    readonly title: string
    readonly description: string
    readonly threadId: string
    /** A website chat's, rather than mail's. */
    readonly chat: boolean
    readonly customerId: string | null
    /** The order the thread is about: a chat's is its customer's latest in the store, as its chip shows it. */
    readonly orderId: string | null
  }) => Effect.Effect<{ readonly id: string; readonly number: number }, SqlError.SqlError, CurrentPrincipal>
  readonly remove: (
    sql: SqlClient.SqlClient,
    ticketId: string
  ) => Effect.Effect<void, SqlError.SqlError, CurrentPrincipal>
  /** The ticket's number, where it exists and the caller may see it. */
  readonly numberOf: (
    sql: SqlClient.SqlClient,
    ticketId: string
  ) => Effect.Effect<number | undefined, SqlError.SqlError, CurrentPrincipal>
}>()("inbox/ThreadTickets") {}

/**
 * The website chat's widget sessions (M15 step 8): a signed token per shopper session, bound to one store, under the
 * stage's own key (`WEBCHAT_TOKEN_SECRET`); and the keyed hash a session's id is kept as. `available` is false where the
 * stage has no key, and then nothing is signed.
 */
export class WidgetKeys extends Context.Service<WidgetKeys, {
  readonly available: boolean
  /** The token's text: the claims and their HMAC. */
  readonly sign: (claims: WidgetClaims) => Effect.Effect<string>
  /** The claims, where the token is ours and whole; expiry is the caller's to check. */
  readonly verify: (token: string) => Effect.Effect<WidgetClaims | undefined>
  /** How a session's id is kept: never the id itself. */
  readonly visitorHash: (storeId: string, sessionId: string) => Effect.Effect<string>
}>()("inbox/WidgetKeys") {}

/** What a widget token says: its store, its session, and until when (epoch seconds). */
export interface WidgetClaims {
  readonly storeId: string
  readonly sessionId: string
  readonly expiresAt: number
}

/**
 * What the website chat needs to know of a store from Shopify (M15 step 8), through the stores slice's gate: the
 * storefront's primary origin (its own domain, which the widget's requests come from; `null` where Shopify did not
 * say), where the app's chat embed loads the widget from (`pointEmbed`: this stage's API, in the app installation's
 * own metafield `insyte.api_origin`, which the embed reads; `clearEmbed` takes it away, so the embed renders nothing;
 * each `false` where Shopify did not take it), and the theme editor's link that turns the embed on in the store's live
 * theme.
 */
type WebchatStore = { readonly workspaceId: string; readonly connectionId: string; readonly shopDomain: string }
export class WebchatStores extends Context.Service<WebchatStores, {
  readonly primaryOrigin: (store: WebchatStore) => Effect.Effect<string | null>
  readonly pointEmbed: (store: WebchatStore) => Effect.Effect<boolean>
  readonly clearEmbed: (store: WebchatStore) => Effect.Effect<boolean>
  readonly embedUrl: (shopDomain: string) => string
}>()("inbox/WebchatStores") {}
