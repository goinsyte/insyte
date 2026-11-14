import type { LiveEvent, LiveVisitor, PixelHit } from "@insyte/modules/live/domain/Live"
import { apply, emptyRoom, sweep, VISITORS_SHOWN, visitorsOf } from "@insyte/modules/live/domain/Sessions"
import { DurableObject, env } from "cloudflare:workers"
import { roomOf } from "./Room.ts"

/*
 * One live room per workspace (M14 step 3; cloudflare.md, `LIVE`): the visitors on its stores right now, in memory only,
 * and the tabs that asked for them. Nothing is written to its storage: a visitor exists while the object is in memory,
 * which every pixel event and every viewer's lease renewal keeps it; an object evicted after a quiet spell starts empty
 * and fills again with the next events. The rules are `live/domain/Sessions.ts`; this class holds the state and the
 * timer.
 *
 * Frames are batched: at most one `live.visitors` every 500 ms, sent through the workspace's realtime room to the tabs
 * that hold a lease, each narrowed to the stores its member reaches (`storeScope`). While someone watches, a sweep
 * every five seconds takes away the visitors who have gone. The room's sessions are capped (`Sessions.ts`), and so is a
 * frame: at most `VISITORS_SHOWN` upserts, the rest in the next.
 *
 * Plain Durable Object RPC, no Effect, as the other objects: the Worker reaches it through `LiveRooms.ts`.
 */

const FLUSH_MS = 500
const SWEEP_MS = 5_000

interface Subscriber {
  readonly memberId: string
  readonly stores: "all" | ReadonlyArray<string>
  readonly until: number
}

export class LiveRoomDurableObject extends DurableObject<Cloudflare.Env> {
  private readonly room = emptyRoom()
  private readonly subscribers = new Map<string, Subscriber>()
  private workspaceId: string | null = null
  private upserts = new Map<string, LiveVisitor>()
  private removed = new Set<string>()
  private fresh: Array<LiveEvent> = []
  private lastFlush = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private timerAt = 0

  /** One pixel event, from the ingest. */
  hit(workspaceId: string, hit: PixelHit): void {
    this.workspaceId = workspaceId
    const applied = apply(this.room, hit)
    // A new visitor in a full room: not taken.
    if (applied === undefined) return
    const { visitor, event } = applied
    this.upserts.set(visitor.id, visitor)
    this.removed.delete(visitor.id)
    if (event !== undefined) this.fresh.push(event)
    this.schedule(Math.max(0, FLUSH_MS - (Date.now() - this.lastFlush)))
  }

  /** The visitors and the last events now, for `Live.snapshot`. */
  snapshot(): { readonly visitors: ReadonlyArray<LiveVisitor>; readonly events: ReadonlyArray<LiveEvent> } {
    for (const id of sweep(this.room, Date.now())) this.gone(id)
    return { visitors: visitorsOf(this.room), events: this.room.events }
  }

  /** A tab takes the frames until `seconds` from now; a renewal is the same call. */
  subscribe(
    workspaceId: string,
    tab: string,
    memberId: string,
    stores: "all" | ReadonlyArray<string>,
    seconds: number
  ): void {
    this.workspaceId = workspaceId
    this.subscribers.set(tab, { memberId, stores, until: Date.now() + seconds * 1000 })
    this.schedule(SWEEP_MS)
  }

  unsubscribe(tab: string): void {
    this.subscribers.delete(tab)
  }

  private gone(id: string) {
    this.upserts.delete(id)
    this.removed.add(id)
  }

  /** Flushes in `ms`, or sooner if a flush is already due sooner. */
  private schedule(ms: number) {
    const at = Date.now() + ms
    if (this.timer !== null) {
      if (this.timerAt <= at) return
      clearTimeout(this.timer)
    }
    this.timerAt = at
    this.timer = setTimeout(() => {
      this.timer = null
      this.flush()
    }, ms)
  }

  private flush() {
    const now = Date.now()
    this.lastFlush = now
    for (const id of sweep(this.room, now)) this.gone(id)
    for (const [tab, s] of this.subscribers) if (s.until <= now) this.subscribers.delete(tab)
    const pending = [...this.upserts.values()]
    const upserts = pending.slice(0, VISITORS_SHOWN)
    const removed = [...this.removed]
    const events = this.fresh
    // Past a frame's cap the rest wait for the next flush.
    this.upserts = new Map(pending.slice(VISITORS_SHOWN).map((v) => [v.id, v]))
    this.removed = new Set()
    this.fresh = []
    if (this.subscribers.size === 0 || this.workspaceId === null) return
    if (upserts.length + removed.length + events.length > 0) {
      // One frame per store scope: most tabs see every store, and share one.
      const groups = new Map<string, { stores: Subscriber["stores"]; tabs: Array<{ tab: string; memberId: string }> }>()
      for (const [tab, s] of this.subscribers) {
        const key = s.stores === "all" ? "all" : [...s.stores].toSorted().join(",")
        const group = groups.get(key) ?? { stores: s.stores, tabs: [] }
        group.tabs.push({ tab, memberId: s.memberId })
        groups.set(key, group)
      }
      const room = roomOf(this.workspaceId)
      for (const { stores, tabs } of groups.values()) {
        const sees = (storeId: string) => stores === "all" || stores.includes(storeId)
        const frame = {
          v: 1,
          type: "live.visitors",
          upserts: upserts.filter((v) => sees(v.storeId)),
          // An id the tab never had is dropped by it; telling every tab is cheaper than remembering whose it was.
          removed,
          events: events.filter((e) => sees(e.visitor.storeId)).toReversed()
        }
        if (frame.upserts.length + frame.removed.length + frame.events.length === 0) continue
        void room.sendToTabs(tabs, frame).catch(() => {
          // The realtime room is away for a moment: the next frame, or the tab's next snapshot, catches up.
        })
      }
    }
    // While someone watches, the gone are taken away even when nobody new arrives; a cut frame goes on soon.
    this.schedule(this.upserts.size > 0 ? FLUSH_MS : SWEEP_MS)
  }
}

/** A workspace's live room. */
export const liveRoomOf = (workspaceId: string) => env.LIVE.getByName(`ws:${workspaceId}`)
