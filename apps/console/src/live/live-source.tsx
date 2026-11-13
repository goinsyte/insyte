import { useAtomSet } from "@effect/atom-react"
import type { LiveVisitors } from "@insyte/api/Frames"
import type {
  LiveEvent as RoomEvent,
  LiveSale,
  LiveSnapshot,
  LiveVisitor as RoomVisitor
} from "@insyte/modules/live/domain/Live"
import type { Currency } from "@insyte/ui/app/lib/types/domain"
import type { LiveFeedEvent, LiveSource, LiveVisitor } from "@insyte/ui/app/live/live-source"
import { useEffect, useMemo, useRef, useState } from "react"
import { liveSignals, liveWrites, tabId } from "../data/live.ts"

/*
 * `/live`'s source in the console (M14 step 3): `Live.snapshot` once the page is open, then the room's `live.visitors`
 * frames on the tab's socket while it holds a lease (renewed every 30 s, let go when the page pauses or closes). After
 * the socket comes back it reads the snapshot again, so nothing missed stays. The feed's sales are real orders from the
 * snapshot, which reads again on every order (`LIVE`). Times are moved onto this laptop's clock by the server's `at`.
 */

/** The lease is 60 s; renewing at half keeps one late renewal from losing the frames. */
const RENEW_MS = 30_000
/** Frames this young are applied again over a new snapshot: one read just before them would undo them. */
const REPLAY_MS = 5_000
const EVENTS_KEPT = 60

const regions = (() => {
  try {
    return new Intl.DisplayNames(["nl"], { type: "region" })
  } catch {
    return undefined
  }
})()

/** A country's Dutch name ("NL" → "Nederland"); empty when Cloudflare could not place the visitor. */
const countryName = (code: string | null) => {
  if (code === null || code === "" || code === "XX") return ""
  try {
    return regions?.of(code) ?? code
  } catch {
    return code
  }
}

const visitorOf = (v: RoomVisitor, skew: number): LiveVisitor => ({
  id: v.id,
  city: v.city,
  country: countryName(v.country),
  lon: v.lon,
  lat: v.lat,
  source: v.source,
  device: v.device,
  stage: v.stage,
  page: v.page,
  arrivedAt: v.arrivedAt + skew,
  movedAt: v.movedAt + skew,
  returning: v.returning
})

const eventOf = (e: RoomEvent, skew: number): LiveFeedEvent => ({
  id: e.id,
  at: e.at + skew,
  kind: e.kind,
  visitor: visitorOf(e.visitor, skew)
})

/** A sale in the feed: its order, said as the design says a purchase, from the order's shipping city. */
const saleOf = (s: LiveSale, skew: number): LiveFeedEvent => ({
  id: `sale-${s.orderId}`,
  at: s.at + skew,
  kind: "bought",
  visitor: {
    id: `sale-${s.orderId}`,
    city: s.city ?? "",
    country: countryName(s.country),
    lon: 0,
    lat: 0,
    source: "",
    device: "desktop",
    stage: "bought",
    page: "",
    arrivedAt: s.at + skew,
    movedAt: s.at + skew,
    returning: false
  },
  amount: s.totalMinor === null ? undefined : s.totalMinor / 100,
  order: s.number
})

