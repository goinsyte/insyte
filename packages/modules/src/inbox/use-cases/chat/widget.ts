import { Db } from "@insyte/database/Db"
import { mintId, type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import * as Outbox from "../../../shared/use-cases/Outbox.ts"
import type { WidgetMessage } from "../../domain/Chat.ts"
import { textRefused } from "../../domain/ChatKinds.ts"
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
 * these requests), the token must be ours, whole, unexpired and this store's, and its session not ended. The limits per
 * IP are the route's (`chat/Routes.ts`), taken before anything here costs a query; the ones per session, per store and on
 * new conversations are taken here (`take`), once the token is known to be ours, so a forged one spends nothing of a
 * real session's or a store's.
 *
 * A session lasts a day from the widget's last opening (every page load opens it again): one left unused for a day
 * starts afresh, and so does one whose shopper ended the conversation ("Gesprek beëindigen"), which the server holds
 * as ended from then on. The widget reads only its session's open conversation, never a closed one, and a conversation
 * nobody wrote in for a day is over too: the next message begins a new one (`IDLE_HOURS`).
 *
 * The shopper's words are data. They are stored as they came (trimmed, at most 1000 characters), escaped wherever they
 * are shown, never logged and never read as instructions: the agent (W12.2) gets them through `ChatChannel.history`.
 * A reply by the team or the agent reaches the widget once its undo window has passed (`visible_at`).
 */

/** How long a widget session holds since its last opening: a shopper back within it finds their conversation. */
export const SESSION_HOURS = 24
/** How long a conversation stays the widget's without a word from either side. */
export const IDLE_HOURS = 24
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

/**
 * A channel changed (connected, disconnected, its greeting): this isolate reads its route again, by store and by shop,
 * and forgets which stores it found no chat at. Another isolate may answer as before until its copy is half a minute old.
 */
export const forgetChatRoute = (storeId: string) => {
  for (const [key, route] of routes) if (key === storeId || route.storeId === storeId) routes.delete(key)
  unknown.clear()
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

/**
 * The limits taken once a request is known to be the store's and the session's: what one session reads and sends, what
 * the store's shoppers send together, and how many new conversations the store takes a minute and a day.
 */
export type WidgetLimit = "session-read" | "session-send" | "store-send" | "store-threads-minute" | "store-threads-day"
export type Take = (
  limit: WidgetLimit,
  key: string
) => Effect.Effect<{ readonly ok: boolean; readonly retryAfterSeconds: number }>

const over = <A>(allowOrigin: string, taken: { readonly ok: boolean; readonly retryAfterSeconds: number }) =>
  taken.ok ? undefined : ({ status: 429, allowOrigin, retryAfterSeconds: taken.retryAfterSeconds } as WidgetAnswer<A>)

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
  // A session its shopper ended is not renewed: the next is a new one.
  const live = held !== undefined && !(yield* ended(route, yield* keys.visitorHash(route.storeId, held.sessionId)))
  const claims: WidgetClaims = {
    storeId: route.storeId,
    sessionId: live ? held.sessionId : mintId("wss"),
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_HOURS * 3_600
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

/** Whether the session's shopper ended a conversation: the session ends with it. */
const ended = (route: ChatRoute, visitor: string) =>
  inWorkspace(route, (sql) =>
    Effect.map(
      sql<{ one: number }>`
        select 1 as one from channel_threads
        where store_id = ${route.storeId} and visitor_hash = ${visitor} and closed_by = 'shopper' limit 1`,
      (rows) => rows.length > 0
    ))

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
  const visitor = yield* keys.visitorHash(route.storeId, claims.sessionId)
  if (yield* ended(route, visitor)) return { refused: refused<never>(401, allowOrigin) } as const
  return { route, allowOrigin, visitor } as const
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

/**
 * The session's open conversation, never a closed one (the next person on a shared device reads nothing of it). One
 * the team marked as spam is still the shopper's: the widget answers as ever.
 */
const threadOf = (sql: SqlClient.SqlClient, route: ChatRoute, visitor: string) =>
  Effect.map(
    sql<{ id: string; spamAt: Date | null }>`
      select id, spam_at from channel_threads
      where store_id = ${route.storeId} and visitor_hash = ${visitor} and closed_at is null and deleted_at is null
        and last_message_at > now() - make_interval(hours => ${IDLE_HOURS})
      order by created_at desc limit 1`,
    (rows) => rows[0]
  )

/** `GET messages`: what the shopper sees of their conversation; `etag` answers "nothing new" without the body. */
export const read = Effect.fn("Chat.read")(function*(input: {
  readonly storeId: string
  readonly origin: string | null
  readonly token: string | null
  readonly etag: string | null
  readonly take: Take
}) {
  type Answer = WidgetAnswer<WidgetThread & { readonly etag: string }>
  const admitted = yield* admit(input)
  if ("refused" in admitted) return admitted.refused as Answer
  const { route, allowOrigin, visitor } = admitted
  const limited = over<WidgetThread & { readonly etag: string }>(
    allowOrigin,
    yield* input.take("session-read", visitor)
  )
  if (limited !== undefined) return limited
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
      const etag = `${thread.id}.${rows.length}.${last?.id ?? ""}`
      if (input.etag === etag) return { status: 304, allowOrigin } as const
      return { status: 200, allowOrigin, body: { open: true, messages: rows.map(toWidget), etag } } as const
    }))
})

