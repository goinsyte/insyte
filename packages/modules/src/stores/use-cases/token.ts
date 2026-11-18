import { Db } from "@insyte/database/Db"
import { Effect, Option, Redacted, Schedule, Schema } from "effect"
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

/** A refreshed pair's write, tried again this often (200 ms, doubling: about six seconds in all) before it is lost. */
const SAVE_TRIES = 5

export interface CurrentToken {
  readonly token: Redacted.Redacted<string>
  /** When the gate must ask again (ms since the epoch); `null` for a token that does not expire. */
  readonly until: number | null
}

/**
 * Whether Shopify's answer to a refresh means the grant is gone: a 4xx (revoked, or the refresh token lapsed), but not
 * a 429, which is too many requests at once and passes.
 */
export const grantGone = (status: number) => status >= 400 && status < 500 && status !== 429

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
  const refreshToken = current.refreshToken
  // From Shopify's answer to the write, one piece (W13.6): Shopify spends the old refresh token the moment it issues
  // the new pair, so the pair must land before anything uses it, and nothing may stop it halfway. A write that fails
  // (the database's moment) is tried again; only a database away for longer loses the pair, an error in the log.
  return yield* Effect.uninterruptible(Effect.gen(function*() {
    const fresh = yield* shopify.refresh(row.shop, Redacted.make(refreshToken)).pipe(
      Effect.asSome,
      // The grant gone (`grantGone`): refused for good. Anything else is Shopify's moment, a 429 among them: the step
      // retries, and the grant stays.
      Effect.catchTag("ShopifyRefused", (e) => grantGone(e.status) ? Effect.succeedNone : Effect.die(e))
    )
    if (Option.isNone(fresh)) return yield* refused(connectionId)
    const tokens = fresh.value
    const refreshExpiresAt = tokens.refreshExpiresAt?.toISOString() ?? current.refreshExpiresAt
    const sealed = yield* sealer.seal(JSON.stringify({
      accessToken: Redacted.value(tokens.accessToken),
      refreshToken: tokens.refreshToken === null ? refreshToken : Redacted.value(tokens.refreshToken),
      expiresAt: tokens.expiresAt?.toISOString() ?? null,
      refreshExpiresAt
    }))
    yield* db.scopedFor((sql) =>
      Effect.gen(function*() {
        yield* sql`update connection_credentials set sealed = ${sealed.sealed}, kid = ${sealed.kid},
              token_expires_at = ${tokens.expiresAt}, refreshed_at = now()
            where connection_id = ${connectionId}`
        // When the grant lapses is no secret: the health check warns a week ahead (M17 step 6).
        yield* sql`update connections set health = health || ${JSON.stringify({ refreshExpiresAt })}::jsonb
                   where id = ${connectionId}`
      })
    ).pipe(
      Effect.retry({ times: SAVE_TRIES, schedule: Schedule.exponential("200 millis") }),
      Effect.tapCause((cause) =>
        Effect.logError("shopify: a refreshed token was not saved; the store will need to reconnect", {
          connectionId,
          cause
        })
      )
    )
    const until = tokens.expiresAt === null ? null : tokens.expiresAt.getTime() - MARGIN_MS
    return { token: tokens.accessToken, until } satisfies CurrentToken
  }))
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
