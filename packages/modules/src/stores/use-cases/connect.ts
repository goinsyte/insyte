import { Db } from "@insyte/database/Db"
import { mintId, type WorkspaceId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect, Redacted } from "effect"
import { SqlError } from "effect/sql"
import { Relay } from "../../shared/domain/Outbox.ts"
import { Sealer } from "../../shared/domain/Sealer.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import { ShopifyAdmin } from "../domain/Ports.ts"
import {
  type BeginConnect,
  ConnectFailed,
  normaliseShop,
  safeReturn,
  ShopifyUnavailable,
  ShopNotFound,
  StoreConnectedElsewhere
} from "../domain/Stores.ts"

/*
 * Connecting a Shopify store (M6.2, integrations.md §1.2, §2). `beginConnect` keeps a nonce for ten minutes and answers
 * Shopify's approval page; Shopify comes back to the callback with a code, signed with the app's secret. The callback
 * trusts nothing it did not check: the signature, the nonce (unused, in time, the same member's), the shop it was for,
 * and that no other workspace holds the shop. Then the code becomes expiring offline tokens, sealed before they are
 * stored, and the store is connected (a reconnect keeps its id). Connecting is `settings` at Beheren.
 */

const STATE_MINUTES = 10

export const beginConnect = Effect.fn("Stores.beginConnect")(function*(input: BeginConnect, redirectUri: string) {
  yield* Policy.require("settings", 3)
  const shopify = yield* ShopifyAdmin
  if (!shopify.configured) return yield* new ShopifyUnavailable()
  const shop = normaliseShop(input.shopDomain)
  if (shop === undefined || !(yield* shopify.exists(shop))) {
    return yield* new ShopNotFound({ shopDomain: shop ?? input.shopDomain })
  }
  const { workspaceId, id } = yield* CurrentPrincipal
  const db = yield* Db
  const nonce = crypto.randomUUID().replaceAll("-", "")
  yield* db.scoped((sql) =>
    sql`insert into oauth_states (nonce, workspace_id, member_id, provider, account_ref, return_path, expires_at)
        values (${nonce}, ${workspaceId}, ${id}, 'shopify', ${shop}, ${safeReturn(input.returnPath)},
                now() + make_interval(mins => ${STATE_MINUTES}))`
  )
  return { authorizeUrl: shopify.authorizeUrl({ shop, state: nonce, redirectUri }) }
})

/** The callback's answer: where to send the person back, and the store that is now connected. */
export interface Connected {
  readonly returnPath: string
  readonly storeId: string
  readonly name: string
}

