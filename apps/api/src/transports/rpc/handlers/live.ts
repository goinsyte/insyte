import { LiveRpcs } from "@insyte/api/rpc/LiveRpcs"
import { LiveService } from "@insyte/modules/live/Live"
import { Effect } from "effect"

export const LiveHandlers = LiveRpcs.toLayer(Effect.gen(function*() {
  const live = yield* LiveService
  return LiveRpcs.of({
    "Live.snapshot": () => live.snapshot,
    "Live.subscribe": (input) => live.subscribe(input),
    "Live.unsubscribe": (input) => live.unsubscribe(input),
    "Live.pixels": () => live.pixels,
    "Live.installPixel": (input) => live.installPixel(input)
  })
}))