/** `POST messages`: the shopper says something. A closed conversation, or none yet, is begun anew. */
export const post = Effect.fn("Chat.post")(function*(input: {
  readonly storeId: string
  readonly origin: string | null
  readonly token: string | null
  readonly text: unknown
  readonly take: Take
}) {
  const admitted = yield* admit(input)
  if ("refused" in admitted) return admitted.refused as WidgetAnswer<WidgetMessage>
  const { route, allowOrigin, visitor } = admitted
  const text = typeof input.text === "string" ? input.text.trim() : ""
  if (textRefused(text) !== undefined) return refused<WidgetMessage>(400, allowOrigin)
  // The session first, then a new conversation against the store's caps, then the store's whole.
  const session = over<WidgetMessage>(allowOrigin, yield* input.take("session-send", visitor))
  if (session !== undefined) return session
  const current = yield* inWorkspace(route, (sql) => threadOf(sql, route, visitor))
  if (current === undefined) {
    for (const cap of ["store-threads-minute", "store-threads-day"] as const) {
      const capped = over<WidgetMessage>(allowOrigin, yield* input.take(cap, route.storeId))
      if (capped !== undefined) return capped
    }
  }
  const store = over<WidgetMessage>(allowOrigin, yield* input.take("store-send", route.storeId))
  if (store !== undefined) return store
  return yield* inWorkspace(route, (sql) =>
    Effect.gen(function*() {
      const id = mintId("chm")
      const party = JSON.stringify([{ name: "Websitebezoeker", email: "", team: false }])
      // A conversation left for a day is over: this message begins the next.
      yield* sql`update channel_threads set closed_at = now(), closed_by = 'idle'
                 where store_id = ${route.storeId} and visitor_hash = ${visitor} and closed_at is null
                   and deleted_at is null and last_message_at <= now() - make_interval(hours => ${IDLE_HOURS})`
      // The open conversation of this session, or a new one: the unique index holds one open per session. One the
      // team marked as spam takes the message as read, and nobody hears of it.
      const [thread] = yield* sql<{ id: string; spam: boolean }>`
        insert into channel_threads (id, workspace_id, store_id, channel_id, visitor_hash, participants,
                                     last_message_preview, last_inbound_at, has_inbound)
        values (${mintId("cht")}, ${route.workspaceId}, ${route.storeId}, ${route.channelId}, ${visitor},
                ${party}::jsonb, ${previewOf(text)}, now(), true)
        on conflict (store_id, visitor_hash) where closed_at is null and deleted_at is null
        do update set last_message_at = now(), last_message_preview = excluded.last_message_preview,
                      last_inbound_at = now(), has_inbound = true,
                      unread = channel_threads.spam_at is null,
                      archived_at = case when channel_threads.spam_at is null then null
                                         else channel_threads.archived_at end,
                      snoozed_until = case when channel_threads.spam_at is null then null
                                           else channel_threads.snoozed_until end
        returning id, spam_at is not null as spam`
      yield* sql`insert into channel_messages (id, workspace_id, thread_id, author, body)
                 values (${id}, ${route.workspaceId}, ${thread!.id}, 'shopper', ${text})`
      if (!thread!.spam) {
        yield* Outbox.write(sql, route.workspaceId, {
          type: "chat.received",
          workspaceId: route.workspaceId,
          storeId: route.storeId,
          threadId: thread!.id,
          messageId: id,
          channel: "webchat"
        })
      }
      const [m] = yield* sql<{ createdAt: Date }>`select created_at from channel_messages where id = ${id}`
      return {
        status: 200,
        allowOrigin,
        body: { id, from: "shopper", text, at: m!.createdAt.getTime() } satisfies WidgetMessage
      } as const
    }))
})

/**
 * `POST close`: the shopper ends the conversation, and with it the session: the token reads and sends nothing more, and
 * the answer is a new session for the next conversation (the widget keeps no trace of the old one).
 */
export const close = Effect.fn("Chat.close")(function*(input: {
  readonly storeId: string
  readonly origin: string | null
  readonly token: string | null
}) {
  type Closed = WidgetSession & { readonly closed: true }
  const admitted = yield* admit(input)
  if ("refused" in admitted) return admitted.refused as WidgetAnswer<Closed>
  const { route, allowOrigin, visitor } = admitted
  // A session that never wrote has nothing to end: the new token is all it needs.
  yield* inWorkspace(route, (sql) =>
    sql`update channel_threads set closed_at = now(), closed_by = 'shopper'
        where store_id = ${route.storeId} and visitor_hash = ${visitor} and closed_at is null and deleted_at is null`)
  const keys = yield* WidgetKeys
  const claims: WidgetClaims = {
    storeId: route.storeId,
    sessionId: mintId("wss"),
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_HOURS * 3_600
  }
  return {
    status: 200,
    allowOrigin,
    body: {
      closed: true,
      token: yield* keys.sign(claims),
      storeId: route.storeId,
      expiresAt: claims.expiresAt * 1000,
      storeName: route.storeName,
      greeting: route.greeting,
      color: route.color
    } satisfies Closed
  } as const
})
