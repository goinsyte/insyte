import { Db } from "@insyte/database/Db"
import * as Policy from "@insyte/domain/Policy"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import { accountStatus, ConnectionList, type ConnectionProvider, ConnectionRow } from "../domain/Connections.ts"
import { BROKEN, findingSentence, type IncidentFacts, type IncidentKind, stateOf } from "../domain/Health.ts"

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

/** The stores the reader reaches, each with its sync health in the page's terms. */
const shopify = (sql: SqlClient.SqlClient) =>
  Effect.gen(function*() {
    const scope = yield* inScope(sql, "s.id")
    const stores = yield* sql<StoreRow>`
      select s.id as store_id, s.name as store_name, s.status as store_status, c.id as connection_id,
             greatest(c.last_synced_at, s.last_synced_at) as last_synced_at
      from stores s join connections c on c.id = s.connection_id
      where s.status <> 'disconnected' and ${scope}
      order by s.created_at, s.id`
    if (stores.length === 0) return [none("shopify")]
    const open = yield* sql<OpenRow>`
      select connection_id, kind, facts from connection_incidents
      where resolved_at is null and connection_id in ${sql.in(stores.map((s) => s.connectionId))}
      order by opened_at desc`
    return stores.map((s) => {
      const mine = open.filter((i) => i.connectionId === s.connectionId)
      const state = stateOf(s.storeStatus, mine.map((i) => i.kind))
      // The incident that asks something of the operator first, else the newest.
      const worst = mine.find((i) => BROKEN.has(i.kind)) ?? mine[0]
      return new ConnectionRow({
        provider: "shopify",
        id: s.storeId,
        storeId: s.storeId,
        account: s.storeName,
        status: state === "broken" ? "action_required" : state === "importing" ? "connecting" : "connected",
        reason: worst?.kind ?? (state === "broken" ? "action_required" : null),
        note: worst === undefined ? null : findingSentence(worst.kind, worst.facts),
        lastSyncedAt: time(s.lastSyncedAt)
      })
    })
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

/** The sending domain (E-mail en domein): connected once Resend has seen it verified. */
const sendingDomain = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<{ name: string; verifiedAt: Date | null }>`select name, verified_at from sending_domains`,
    ([d]) =>
      d === undefined ? none("resend") : new ConnectionRow({
        provider: "resend",
        id: "resend",
        storeId: null,
        account: d.name,
        status: d.verifiedAt === null ? "action_required" : "connected",
        reason: d.verifiedAt === null ? "unverified" : null,
        note: null,
        lastSyncedAt: null
      })
  )

/** Klaviyo's or Slack's one account: the connected one, else the newest that still needs something. */
const account = (sql: SqlClient.SqlClient, provider: "klaviyo" | "slack", name: "accountName" | "teamName") =>
  Effect.map(
    sql<{ status: string; account: string | null; lastSyncedAt: Date | null }>`
      select status, health ->> ${name} as account, last_synced_at from connections
      where provider = ${provider} and status <> 'disconnected'
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
