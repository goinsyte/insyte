import type { LiveEvent, LiveVisitor, PixelEvent, PixelHit, Stage } from "./Live.ts"

/*
 * The live room's rules (M14 step 3), pure so the Durable Object holds state and timers and nothing else: what a pixel
 * event does to a visitor, what the feed says about it, and when a visitor is gone. A visitor leaves 30 minutes after
 * their last event; one who bought stays on the map for 15 seconds, as the design's sale does.
 *
 * The room is capped: the pixel's key is public, so a script can post events with a fresh client id each time. Past
 * `MAX_SESSIONS_PER_STORE` visitors on one store, or `MAX_SESSIONS` in the room, a new visitor is not taken (those
 * already there still move), so memory and the snapshot stay bounded and a flood on one store leaves the others room.
 */

export const SESSION_TTL_MS = 30 * 60_000
export const BOUGHT_SHOWN_MS = 15_000
export const EVENTS_KEPT = 60
/** The country of a request Cloudflare could not place. */
export const UNKNOWN_COUNTRY = "XX"
/** Far above a busy store's visitors in 30 minutes on a map; enough to keep forged ones from filling memory. */
export const MAX_SESSIONS_PER_STORE = 2_000
export const MAX_SESSIONS = 5_000

export interface Session extends LiveVisitor {
  readonly lastAt: number
}

export interface Room {
  readonly sessions: Map<string, Session>
  /** Sessions per store, for the cap. */
  readonly perStore: Map<string, number>
  /** Newest first, at most `EVENTS_KEPT`. */
  events: Array<LiveEvent>
  seq: number
}

export const emptyRoom = (): Room => ({ sessions: new Map(), perStore: new Map(), events: [], seq: 0 })

const remove = (room: Room, id: string) => {
  const s = room.sessions.get(id)
  if (s === undefined) return
  room.sessions.delete(id)
  const left = (room.perStore.get(s.storeId) ?? 1) - 1
  if (left <= 0) room.perStore.delete(s.storeId)
  else room.perStore.set(s.storeId, left)
}

/** The stage an event moves a visitor to: forward through the funnel, and back to looking after a sale. */
const nextStage = (from: Stage | undefined, type: PixelHit["type"]): Stage => {
  switch (type) {
    case "product_added_to_cart":
      return from === "checkout" ? "checkout" : "cart"
    case "checkout_started":
      return "checkout"
    case "checkout_completed":
      return "bought"
    default:
      return from === undefined || from === "bought" ? "browsing" : from
  }
}

const visitorOf = (s: Session): LiveVisitor => {
  const { lastAt: _, ...visitor } = s
  return visitor
}

/**
 * One pixel event: the visitor as they are now, and what the feed says, if it says anything; `undefined` when the
 * visitor is new and the room or their store is full.
 */
export const apply = (
  room: Room,
  hit: PixelHit
): { readonly visitor: LiveVisitor; readonly event?: LiveEvent } | undefined => {
  const before = room.sessions.get(hit.visitorId)
  if (
    before === undefined &&
    (room.sessions.size >= MAX_SESSIONS || (room.perStore.get(hit.storeId) ?? 0) >= MAX_SESSIONS_PER_STORE)
  ) return undefined
  const stage = nextStage(before?.stage, hit.type)
  // The checkout has no page worth naming, and the cart keeps the product that went into it.
  const page = hit.type === "checkout_started" || hit.type === "checkout_completed"
    ? before?.page ?? hit.page
    : hit.page
  // Where Cloudflare could not tell, the visitor stays where they were first seen.
  const place = hit.country === UNKNOWN_COUNTRY && before !== undefined ? before : hit
  const session: Session = {
    id: hit.visitorId,
    storeId: hit.storeId,
    city: place.city,
    country: place.country,
    lon: place.lon,
    lat: place.lat,
    source: before?.source ?? hit.source,
    device: hit.device,
    stage,
    page,
    arrivedAt: before?.arrivedAt ?? hit.at,
    movedAt: before === undefined || before.stage !== stage ? hit.at : before.movedAt,
    returning: before?.returning ?? hit.returning,
    lastAt: hit.at
  }
  room.sessions.set(hit.visitorId, session)
  if (before === undefined) room.perStore.set(hit.storeId, (room.perStore.get(hit.storeId) ?? 0) + 1)
  const visitor = visitorOf(session)
  // A sale is said by its order (`Live.snapshot.sales`), never by the pixel, so the feed shows a real, clickable order.
  const kind = before === undefined
    ? "arrive"
    : stage !== before.stage && (stage === "cart" || stage === "checkout")
    ? stage
    : undefined
  if (kind === undefined) return { visitor }
  room.seq += 1
  const event: LiveEvent = { id: `${hit.visitorId}-${room.seq}`, at: hit.at, kind, visitor }
  room.events = [event, ...room.events].slice(0, EVENTS_KEPT)
  return { visitor, event }
}