/** "Northwind US", "Northwind US en EU", "A, B en C". */
const storesLabel = (names: ReadonlyArray<string>) =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} en ${names.at(-1)}`

interface Room {
  readonly visitors: ReadonlyMap<string, LiveVisitor>
  readonly events: ReadonlyArray<LiveFeedEvent>
}

const applyFrame = (room: Room, frame: LiveVisitors, skew: number): Room => {
  const visitors = new Map(room.visitors)
  for (const id of frame.removed) visitors.delete(id)
  for (const v of frame.upserts) visitors.set(v.id, visitorOf(v, skew))
  const known = new Set(room.events.map((e) => e.id))
  const fresh = frame.events.filter((e) => !known.has(e.id)).map((e) => eventOf(e, skew))
  const events = fresh.length === 0
    ? room.events
    : [...fresh, ...room.events].toSorted((a, b) => b.at - a.at).slice(0, EVENTS_KEPT)
  return { visitors, events }
}

export type LiveRead =
  | { readonly state: "waiting" }
  | { readonly state: "failed"; readonly retry: () => void }
  | { readonly state: "loaded"; readonly snapshot: LiveSnapshot; readonly refresh: () => void }

export function useConsoleLiveSource(read: LiveRead): LiveSource {
  const subscribe = useAtomSet(liveWrites.subscribe, { mode: "promiseExit" })
  const unsubscribe = useAtomSet(liveWrites.unsubscribe, { mode: "promiseExit" })
  const [paused, setPaused] = useState(false)
  const [open, setOpen] = useState(liveSignals.isOpen)
  const [wasOpen, setWasOpen] = useState(liveSignals.isOpen)
  const snapshot = read.state === "loaded" ? read.snapshot : undefined
  const skew = useMemo(() => (snapshot === undefined ? 0 : Date.now() - snapshot.at), [snapshot])
  const [room, setRoom] = useState<Room>({ visitors: new Map(), events: [] })
  const recent = useRef<Array<{ readonly at: number; readonly frame: LiveVisitors }>>([])
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const refresh = read.state === "loaded" ? read.refresh : undefined
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

  // A new snapshot is the room as it was read; the frames just before it go on top again.
  useEffect(() => {
    if (snapshot === undefined) return
    const now = Date.now()
    recent.current = recent.current.filter((f) => now - f.at < REPLAY_MS)
    let next: Room = {
      visitors: new Map(snapshot.visitors.map((v) => [v.id, visitorOf(v, skew)])),
      events: snapshot.events.map((e) => eventOf(e, skew))
    }
    for (const { frame } of recent.current) next = applyFrame(next, frame, skew)
    setRoom(next)
  }, [snapshot, skew])

  // The socket: its frames while not paused, and a fresh read each time it opens again.
  useEffect(() =>
    liveSignals.listen((signal) => {
      if (signal.type === "open") {
        setOpen(true)
        setWasOpen(true)
        refreshRef.current?.()
      } else if (signal.type === "down") {
        setOpen(false)
      } else if (!pausedRef.current) {
        recent.current = [...recent.current.filter((f) => Date.now() - f.at < REPLAY_MS), {
          at: Date.now(),
          frame: signal.frame
        }]
        setRoom((r) => applyFrame(r, signal.frame, skew))
      }
    }), [skew])

  // The lease: held while the socket is open and the page is not paused.
  useEffect(() => {
    if (!open || paused) return
    const payload = { tab: tabId() }
    void subscribe({ payload })
    const renew = window.setInterval(() => void subscribe({ payload }), RENEW_MS)
    return () => {
      window.clearInterval(renew)
      void unsubscribe({ payload })
    }
  }, [open, paused, subscribe, unsubscribe])

  const sales = useMemo(() => snapshot?.sales.map((s) => saleOf(s, skew)) ?? [], [snapshot, skew])
  const events = useMemo(
    () => [...room.events, ...sales].toSorted((a, b) => b.at - a.at).slice(0, EVENTS_KEPT),
    [room.events, sales]
  )
  const visitors = useMemo(() => [...room.visitors.values()], [room.visitors])

  const connection: LiveSource["connection"] = read.state === "failed"
    ? "error"
    : snapshot === undefined || !wasOpen
    ? "connecting"
    : open
    ? "live"
    : "reconnecting"

  return {
    connection,
    pixel: snapshot?.pixel ?? "no_store",
    visitors,
    events,
    revenueToday: (snapshot?.revenueToday.minor ?? 0) / 100,
    // Any ISO code formats (Intl); the type names the design's three.
    currency: (snapshot?.revenueToday.currency ?? "EUR") as Currency,
    storesLabel: storesLabel(snapshot?.stores.map((s) => s.name) ?? []),
    paused,
    setPaused: (next) => {
      setPaused(next)
      // Back from a pause: what happened meanwhile.
      if (!next) refresh?.()
    },
    retry: read.state === "failed" ? read.retry : undefined
  }
}
