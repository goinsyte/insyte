import { Context, type Effect } from "effect"
import type { LiveEvent, LiveVisitor, PixelHit } from "./Live.ts"

/**
 * The workspace's live room (`LiveRoomDurableObject`, M14 step 3): its visitors in memory, the tabs that want its
 * frames, and where a store's pixel posts on this stage.
 */
export class LiveRooms extends Context.Service<LiveRooms, {
  readonly snapshot: (workspaceId: string) => Effect.Effect<{
    readonly visitors: ReadonlyArray<LiveVisitor>
    readonly events: ReadonlyArray<LiveEvent>
  }>
  /**
   * The tab's realtime socket gets `live.visitors` until the lease runs out, narrowed to the stores the member's role
   * may see (`all`, or those ids).
   */
  readonly subscribe: (input: {
    readonly workspaceId: string
    readonly tab: string
    readonly memberId: string
    readonly stores: "all" | ReadonlyArray<string>
    readonly seconds: number
  }) => Effect.Effect<void>
  readonly unsubscribe: (workspaceId: string, tab: string) => Effect.Effect<void>
  readonly hit: (workspaceId: string, hit: PixelHit) => Effect.Effect<void>
  /** The URL a store's pixel posts to, on this stage's public API host; `null` where the stage has none. */
  readonly endpoint: (storeId: string) => string | null
}>()("live/LiveRooms") {}
