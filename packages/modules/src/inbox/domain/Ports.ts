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
    readonly customerId: string | null
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
 * say), and the theme editor's link that turns the app's chat embed on in the store's live theme.
 */
export class WebchatStores extends Context.Service<WebchatStores, {
  readonly primaryOrigin: (
    store: { readonly workspaceId: string; readonly connectionId: string; readonly shopDomain: string }
  ) => Effect.Effect<string | null>
  readonly embedUrl: (shopDomain: string) => string
}>()("inbox/WebchatStores") {}
