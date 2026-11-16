import { Db } from "@insyte/database/Db"
import { mintId, type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { CHAT_TEXT_MAX } from "../../../shared/domain/ChatChannel.ts"
import * as Outbox from "../../../shared/use-cases/Outbox.ts"
import type { WidgetMessage } from "../../domain/Chat.ts"
import { type WidgetClaims, WidgetKeys } from "../../domain/Ports.ts"
import { previewOf } from "../inbound.ts"

/*
 * The shopper's side of the website chat (M15 step 8), behind `/api/public/chat/*` on the API's public hostname. No
 * account and no cookie: the widget opens a session (`open`), which hands it a token signed with the stage's key and
 * bound to the store; every later request carries it. The session's id is never stored, only its keyed hash
 * (`visitor_hash`), so a token names one conversation and nothing else, and a shopper reads only their own.
 *
 * What a request may do is held here, in order: the store's chat must be on (`webchat_route`, cached per isolate for half
 * a minute), the request must come from one of the store's storefronts (its Origin, which a browser always sends on
 * these requests), the token must be ours, whole, unexpired and this store's. The limits per IP, per session and per
 * store are the route's (`ChatRoutes.ts`), taken before anything here costs a query.
 *
 * The shopper's words are data. They are stored as they came (trimmed, at most 1000 characters), escaped wherever they
 * are shown, never logged and never read as instructions: the agent (W12.2) gets them through `ChatChannel.history`.
 * A reply by the team or the agent reaches the widget once its undo window has passed (`visible_at`).
 */

/** How long a widget session holds: a shopper who comes back within it finds their conversation. */
export const SESSION_DAYS = 30
const ROUTE_TTL_MS = 30_000
const UNKNOWN_TTL_MS = 30_000
const UNKNOWN_KEPT = 10_000
/** The messages the widget is given at once: the newest. */
const HISTORY = 100

export interface ChatRoute {
  readonly workspaceId: string
  readonly storeId: string
  readonly channelId: string
  readonly storeName: string
  readonly greeting: string
  readonly color: string | null
  readonly origins: ReadonlyArray<string>
  readonly readAt: number
}

const routes = new Map<string, ChatRoute>()
const unknown = new Map<string, number>()

/** A channel changed (connected, disconnected, its greeting): this isolate reads its route again. */
export const forgetChatRoute = (storeId: string) => {
  routes.delete(storeId)
  unknown.delete(storeId)
}

/** The store's chat as the widget's requests need it, or `undefined` when it is not on. */
export const routeOf = Effect.fn("Chat.route")(function*(by: { readonly storeId?: string; readonly shop?: string }) {
  const key = by.storeId ?? `shop:${by.shop ?? ""}`
  const now = Date.now()
  if ((unknown.get(key) ?? 0) > now) return undefined
  const cached = routes.get(key)
  if (cached !== undefined && now - cached.readAt < ROUTE_TTL_MS) return cached
  const db = yield* Db
  const [row] = yield* db.routing((sql) =>
    sql<Omit<ChatRoute, "readAt">>`
      select workspace_id, store_id, channel_id, store_name, greeting, color, origins
      from webchat_route(${by.shop ?? null}, ${by.storeId ?? null})`
  )
  if (row === undefined) {
    routes.delete(key)
    if (unknown.size >= UNKNOWN_KEPT) unknown.clear()
    unknown.set(key, now + UNKNOWN_TTL_MS)
    return undefined
  }
  const route = { ...row, readAt: now }
  routes.set(key, route)
  if (by.storeId === undefined) routes.set(row.storeId, route)
  return route
})

/** Whether a request from `origin` speaks for the store: one of its storefronts, exactly. */
export const originAllowed = (origin: string | null, route: ChatRoute) =>
  origin !== null && route.origins.includes(origin.toLowerCase())

export type WidgetAnswer<A> =
  | { readonly status: 200; readonly body: A; readonly allowOrigin: string }
  | { readonly status: 304; readonly allowOrigin: string }
  | { readonly status: 400 | 401 | 403 | 404 | 409; readonly allowOrigin: string | null }
  | { readonly status: 429; readonly allowOrigin: string; readonly retryAfterSeconds: number }

/** The store's own rate limit on what its shoppers send, taken once a request is known to be theirs. */
export type Admit = (storeId: string) => Effect.Effect<{ readonly ok: boolean; readonly retryAfterSeconds: number }>

const refused = <A>(status: 400 | 401 | 403 | 404 | 409, allowOrigin: string | null = null): WidgetAnswer<A> => ({
  status,
  allowOrigin
})

/** What the widget shows before anything is said: the store's name, its welcome text and colour. */
export interface WidgetSession {
  readonly token: string
  readonly storeId: string
  readonly expiresAt: number
  readonly storeName: string
  readonly greeting: string
  readonly color: string | null
}

const inWorkspace = <A, E, R>(route: ChatRoute, f: (sql: SqlClient.SqlClient) => Effect.Effect<A, E, R>) =>
  Effect.flatMap(
    Db,
    (db) => db.scopedFor(f).pipe(Effect.provideService(CurrentWorkspace, { id: route.workspaceId as WorkspaceId }))
  )

/** A new session for a shopper on the store's storefront; one that still holds is renewed as it is. */
export const open = Effect.fn("Chat.open")(function*(input: {
  /** The theme's app embed names the shop (its myshopify domain); a widget that has a session names its store. */
  readonly shop: string | null
  readonly storeId: string | null
  readonly origin: string | null
  readonly token: string | null
}) {
  const keys = yield* WidgetKeys
  if (!keys.available) return refused<WidgetSession>(404)
  const route = input.storeId !== null
    ? yield* routeOf({ storeId: input.storeId })
    : input.shop !== null
    ? yield* routeOf({ shop: input.shop.toLowerCase() })
    : undefined
  if (route === undefined) return refused<WidgetSession>(404)
  if (!originAllowed(input.origin, route)) return refused<WidgetSession>(403)
  const allowOrigin = input.origin!
  const held = input.token === null ? undefined : yield* claimsOf(input.token, route.storeId)
  const claims: WidgetClaims = {
    storeId: route.storeId,
    sessionId: held?.sessionId ?? mintId("wss"),
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_DAYS * 86_400
  }
  return {
    status: 200,
    allowOrigin,
    body: {
      token: yield* keys.sign(claims),
      storeId: route.storeId,
      expiresAt: claims.expiresAt * 1000,
      storeName: route.storeName,
      greeting: route.greeting,
      color: route.color
    } satisfies WidgetSession
  } satisfies WidgetAnswer<WidgetSession>
})

/** The token's claims, where it is ours, unexpired and the store's. */
const claimsOf = Effect.fn("Chat.claims")(function*(token: string, storeId: string) {
  const claims = yield* (yield* WidgetKeys).verify(token)
  if (claims === undefined) return undefined
  if (claims.storeId !== storeId) return undefined
  if (claims.expiresAt * 1000 <= Date.now()) return undefined
  return claims
})

/** The request's store, origin and token, checked in that order; the conversation's key on success. */
const admit = Effect.fn("Chat.admit")(function*(input: {
  readonly storeId: string
  readonly origin: string | null
  readonly token: string | null
}) {
  const keys = yield* WidgetKeys
  if (!keys.available) return { refused: refused<never>(404) } as const
  const route = yield* routeOf({ storeId: input.storeId })
  if (route === undefined) return { refused: refused<never>(404) } as const
  if (!originAllowed(input.origin, route)) return { refused: refused<never>(403) } as const
  const allowOrigin = input.origin!
  const claims = input.token === null ? undefined : yield* claimsOf(input.token, route.storeId)
  if (claims === undefined) return { refused: refused<never>(401, allowOrigin) } as const
  return { route, allowOrigin, visitor: yield* keys.visitorHash(route.storeId, claims.sessionId) } as const
})

export interface WidgetThread {
  readonly open: boolean
  readonly messages: ReadonlyArray<WidgetMessage>
}

const toWidget = (m: { id: string; author: string; body: string; createdAt: Date }): WidgetMessage => ({
  id: m.id,
  from: m.author === "shopper" ? "shopper" : "store",
  text: m.body,
  at: m.createdAt.getTime()
})

/** The session's conversation: its latest, with what may be shown of it, and a tag for "nothing new". */
const threadOf = (sql: SqlClient.SqlClient, route: ChatRoute, visitor: string) =>
  Effect.map(
    sql<{ id: string; closedAt: Date | null }>`
      select id, closed_at from channel_threads
      where store_id = ${route.storeId} and visitor_hash = ${visitor} and deleted_at is null and spam_at is null
      order by closed_at is null desc, created_at desc limit 1`,
    (rows) => rows[0]
  )

/** `GET messages`: what the shopper sees of their conversation; `etag` answers "nothing new" without the body. */
export const read = Effect.fn("Chat.read")(function*(input: {
  readonly storeId: string
  readonly origin: string | null
  readonly token: string | null
  readonly etag: string | null
}) {
  const admitted = yield* admit(input)
  if ("refused" in admitted) return admitted.refused as WidgetAnswer<WidgetThread & { readonly etag: string }>
  const { route, allowOrigin, visitor } = admitted
  return yield* inWorkspace(route, (sql) =>
    Effect.gen(function*() {
      const thread = yield* threadOf(sql, route, visitor)
      if (thread === undefined) {
        return { status: 200, allowOrigin, body: { open: true, messages: [], etag: "0" } } as const
      }
      const rows = yield* sql<{ id: string; author: string; body: string; createdAt: Date }>`
        select * from (
          select id, author, body, created_at from channel_messages
          where thread_id = ${thread.id} and visible_at <= now() and author <> 'system'
          order by created_at desc, id desc limit ${HISTORY}
        ) m order by created_at, id`
      const last = rows.at(-1)
      const etag = `${thread.id}.${rows.length}.${last?.id ?? ""}.${thread.closedAt === null ? 1 : 0}`
      if (input.etag === etag) return { status: 304, allowOrigin } as const
      return {
        status: 200,
        allowOrigin,
        body: { open: thread.closedAt === null, messages: rows.map(toWidget), etag }
      } as const
    }))
})

/** `POST messages`: the shopper says something. A closed conversation, or none yet, is begun anew. */
export const post = Effect.fn("Chat.post")(function*(input: {
  readonly storeId: string
  readonly origin: string | null
  readonly token: string | null
  readonly text: unknown
  readonly admitStore: Admit
}) {
  const admitted = yield* admit(input)
  if ("refused" in admitted) return admitted.refused as WidgetAnswer<WidgetMessage>
  const { route, allowOrigin, visitor } = admitted
  const text = typeof input.text === "string" ? input.text.trim() : ""
  if (text === "" || text.length > CHAT_TEXT_MAX) return refused<WidgetMessage>(400, allowOrigin)
  const taken = yield* input.admitStore(route.storeId)
  if (!taken.ok) {
    return { status: 429, allowOrigin, retryAfterSeconds: taken.retryAfterSeconds } satisfies WidgetAnswer<
      WidgetMessage
    >
  }
  return yield* inWorkspace(route, (sql) =>
    Effect.gen(function*() {
      const id = mintId("chm")
      const party = JSON.stringify([{ name: "Websitebezoeker", email: "", team: false }])
      // The open conversation of this session, or a new one: the unique index holds one open per session.
      const [thread] = yield* sql<{ id: string }>`
        insert into channel_threads (id, workspace_id, store_id, channel_id, visitor_hash, participants,
                                     last_message_preview, last_inbound_at, has_inbound)
        values (${mintId("cht")}, ${route.workspaceId}, ${route.storeId}, ${route.channelId}, ${visitor},
                ${party}::jsonb, ${previewOf(text)}, now(), true)
        on conflict (store_id, visitor_hash) where closed_at is null and deleted_at is null
        do update set last_message_at = now(), last_message_preview = excluded.last_message_preview,
                      last_inbound_at = now(), has_inbound = true, unread = true, archived_at = null,
                      snoozed_until = null
        returning id`
      yield* sql`insert into channel_messages (id, workspace_id, thread_id, author, body)
                 values (${id}, ${route.workspaceId}, ${thread!.id}, 'shopper', ${text})`
      yield* Outbox.write(sql, route.workspaceId, {
        type: "chat.received",
        workspaceId: route.workspaceId,
        storeId: route.storeId,
        threadId: thread!.id,
        messageId: id,
        channel: "webchat"
      })
      const [m] = yield* sql<{ createdAt: Date }>`select created_at from channel_messages where id = ${id}`
      return {
        status: 200,
        allowOrigin,
        body: { id, from: "shopper", text, at: m!.createdAt.getTime() } satisfies WidgetMessage
      } as const
    }))
})

/** `POST close`: the shopper ends the conversation; the next message begins a new one. */
export const close = Effect.fn("Chat.close")(function*(input: {
  readonly storeId: string
  readonly origin: string | null
  readonly token: string | null
}) {
  const admitted = yield* admit(input)
  if ("refused" in admitted) return admitted.refused as WidgetAnswer<{ readonly closed: true }>
  const { route, allowOrigin, visitor } = admitted
  yield* inWorkspace(route, (sql) =>
    sql`update channel_threads set closed_at = now()
        where store_id = ${route.storeId} and visitor_hash = ${visitor} and closed_at is null`)
  return { status: 200, allowOrigin, body: { closed: true } } as const
})
