import type { Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, type Effect } from "effect"
import type { SqlClient, SqlError } from "effect/sql"

/** A recipe app's key access over every area the API reaches: none, read, or read and write. */
export type KeyLevel = 0 | 1 | 2

/**
 * The API keys a recipe app holds (M19.1's), as the Marketplace needs them, on the Marketplace's transaction: one made
 * for the app and shown once, taken back with it, put back by its Undo, and narrowed when scopes are taken from it. The
 * developer slice owns them, with its policy (Koppelingen at Beheren) and audit; the link is made where the app is
 * composed (`apps/api/src/platform/SliceLinks.ts`).
 *
 * @effect-expect-leaking CurrentPrincipal
 */
export class AppKeys extends Context.Service<AppKeys, {
  readonly create: (sql: SqlClient.SqlClient, input: {
    readonly label: string
    readonly level: KeyLevel
  }) => Effect.Effect<
    { readonly keyId: string; readonly secret: string; readonly prefix: string },
    Forbidden | Invalid | NotFound | SqlError.SqlError,
    CurrentPrincipal
  >
  readonly revoke: (
    sql: SqlClient.SqlClient,
    keyId: string
  ) => Effect.Effect<void, Forbidden | NotFound | SqlError.SqlError, CurrentPrincipal>
  readonly restore: (
    sql: SqlClient.SqlClient,
    keyId: string
  ) => Effect.Effect<void, Forbidden | NotFound | SqlError.SqlError, CurrentPrincipal>
  readonly rescope: (
    sql: SqlClient.SqlClient,
    keyId: string,
    level: KeyLevel
  ) => Effect.Effect<void, Forbidden | NotFound | SqlError.SqlError, CurrentPrincipal>
}>()("marketplace/AppKeys") {}
