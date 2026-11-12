import type { Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, type Effect } from "effect"
import type { SqlClient, SqlError } from "effect/sql"

/** A recipe app's key access per API area: none, read, or read and write. */
export type KeyLevel = 0 | 1 | 2

/** Which stores a key reaches: every store, or these. */
export type KeyStores = "all" | ReadonlyArray<string>

/** What a recipe app's key may do: a level per API area (an area left out is none), in these stores. */
export interface KeyGrant {
  readonly scopes: Readonly<Record<string, KeyLevel>>
  readonly stores: KeyStores
}

/**
 * The API keys a recipe app holds (M19.1's), as the Marketplace needs them, on the Marketplace's transaction: one made
 * for the app and shown once, taken back with it, put back by its Undo, and narrowed when scopes are taken from it. The
 * developer slice owns them, with its policy (Koppelingen at Beheren) and audit; the link is made where the app is
 * composed (`apps/api/src/platform/SliceLinks.ts`). What a key may reach is the Marketplace's to say (`grantOf`).
 *
 * @effect-expect-leaking CurrentPrincipal
 */
export class AppKeys extends Context.Service<AppKeys, {
  readonly create: (sql: SqlClient.SqlClient, input: {
    readonly label: string
    readonly grant: KeyGrant
    readonly expiresInDays: number | null
  }) => Effect.Effect<
    { readonly keyId: string; readonly secret: string; readonly prefix: string },
    Forbidden | Invalid | NotFound | SqlError.SqlError,
    CurrentPrincipal
  >
  /** Revoked now: when, or `null` when it already was (someone else's revocation, which is not this one's to undo). */
  readonly revoke: (
    sql: SqlClient.SqlClient,
    keyId: string
  ) => Effect.Effect<Date | null, Forbidden | NotFound | SqlError.SqlError, CurrentPrincipal>
  /** Working again, only if it is still revoked by the revocation made at `revokedAt`; whether it was. */
  readonly restore: (
    sql: SqlClient.SqlClient,
    keyId: string,
    revokedAt: Date
  ) => Effect.Effect<boolean, Forbidden | NotFound | SqlError.SqlError, CurrentPrincipal>
  /** The key's scopes replaced, and its stores narrowed to `grant.stores` (never widened). */
  readonly rescope: (
    sql: SqlClient.SqlClient,
    keyId: string,
    grant: KeyGrant
  ) => Effect.Effect<void, Forbidden | NotFound | SqlError.SqlError, CurrentPrincipal>
}>()("marketplace/AppKeys") {}
