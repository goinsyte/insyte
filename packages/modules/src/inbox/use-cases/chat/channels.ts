import { Db } from "@insyte/database/Db"
import { Invalid, NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient, Statement } from "effect/sql"
import * as Audit from "../../../shared/use-cases/Audit.ts"
import { inScope } from "../../../shared/use-cases/StoreScope.ts"
import * as Undo from "../../../shared/use-cases/Undo.ts"
import {
  ChannelChange,
  ChannelStatus,
  ChannelView,
  type ChatRestore,
  ChatUnavailable,
  type ConnectChannelInput
} from "../../domain/Chat.ts"
import { WebchatStores, WidgetKeys } from "../../domain/Ports.ts"
import { forgetChatRoute } from "./widget.ts"

/*
 * A store's website chat on Instellingen → Koppelingen (M15 step 8; widgets/04 "Websitechat koppelen"), at Koppelingen
 * en API · Instellen. Connecting makes (or turns back on) the store's channel with its welcome text and colour, and
 * keeps the storefront's primary origin Shopify names, so the widget's requests from the store's own domain are taken.
 * The widget itself reaches the store through the theme's app embed, which the operator turns on in Shopify's theme
 * editor (`activateUrl`, the link Shopify gives apps for it): an app cannot switch a theme's embed on by itself.
 * Disconnecting keeps the channel and its chats; the widget answers nothing more and replies are refused. Both have Undo.
 */

const CHAT_RESTORE = "chat.restore"

interface Row {
  readonly id: string
  readonly storeId: string
  readonly storeName: string
  readonly shopDomain: string
  readonly status: "connected" | "disconnected"
  readonly greeting: string
  readonly color: string | null
  readonly threads: number
  readonly connectedAt: Date
}

const read = (sql: SqlClient.SqlClient, where: Statement.Fragment) =>
  sql<Row>`
    select c.id, c.store_id, s.name as store_name, s.shop_domain, c.status, c.greeting, c.color, c.connected_at,
           (select count(*)::int from channel_threads t where t.channel_id = c.id and t.archived_at is null
              and t.spam_at is null and t.deleted_at is null) as threads
    from channels c join stores s on s.id = c.store_id
    where ${where}
    order by s.created_at, c.id`

const viewOf = (embed: (shop: string) => string) => (r: Row) =>
  new ChannelView({
    id: r.id,
    kind: "webchat",
    storeId: r.storeId,
    storeName: r.storeName,
    status: r.status,
    greeting: r.greeting,
    color: r.color,
    threads: r.threads,
    activateUrl: embed(r.shopDomain),
    connectedAt: r.connectedAt.getTime()
  })

const audit = (sql: SqlClient.SqlClient, action: string, id: string, diff?: Record<string, unknown>) =>
  Effect.flatMap(
    Effect.service(CurrentPrincipal),
    (p) =>
      Audit.write(sql, p.workspaceId, { kind: p.kind, id: p.id }, {
        action,
        subjectType: "channel",
        subjectId: id,
        diff
      })
  )

const may = (area: "support" | "integrations") =>
  Policy.require(area, 1).pipe(Effect.as(true), Effect.catchTag("Forbidden", () => Effect.succeed(false)))

/** The stores' chat channels the principal reaches, for Koppelingen, the inbox's panel and its group heads. */
export const status = Effect.fn("Channels.status")(function*() {
  // The inbox reads it at Klantenservice · Bekijken, Koppelingen at Koppelingen en API · Bekijken.
  if (!(yield* may("support")) && !(yield* may("integrations"))) yield* Policy.require("support", 1)
  const keys = yield* WidgetKeys
  const stores = yield* WebchatStores
  const db = yield* Db
  const rows = yield* db.scoped((sql) => Effect.flatMap(inScope(sql, "c.store_id"), (fence) => read(sql, fence)))
  return new ChannelStatus({ available: keys.available, channels: rows.map(viewOf(stores.embedUrl)) })
})

const one = (sql: SqlClient.SqlClient, id: string) =>
  Effect.flatMap(
    WebchatStores,
    (stores) => Effect.map(read(sql, sql`c.id = ${id}`), (rows) => viewOf(stores.embedUrl)(rows[0]!))
  )

