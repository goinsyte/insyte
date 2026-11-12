import { Db } from "@insyte/database/Db"
import { Effect, Schema } from "effect"
import { KeyHasher } from "../../developer/domain/Ports.ts"
import { PixelEvent } from "../domain/Live.ts"
import { LiveRooms } from "../domain/Ports.ts"
import { pageOf, sourceOf } from "../domain/Sessions.ts"

/*
 * The Web Pixel's ingest (M14 step 3; api.md §4.4), behind `POST /api/public/pixel/:storeId`: which workspace the
 * store is in and its key's hash (`route_pixel`, kept per isolate for a minute so a busy store does not ask Postgres on
 * every page view; a repaired key reaches every isolate within that minute), the key checked, the event read, and the visitor handed to the workspace's live room. Nothing about
 * the visitor is written anywhere: Shopify's client id is hashed with the store before it leaves this function, the IP
 * is not seen here at all, and the only write is the store's `last_event_at`, at most once a minute.
 */

export interface Geo {
  readonly city: string
  readonly country: string
  readonly lon: number
  readonly lat: number
}

export interface IngestAnswer {
  readonly status: 204 | 400 | 403 | 404
  /** The origin to allow in the answer's CORS headers: the request's, when it is one of the store's. */
  readonly allowOrigin: string | null
}

interface Route {
  readonly workspaceId: string
  readonly ingestKeyHash: string
  readonly origins: ReadonlyArray<string>
  readonly readAt: number
}

const ROUTE_TTL_MS = 60_000
const SEEN_EVERY_MS = 60_000
/** Per isolate: a store's route and when its `last_event_at` was last touched from here. */
const routes = new Map<string, Route>()
const seen = new Map<string, number>()

const decode = Schema.decodeUnknownOption(PixelEvent)

/** The hash a key is kept and checked as: the server's HMAC, named for pixels so it equals no API key's. */
export const keyHash = (key: string) => Effect.flatMap(Effect.service(KeyHasher), (h) => h.hash(`pixel:${key}`))

/**
 * A store's key changed (a repair): this isolate reads its route again. Another isolate may take the old key until its
 * copy is a minute old.
 */
export const forgetRoute = (storeId: string) => {
  routes.delete(storeId)
}

const readRoute = Effect.fn("Live.routePixel")(function*(storeId: string) {
  const db = yield* Db
  const [row] = yield* db.routing((sql) =>
    sql<{ workspaceId: string; ingestKeyHash: string; origins: ReadonlyArray<string> }>`
      select workspace_id, ingest_key_hash, origins from route_pixel(${storeId})`
  )
  if (row === undefined) {
    routes.delete(storeId)
    return undefined
  }
  const route = { ...row, readAt: Date.now() }
  routes.set(storeId, route)
  return route
})

/** Whether a request from `origin` may post for this store: its storefronts, or Shopify's sandbox (an opaque origin). */
export const originAllowed = (origin: string | null, origins: ReadonlyArray<string>) =>
  origin === null || origin === "null" || origins.includes(origin)

/** The store's own hosts, so a visitor moving between its pages is not "referred" by it. */
const hostsOf = (origins: ReadonlyArray<string>) =>
  origins.flatMap((o) => {
    try {
      return [new URL(o).host]
    } catch {
      return []
    }
  })

export const ingest = Effect.fn("Live.ingest")(function*(input: {
  readonly storeId: string
  readonly origin: string | null
  readonly body: unknown
  readonly geo: Geo
}) {
  const cached = routes.get(input.storeId)
  let route = cached !== undefined && Date.now() - cached.readAt < ROUTE_TTL_MS
    ? cached
    : yield* readRoute(input.storeId)
  if (route === undefined) return { status: 404, allowOrigin: null } satisfies IngestAnswer
  if (!originAllowed(input.origin, route.origins)) return { status: 403, allowOrigin: null } satisfies IngestAnswer
  const allowOrigin = input.origin
  const event = decode(input.body)
  if (event._tag === "None") return { status: 400, allowOrigin } satisfies IngestAnswer
  const hash = yield* keyHash(event.value.key)
  // A repaired key is new: a cached route with the old hash is read again once before the key is refused.
  if (hash !== route.ingestKeyHash && route === cached) route = yield* readRoute(input.storeId)
  if (route === undefined || hash !== route.ingestKeyHash) return { status: 403, allowOrigin } satisfies IngestAnswer

  const hasher = yield* KeyHasher
  const visitorId = (yield* hasher.hash(`pixel-client:${input.storeId}:${event.value.clientId}`)).slice(0, 20)
  yield* (yield* LiveRooms).hit(route.workspaceId, {
    storeId: input.storeId,
    visitorId,
    type: event.value.type,
    ...input.geo,
    source: sourceOf(event.value.source, hostsOf(route.origins)),
    device: event.value.device,
    page: pageOf(event.value.page, event.value.type),
    returning: event.value.returning,
    at: Date.now()
  })

  if (Date.now() - (seen.get(input.storeId) ?? 0) >= SEEN_EVERY_MS) {
    seen.set(input.storeId, Date.now())
    const db = yield* Db
    yield* db.routing((sql) => sql`select pixel_seen(${input.storeId})`)
  }
  return { status: 204, allowOrigin } satisfies IngestAnswer
})
