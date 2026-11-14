import { Frame } from "@insyte/api/Frames"
import { Effect, Option, Schedule, Schema } from "effect"
import { Reactivity } from "effect/reactivity"
import { Socket } from "effect/socket"
import { ConsoleClient } from "./client.ts"
import { tabId } from "./live.ts"
import { PORTAL } from "./supplier-portal.ts"

/*
 * The supplier portal's socket (M16): `/api/realtime?as=supplier`, its supplier's own room in the brand. A changed
 * order or product of theirs (`records.changed`, from `partner.changed`) refetches the portal; after a gap, so does the
 * next `hello`. Frames carry ids, never the record. Revoked, the room closes it and every reconnect is refused.
 */

const decodeFrame = Schema.decodeUnknownOption(Schema.fromJsonString(Frame))
const text = new TextDecoder()

const connection = (reconnected: boolean) =>
  Effect.gen(function*() {
    const scheme = location.protocol === "https:" ? "wss" : "ws"
    const url = `${scheme}://${location.host}/api/realtime?as=supplier&tab=${tabId()}`
    const reader = yield* (yield* Socket.makeWebSocket(url)).reader
    while (true) {
      let stale = false
      for (const chunk of yield* reader.pull) {
        const frame = decodeFrame(typeof chunk === "string" ? chunk : text.decode(chunk))
        if (Option.isNone(frame)) continue
        if (frame.value.type === "records.changed") stale = true
        if (frame.value.type === "hello" && reconnected) stale = true
      }
      if (stale) yield* Reactivity.invalidate(PORTAL)
    }
  }).pipe(Effect.scoped)

/** Mounted while a portal screen is open (`SupplierFrame`); the socket closes when it unmounts. */
export const supplierRealtimeAtom = ConsoleClient.runtime.atom(() =>
  Effect.suspend(() => {
    let attempts = 0
    return Effect.suspend(() => connection(attempts++ > 0)).pipe(
      // Doubling from half a second, never more than 30 s apart, for as long as the screen is open.
      Effect.retry(Schedule.min([Schedule.exponential("500 millis"), Schedule.spaced("30 seconds")])),
      Effect.provide(Socket.layerWebSocketConstructorGlobal)
    )
  })
)
