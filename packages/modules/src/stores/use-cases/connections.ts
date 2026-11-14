import { Db } from "@insyte/database/Db"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import { decodeOr } from "../../settings/domain/Check.ts"
import { StoredDomain } from "../../settings/domain/SendingDomain.ts"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import {
  accountStatus,
  ConnectionList,
  type ConnectionProvider,
  ConnectionRow,
  storeConnection
} from "../domain/Connections.ts"
import type { IncidentFacts, IncidentKind } from "../domain/Health.ts"

/*
 * `Connections.list` (M6, widgets/05 §5.1): Koppelingen's rows, at `integrations` Bekijken. Every read names its
 * columns, and none of them is a credential: `connection_credentials` is never joined, and neither the scopes nor the
 * provider's `health` beyond the account's name leave here. A store's row is the reader's only inside their stores
 * (`storeScope`); the rest belong to the workspace. Whether Insyte AI is on is the stage's, so the caller says.
 */

const none = (provider: ConnectionProvider) =>
  new ConnectionRow({
    provider,
    id: provider,
    storeId: null,
    account: null,
    status: "disconnected",
    reason: null,
    note: null,
    lastSyncedAt: null
  })

const time = (at: Date | null) => at?.getTime() ?? null

interface StoreRow {
  readonly storeId: string
  readonly storeName: string
  readonly storeStatus: string
  readonly connectionId: string
  readonly lastSyncedAt: Date | null
}

interface OpenRow {
  readonly connectionId: string
  readonly kind: IncidentKind
  readonly facts: IncidentFacts
}

/**
 * The stores the reader reaches, each with its sync health in the page's terms (`storeConnection`). A reader held to
 * some stores who reaches none of them gets no Shopify row: the workspace's stores are not theirs to connect.
 */
const shopify = (sql: SqlClient.SqlClient) =>
  Effect.gen(function*() {
    const { storeScope } = yield* CurrentPrincipal
    const scope = yield* inScope(sql, "s.id")
    const stores = yield* sql<StoreRow>`
      select s.id as store_id, s.name as store_name, s.status as store_status, c.id as connection_id,
             greatest(c.last_synced_at, s.last_synced_at) as last_synced_at
      from stores s join connections c on c.id = s.connection_id
      where s.status <> 'disconnected' and ${scope}
      order by s.created_at, s.id`
    if (stores.length === 0) return storeScope === null ? [none("shopify")] : []
    const open = yield* sql<OpenRow>`
      select connection_id, kind, facts from connection_incidents
      where resolved_at is null and connection_id in ${sql.in(stores.map((s) => s.connectionId))}
      order by opened_at desc`
    return stores.map((s) =>
      storeConnection(
        { storeId: s.storeId, storeName: s.storeName, storeStatus: s.storeStatus, lastSyncedAt: time(s.lastSyncedAt) },
        open.filter((i) => i.connectionId === s.connectionId)
      )
    )
  })

/** The workspace's connected mailboxes; the forwarding address's row when there is none. */
const mailboxes = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<{ id: string; provider: "forward" | "gmail" | "outlook"; address: string; lastSyncedAt: Date | null }>`
      select id, provider, address, last_synced_at from mailboxes where status = 'connected'
      order by is_default desc, created_at, id`,
    (rows) =>
      rows.length === 0 ? [none("forward")] : rows.map((m) =>
        new ConnectionRow({
          provider: m.provider,
          id: m.id,
          storeId: null,
          account: m.address,
          status: "connected",
          reason: null,
          note: null,
          lastSyncedAt: time(m.lastSyncedAt)
        })
      )
  )

const MaybeDomain = Schema.NullOr(StoredDomain)
const decodeDomain = (raw: unknown) => decodeOr(MaybeDomain, raw, null)

/**
 * The sending domain (E-mail en domein), as its page last read it from Resend (`domain_senders`, which
 * `SendingDomain.get` and the daily re-check keep): connected while it is verified there. A name claimed whose domain
 * was not made yet needs the set-up finished; `sending_domains.verified_at` only says it was verified once.
 */
const sendingDomain = (sql: SqlClient.SqlClient) =>
  Effect.gen(function*() {
    const [claim] = yield* sql<{ name: string }>`select name from sending_domains`
    const [section] = yield* sql<{ domain: unknown }>`
      select value -> 'domain' as domain from workspace_settings where section = 'domain_senders'`
    const stored = section === undefined ? null : decodeDomain(section.domain)
    if (stored === null && claim === undefined) return none("resend")
    const verified = stored?.verified === true
    return new ConnectionRow({
      provider: "resend",
      id: "resend",
      storeId: null,
      account: stored?.name ?? claim?.name ?? null,
      status: verified ? "connected" : "action_required",
      reason: verified ? null : "unverified",
      note: null,
      lastSyncedAt: null
    })
  })

/**
 * Klaviyo's or Slack's one account: the connected one, else the newest that still needs something. A revoked one is
 * gone for good (the app was removed, or the token refused for good) and nothing lets it go, so it reads as none.
 */
const account = (sql: SqlClient.SqlClient, provider: "klaviyo" | "slack", name: "accountName" | "teamName") =>
  Effect.map(
    sql<{ status: string; account: string | null; lastSyncedAt: Date | null }>`
      select status, health ->> ${name} as account, last_synced_at from connections
      where provider = ${provider} and status not in ('disconnected', 'revoked')
      order by status = 'connected' desc, created_at desc limit 1`,
    ([c]) => {
      if (c === undefined) return none(provider)
      const { reason, status } = accountStatus(c.status)
      return new ConnectionRow({
        provider,
        id: provider,
        storeId: null,
        account: c.account,
        status,
        reason,
        note: null,
        lastSyncedAt: time(c.lastSyncedAt)
      })
    }
  )

const insyteAi = (on: boolean) =>
  new ConnectionRow({
    provider: "anthropic",
    id: "anthropic",
    storeId: null,
    account: null,
    status: on ? "connected" : "disconnected",
    reason: on ? null : "off",
    note: null,
    lastSyncedAt: null
  })

export const list = Effect.fn("Connections.list")(function*(aiOn: boolean) {
  yield* Policy.require("integrations", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const stores = yield* shopify(sql)
      const mail = yield* mailboxes(sql)
      const domain = yield* sendingDomain(sql)
      const klaviyo = yield* account(sql, "klaviyo", "accountName")
      const slack = yield* account(sql, "slack", "teamName")
      return new ConnectionList({ connections: [...stores, ...mail, domain, klaviyo, slack, insyteAi(aiOn)] })
    })
  )
})
