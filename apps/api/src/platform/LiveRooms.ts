import { LiveRooms } from "@insyte/modules/live/domain/Ports"
import { env } from "cloudflare:workers"
import { Effect, Layer } from "effect"
import { liveRoomOf } from "./LiveRoom.ts"

/*
 * The live rooms (M14 step 3) as the slice's port: one `LiveRoomDurableObject` per workspace, reached by name. A room
 * that cannot be reached is logged and passed over: Live shows nobody for a moment, and no pixel event or page fails
 * over it. The pixel posts to this stage's public API host (`PUBLIC_API_HOST`), the one the storefront can reach.
 */

const call = <A>(name: string, fallback: A, run: () => Promise<A>): Effect.Effect<A> =>
  Effect.tryPromise(run).pipe(
    Effect.catch((error) => Effect.as(Effect.logWarning(`live room ${name} failed: ${String(error)}`), fallback)),
    Effect.withSpan(`LiveRooms.${name}`)
  )

export const LiveRoomsLive = Layer.succeed(LiveRooms)(LiveRooms.of({
  snapshot: (workspaceId) =>
    call("snapshot", { visitors: [], events: [] }, async () => {
      const { visitors, events } = await liveRoomOf(workspaceId).snapshot()
      return { visitors: [...visitors], events: [...events] }
    }),
  subscribe: (input) =>
    call("subscribe", undefined, () =>
      liveRoomOf(input.workspaceId).subscribe(
        input.workspaceId,
        input.tab,
        input.memberId,
        input.stores === "all" ? "all" : [...input.stores],
        input.seconds
      )),
  unsubscribe: (workspaceId, tab) => call("unsubscribe", undefined, () => liveRoomOf(workspaceId).unsubscribe(tab)),
  hit: (workspaceId, hit) => call("hit", undefined, () => liveRoomOf(workspaceId).hit(workspaceId, hit)),
  endpoint: (storeId) =>
    env.PUBLIC_API_HOST === undefined || env.PUBLIC_API_HOST === ""
      ? null
      : `https://${env.PUBLIC_API_HOST}/api/public/pixel/${encodeURIComponent(storeId)}`
}))