/** "Koppelen": the store's website chat on, with its welcome text and colour. */
export const connect = Effect.fn("Channels.connect")(function*(input: typeof ConnectChannelInput.Type) {
  yield* Policy.require("integrations", 2)
  const keys = yield* WidgetKeys
  if (!keys.available) return yield* new ChatUnavailable()
  const principal = yield* CurrentPrincipal
  const stores = yield* WebchatStores
  const db = yield* Db
  const store = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const fence = yield* inScope(sql, "s.id", input.storeId)
      const rows = yield* sql<{ id: string; connectionId: string; shopDomain: string }>`
        select s.id, s.connection_id, s.shop_domain from stores s
        where s.status = 'connected' and ${fence} order by s.created_at, s.id limit 2`
      if (input.storeId === undefined && rows.length > 1) return yield* new Invalid({ fields: { storeId: "required" } })
      if (rows[0] === undefined) return yield* new NotFound({ entity: "store", id: input.storeId ?? "" })
      return rows[0]
    })
  )
  // Shopify's word on the storefront's own domain, read outside the transaction; without it the myshopify domain is
  // the only origin, until the next connect.
  const primary = yield* stores.primaryOrigin({ ...store, workspaceId: principal.workspaceId })
  // Where the embed loads the widget from, told to Shopify on every connect; the widget stays off without it.
  if (!(yield* stores.pointEmbed({ ...store, workspaceId: principal.workspaceId }))) {
    yield* Effect.logWarning("webchat: the app embed's API origin was not set").pipe(
      Effect.annotateLogs({ storeId: store.id })
    )
  }
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [before] = yield* sql<
        { id: string; status: "connected" | "disconnected"; greeting: string; color: string | null }
      >`
        select id, status, greeting, color from channels where store_id = ${store.id} and kind = 'webchat' for update`
      const greeting = (input.greeting ?? before?.greeting ?? "").trim()
      const color = input.color?.toLowerCase() ?? before?.color ?? null
      const origins = primary === null ? [] : [primary.toLowerCase()]
      const id = before?.id ?? mintId("chn")
      if (before === undefined) {
        yield* sql`insert into channels (id, workspace_id, store_id, kind, greeting, color, origins, created_by)
                   values (${id}, ${principal.workspaceId}, ${store.id}, 'webchat', ${greeting}, ${color}, ${origins},
                           ${principal.id})`
      } else {
        yield* sql`update channels set status = 'connected', greeting = ${greeting}, color = ${color},
                     origins = case when ${primary === null} then origins else ${origins} end,
                     connected_at = case when status = 'connected' then connected_at else now() end,
                     disconnected_at = null
                   where id = ${id}`
      }
      yield* audit(sql, before === undefined ? "channel.connected" : "channel.updated", id, { kind: "webchat" })
      const compensation: ChatRestore = {
        kind: "channel",
        channelId: id,
        status: before?.status ?? null,
        greeting: before?.greeting ?? "",
        color: before?.color ?? null
      }
      const undo = yield* Undo.issue(sql, { command: CHAT_RESTORE, compensation })
      forgetChatRoute(store.id)
      return new ChannelChange({ channel: yield* one(sql, id), undo })
    })
  )
})

/** "Ontkoppelen": the widget answers nothing more; the chats stay, and nothing more is sent on them. */
export const disconnect = Effect.fn("Channels.disconnect")(function*(input: { readonly id: string }) {
  yield* Policy.require("integrations", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [before] = yield* sql<
        { id: string; status: "connected" | "disconnected"; greeting: string; color: string | null }
      >`
        select c.id, c.status, c.greeting, c.color from channels c
        where c.id = ${input.id} and ${yield* inScope(sql, "c.store_id")} for update`
      if (before === undefined) return yield* new NotFound({ entity: "channel", id: input.id })
      if (before.status === "disconnected") {
        return new ChannelChange({ channel: yield* one(sql, before.id), undo: null })
      }
      yield* sql`update channels set status = 'disconnected', disconnected_at = now() where id = ${before.id}`
      yield* audit(sql, "channel.disconnected", before.id, { kind: "webchat" })
      const undo = yield* Undo.issue(sql, {
        command: CHAT_RESTORE,
        compensation: {
          kind: "channel",
          channelId: before.id,
          status: before.status,
          greeting: before.greeting,
          color: before.color
        } satisfies ChatRestore
      })
      const channel = yield* one(sql, before.id)
      forgetChatRoute(channel.storeId)
      return new ChannelChange({ channel, undo })
    })
  )
})

/** Undo of a connect or a disconnect: the channel as it was, or gone again where the connect made it. */
export const restoreChannel = Effect.fn("Channels.restore")(function*(
  sql: SqlClient.SqlClient,
  undo: Extract<ChatRestore, { readonly kind: "channel" }>
) {
  const [channel] = yield* sql<{ storeId: string }>`select store_id from channels where id = ${undo.channelId}`
  if (undo.status === null) {
    // Made by the connect: taken away while no chat came in on it; one that has chats is only switched off.
    const [chat] = yield* sql`select 1 from channel_threads where channel_id = ${undo.channelId} limit 1`
    if (chat === undefined) yield* sql`delete from channels where id = ${undo.channelId}`
    else yield* sql`update channels set status = 'disconnected', disconnected_at = now() where id = ${undo.channelId}`
  } else {
    yield* sql`update channels set status = ${undo.status}, greeting = ${undo.greeting}, color = ${undo.color},
                 disconnected_at = case when ${undo.status} = 'disconnected' then coalesce(disconnected_at, now()) end
               where id = ${undo.channelId}`
  }
  yield* audit(sql, "channel.restored", undo.channelId)
  // This isolate's widget reads the channel again at once, as after a connect or a disconnect.
  if (channel !== undefined) forgetChatRoute(channel.storeId)
})
