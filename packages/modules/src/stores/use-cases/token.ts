import { Db } from "@insyte/database/Db"
import { Effect, Option, Redacted, Schema } from "effect"
import { Sealer } from "../../shared/domain/Sealer.ts"
import { ShopifyAdmin, TokenRefused } from "../domain/Ports.ts"

/*
 * A connection's access token (integrations.md §1.3, "Refresh"), as the gate asks for it: the sealed one while it has
 * five minutes left, else a refresh. Shopify's refresh token rotates on every use, so the gate runs this for one caller
 * at a time per account. A refused refresh means the operator must approve the app again: the connection becomes
 * `token_expired` and its store `action_required`, and nothing retries it.
 */

const Sealed = Schema.Struct({
  accessToken: Schema.String,
  refreshToken: Schema.NullOr(Schema.String),
  expiresAt: Schema.NullOr(Schema.String),
  refreshExpiresAt: Schema.NullOr(Schema.String)
})
const decodeSealed = Schema.decodeUnknownEffect(Schema.fromJsonString(Sealed))

/** Refresh this long before the access token lapses: a backfill step must not start on a token about to go. */
const MARGIN_MS = 5 * 60_000

export interface CurrentToken {
  readonly token: Redacted.Redacted<string>
  /** When the gate must ask again (ms since the epoch); `null` for a token that does not expire. */
  readonly until: number | null
}

export const accessToken = Effect.fn("Stores.accessToken")(function*(connectionId: string) {
  const db = yield* Db
  const sealer = yield* Sealer
  const [row] = yield* db.scopedFor((sql) =>
    sql<{ shop: string; sealed: string }>`
      select c.account_ref as shop, cc.sealed from connections c
      join connection_credentials cc on cc.connection_id = c.id
      where c.id = ${connectionId} and c.status = 'connected'`
  )
  if (row === undefined) return yield* new TokenRefused({ reason: "disconnected" })
  const opened = yield* sealer.open(row.sealed).pipe(Effect.orDie)
  const current = yield* decodeSealed(Redacted.value(opened)).pipe(Effect.orDie)
  const expiresAt = current.expiresAt === null ? null : Date.parse(current.expiresAt)
  if (expiresAt === null || expiresAt - Date.now() > MARGIN_MS) {
    return { token: Redacted.make(current.accessToken), until: expiresAt === null ? null : expiresAt - MARGIN_MS }
  }
  if (current.refreshToken === null) return yield* refused(connectionId)

  const shopify = yield* ShopifyAdmin
  const fresh = yield* shopify.refresh(row.shop, Redacted.make(current.refreshToken)).pipe(
    Effect.asSome,
    // 4xx: the grant is gone (revoked, or the refresh token lapsed). Anything else is Shopify's moment: the step retries.
    Effect.catchTag("ShopifyRefused", (e) => e.status >= 400 && e.status < 500 ? Effect.succeedNone : Effect.die(e))
  )
  if (Option.isNone(fresh)) return yield* refused(connectionId)
  const tokens = fresh.value
  const sealed = yield* sealer.seal(JSON.stringify({
    accessToken: Redacted.value(tokens.accessToken),
    refreshToken: tokens.refreshToken === null ? current.refreshToken : Redacted.value(tokens.refreshToken),
    expiresAt: tokens.expiresAt?.toISOString() ?? null,
    refreshExpiresAt: tokens.refreshExpiresAt?.toISOString() ?? current.refreshExpiresAt
  }))
  yield* db.scopedFor((sql) =>
    sql`update connection_credentials set sealed = ${sealed.sealed}, kid = ${sealed.kid},
          token_expires_at = ${tokens.expiresAt}, refreshed_at = now()
        where connection_id = ${connectionId}`
  )
  const until = tokens.expiresAt === null ? null : tokens.expiresAt.getTime() - MARGIN_MS
  return { token: tokens.accessToken, until } satisfies CurrentToken
})

const refused = Effect.fn("Stores.tokenRefused")(function*(connectionId: string) {
  const db = yield* Db
  yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      yield* sql`update connections set status = 'token_expired', last_error_at = now() where id = ${connectionId}`
      yield* sql`update stores set status = 'action_required' where connection_id = ${connectionId}
                   and status <> 'disconnected'`
    })
  )
  return yield* new TokenRefused({ reason: "expired" })
})