export const callback = Effect.fn("Stores.connectCallback")(function*(query: Readonly<Record<string, string>>) {
  const shopify = yield* ShopifyAdmin
  if (!(yield* shopify.verifyCallback(query))) return yield* new ConnectFailed({ reason: "signature" })
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  const sealer = yield* Sealer
  const shop = normaliseShop(query["shop"] ?? "")

  const state = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [row] = yield* sql<{ accountRef: string | null; returnPath: string }>`
        update oauth_states set used_at = now()
        where nonce = ${query["state"] ?? ""} and provider = 'shopify' and member_id = ${principal.id}
          and used_at is null and expires_at > now()
        returning account_ref, return_path`
      return row
    })
  )
  if (state === undefined) return yield* new ConnectFailed({ reason: "state" })
  const returnPath = state.returnPath
  if (shop === undefined || shop !== state.accountRef) return yield* new ConnectFailed({ reason: "shop", returnPath })

  const [elsewhere] = yield* db.routing((sql) =>
    sql<{ workspaceId: WorkspaceId }>`select workspace_id from route_shop(${shop})`
  )
  if (elsewhere !== undefined && elsewhere.workspaceId !== principal.workspaceId) {
    return yield* new StoreConnectedElsewhere({ shopDomain: shop, returnPath })
  }

  const tokens = yield* shopify.exchange(shop, query["code"] ?? "").pipe(
    Effect.mapError(() => new ConnectFailed({ reason: "exchange", returnPath }))
  )
  const facts = yield* shopify.facts(shop, tokens.accessToken).pipe(
    Effect.mapError(() => new ConnectFailed({ reason: "exchange", returnPath }))
  )
  const sealed = yield* sealer.seal(JSON.stringify({
    accessToken: Redacted.value(tokens.accessToken),
    refreshToken: tokens.refreshToken === null ? null : Redacted.value(tokens.refreshToken),
    expiresAt: tokens.expiresAt?.toISOString() ?? null,
    refreshExpiresAt: tokens.refreshExpiresAt?.toISOString() ?? null
  }))

  // A fresh grant: when it lapses (the health check warns a week ahead), and no failures counted against it.
  const health = tokens.refreshExpiresAt === null ? {} : { refreshExpiresAt: tokens.refreshExpiresAt.toISOString() }
  const connected = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [connection] = yield* sql<{ id: string }>`
        insert into connections (id, workspace_id, provider, account_ref, status, scopes, connected_by, health)
        values (${mintId("con")}, ${principal.workspaceId}, 'shopify', ${shop}, 'connected', ${[
        ...tokens.scopes
      ]}::text[],
                ${principal.id}, ${JSON.stringify(health)}::jsonb)
        on conflict (workspace_id, provider, account_ref) do update
          set status = 'connected', scopes = excluded.scopes, connected_by = excluded.connected_by,
              health = excluded.health
        returning id`
      yield* sql`insert into connection_credentials (connection_id, workspace_id, sealed, kid, token_expires_at)
                 values (${
        connection!.id
      }, ${principal.workspaceId}, ${sealed.sealed}, ${sealed.kid}, ${tokens.expiresAt})
                 on conflict (connection_id) do update set sealed = excluded.sealed, kid = excluded.kid,
                   token_expires_at = excluded.token_expires_at, refreshed_at = now()`
      const [existing] = yield* sql<{ id: string }>`
        select id from stores where shop_domain = ${shop} order by created_at desc limit 1`
      const storeId = existing?.id ?? mintId("sto")
      if (existing === undefined) {
        yield* sql`insert into stores (id, workspace_id, connection_id, shop_domain, name, country, currency, timezone,
                                       plan_name, status, connected_at)
                   values (${storeId}, ${principal.workspaceId}, ${
          connection!.id
        }, ${shop}, ${facts.name}, ${facts.country},
                           ${facts.currency}, ${facts.timezone}, ${facts.planName}, 'connected', now())`
      } else {
        yield* sql`update stores set connection_id = ${
          connection!.id
        }, name = ${facts.name}, country = ${facts.country},
                     currency = ${facts.currency}, timezone = ${facts.timezone}, plan_name = ${facts.planName},
                     status = 'connected', connected_at = now(), disconnected_at = null
                   where id = ${storeId}`
      }
      yield* Audit.write(sql, principal.workspaceId, { kind: "member", id: principal.id }, {
        action: existing === undefined ? "store.connected" : "store.reconnected",
        subjectType: "store",
        subjectId: storeId
      })
      const outboxId = yield* Outbox.write(sql, principal.workspaceId, {
        type: "store.connected",
        workspaceId: principal.workspaceId,
        storeId,
        userId: principal.userId ?? ""
      })
      return { storeId, outboxId }
    })
  ).pipe(
    // Another workspace connected the shop between the check and the insert: the partial unique index said no.
    Effect.catchIf(
      (e): e is SqlError.SqlError =>
        SqlError.isSqlError(e) &&
        /stores_shop_connected/.test(String((e.cause as { cause?: unknown })?.cause ?? e.cause)),
      () => Effect.fail(new StoreConnectedElsewhere({ shopDomain: shop, returnPath }))
    )
  )
  yield* (yield* Relay).kick([connected.outboxId])
  return { returnPath: state.returnPath, storeId: connected.storeId, name: facts.name } satisfies Connected
})