/** The visitors who have gone: silent for 30 minutes, or 15 seconds past their sale. Removed from the room. */
export const sweep = (room: Room, now: number): ReadonlyArray<string> => {
  const gone: Array<string> = []
  for (const [id, s] of room.sessions) {
    if (now - s.lastAt >= SESSION_TTL_MS || (s.stage === "bought" && now - s.movedAt >= BOUGHT_SHOWN_MS)) {
      remove(room, id)
      gone.push(id)
    }
  }
  return gone
}

/** At most this many visitors in a snapshot, and in one frame: the most recently active first. */
export const VISITORS_SHOWN = 1_000

/** The visitors, the most recently active first, at most `limit`. */
export const visitorsOf = (room: Room, limit = VISITORS_SHOWN): ReadonlyArray<LiveVisitor> =>
  // A fresh array, so sorting it in place changes nothing else (`toSorted` is past this package's `lib`).
  // oxlint-disable-next-line unicorn/no-array-sort
  [...room.sessions.values()].sort((a, b) => b.lastAt - a.lastAt).slice(0, limit).map(visitorOf)

/* ── reading a pixel event ─────────────────────────────────────────────────────────────────────── */

const META = new Set(["facebook", "fb", "meta", "instagram", "ig"])

/**
 * Where a visitor came from, in the design's words: paid Meta traffic, Google, Instagram, Klaviyo, a link straight to
 * the store, or the referring site's host (the store's own host is no referrer).
 */
export const sourceOf = (source: PixelEvent["source"], ownHosts: ReadonlyArray<string>): string => {
  const utm = source.utmSource?.trim().toLowerCase()
  const medium = source.utmMedium?.trim().toLowerCase() ?? ""
  const referrer = source.referrer?.trim().toLowerCase().replace(/^www\./, "")
  if (source.clickId === "fb" || (utm !== undefined && META.has(utm) && /paid|cpc|cpm|ad/.test(medium))) {
    return "Meta ads"
  }
  if (utm === "klaviyo" || referrer?.includes("klaviyo") === true) return "Klaviyo"
  if (utm === "instagram" || utm === "ig" || referrer?.includes("instagram.") === true) return "Instagram"
  if (source.clickId === "g" || utm === "google" || /(^|\.)google\./.test(referrer ?? "")) return "Google"
  if (utm !== undefined && utm.length > 0) return utm
  if (referrer === undefined || referrer.length === 0) return "Direct"
  return ownHosts.some((h) => h.replace(/^www\./, "") === referrer) ? "Direct" : referrer
}

/** A document title without the store's name after it ("Jassen – Northwind" → "Jassen"). */
export const pageOf = (title: string, type: PixelEvent["type"]): string => {
  if (type === "checkout_started" || type === "checkout_completed") return "Afrekenen"
  const trimmed = title.trim()
  const cut = trimmed.split(/\s+[–|—-]\s+/)[0] ?? trimmed
  return (cut.length > 0 ? cut : "Homepagina").slice(0, 80)
}
