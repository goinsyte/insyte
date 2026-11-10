import { Frame } from "@insyte/api/Frames"
import { Effect, Option, Schedule, Schema } from "effect"
import { Reactivity } from "effect/reactivity"
import { Socket } from "effect/socket"
import { ACCESS } from "./access.ts"
import { ConsoleClient } from "./client.ts"
import { CUSTOMERS } from "./customers.ts"
import { KEYS } from "./developer.ts"
import { FIRST_ANALYSIS } from "./first-analysis.ts"
import { FRAME, NOTES, presenceAtom } from "./frame.ts"
import { ORDERS } from "./orders.ts"
import { PRODUCTS } from "./products.ts"
import { RETURNS } from "./returns.ts"
import { ACCESS_LIST, ROLES } from "./roles.ts"
import { STORE_SYNC, STORES } from "./stores.ts"
import { TEAM } from "./team.ts"
import { TICKETS } from "./tickets.ts"

/*
 * The tab's one socket (M5.1, ADR-0013): `/api/realtime` on the console's own origin. A `records.changed` frame
 * refetches the queries that show that kind, through RPC, where the permission check runs; frames never carry a
 * record. Lost, it reconnects with backoff, and after a gap refetches everything it maps, so nothing missed stays stale.
 */

/** What each kind of change refetches. A kind joins with the screen that shows it. */
const REFETCH: Record<string, ReadonlyArray<string>> = {
  member: [...TEAM, ...ROLES],
  invitation: TEAM,
  invite_link: TEAM,
  role: [...ROLES, ...TEAM],
  access_request: [...ACCESS, ...ACCESS_LIST],
  api_key: KEYS,
  store: [...STORES, ...STORE_SYNC, ...ORDERS, ...CUSTOMERS, ...PRODUCTS],
  order: [...ORDERS, ...CUSTOMERS],
  customer: CUSTOMERS,
  product: PRODUCTS,
  first_analysis: FIRST_ANALYSIS,
  return: RETURNS,
  ticket: TICKETS
}
const EVERYTHING = [...new Set(Object.values(REFETCH).flat())]

const decodeFrame = Schema.decodeUnknownOption(Schema.fromJsonString(Frame))
const text = new TextDecoder()

/** One connection: its frames until it closes. `reconnected` refetches everything once it says hello. */
const connection = (reconnected: boolean, present: (memberIds: ReadonlyArray<string>) => void) =>
  Effect.gen(function*() {
    const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/realtime`
    const reader = yield* (yield* Socket.makeWebSocket(url)).reader
    while (true) {
      const keys = new Set<string>()
      for (const chunk of yield* reader.pull) {
        const frame = decodeFrame(typeof chunk === "string" ? chunk : text.decode(chunk))
        if (Option.isNone(frame)) continue
        if (frame.value.type === "hello" || frame.value.type === "presence") {
          present(frame.value.presence.map((p) => p.memberId))
        }
        if (frame.value.type === "hello" && reconnected) { for (const key of EVERYTHING) keys.add(key) }
        if (frame.value.type === "notes.changed") { for (const key of [...NOTES, ...FRAME]) keys.add(key) }
        if (frame.value.type === "records.changed") { for (const key of REFETCH[frame.value.kind] ?? []) keys.add(key) }
        // A store's import moved on: its counts, and the store itself once it is in.
        if (frame.value.type === "job.progress") {
          for (const key of frame.value.label === "done" ? [...STORE_SYNC, ...STORES] : STORE_SYNC) keys.add(key)
        }
      }
      if (keys.size > 0) yield* Reactivity.invalidate([...keys])
    }
  }).pipe(Effect.scoped)

/** Mounted while a signed-in screen is open (`LiveUpdates`); the socket closes when the last one unmounts. */
export const realtimeAtom = ConsoleClient.runtime.atom((get) =>
  Effect.suspend(() => {
    let attempts = 0
    const present = (memberIds: ReadonlyArray<string>) => get.set(presenceAtom, memberIds)
    return Effect.suspend(() => connection(attempts++ > 0, present)).pipe(
      // Doubling from half a second, never more than 30 s apart, for as long as the screen is open.
      Effect.retry(Schedule.min([Schedule.exponential("500 millis"), Schedule.spaced("30 seconds")])),
      Effect.provide(Socket.layerWebSocketConstructorGlobal)
    )
  })
)
