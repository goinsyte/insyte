import { Frame } from "@insyte/api/Frames"
import { Effect, Option, Schedule, Schema } from "effect"
import { Reactivity } from "effect/reactivity"
import { Socket } from "effect/socket"
import { ACCESS } from "./access.ts"
import { CHARGEBACKS } from "./chargebacks.ts"
import { CHAT_PAGES, chatKey, CHATS, type Typing, TYPING_MS, typingAtom } from "./chats.ts"
import { ConsoleClient } from "./client.ts"
import { CUSTOMERS } from "./customers.ts"
import { KEYS } from "./developer.ts"
import { FIRST_ANALYSIS } from "./first-analysis.ts"
import { FRAME, NOTES, presenceAtom } from "./frame.ts"
import { HOME } from "./home.ts"
import { INBOX } from "./inbox.ts"
import { ORDERS } from "./orders.ts"
import { PRODUCTS } from "./products.ts"
import { QUALITY } from "./quality.ts"
import { QUEUE } from "./queue.ts"
import { RETURNS } from "./returns.ts"
import { ACCESS_LIST, ROLES } from "./roles.ts"
import { STORE_SYNC, STORES } from "./stores.ts"
import { TEAM } from "./team.ts"
import { TICKETS } from "./tickets.ts"
import { WORKSPACE } from "./workspace.ts"

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
  product: [...PRODUCTS, ...QUALITY],
  first_analysis: FIRST_ANALYSIS,
  // A quality return is a complaint on its product's Kwaliteit tab (M9.4).
  return: [...RETURNS, ...QUALITY],
  quality_check: QUALITY,
  ticket: TICKETS,
  // A chargeback opened, its pack changed, accepted, or reminded of its deadline (M13).
  chargeback: CHARGEBACKS,
  // The inbox (M11 step 2): a thread read, changed, sent or arrived; a mailbox connected.
  thread: INBOX,
  mailbox: INBOX,
  // Start's queue (M10.1): its refresh says when it changed. A plate is drawn on its row (M10.2).
  queue_item: QUEUE,
  proposal: QUEUE,
  // The workspace's own settings (M3.1); its name is in the frame's store selector.
  workspace: [...WORKSPACE, ...FRAME]
}
// Start's figures (M10.3) sum over every one of these.
for (const kind of ["order", "ticket", "return", "product", "store", "member", "queue_item"]) {
  REFETCH[kind] = [...(REFETCH[kind] ?? []), ...HOME]
}
const EVERYTHING = [...new Set([...Object.values(REFETCH).flat(), ...CHATS, ...CHAT_PAGES])]

const decodeFrame = Schema.decodeUnknownOption(Schema.fromJsonString(Frame))
const text = new TextDecoder()

/** What a connection tells the tab besides what to refetch: who is here, and who is typing. */
interface Heard {
  readonly present: (memberIds: ReadonlyArray<string>) => void
  readonly typing: (t: Typing) => void
}

/** One connection: its frames until it closes. `reconnected` refetches everything once it says hello. */
const connection = (reconnected: boolean, heard: Heard) =>
  Effect.gen(function*() {
    const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/realtime`
    const reader = yield* (yield* Socket.makeWebSocket(url)).reader
    while (true) {
      const keys = new Set<string>()
      for (const chunk of yield* reader.pull) {
        const frame = decodeFrame(typeof chunk === "string" ? chunk : text.decode(chunk))
        if (Option.isNone(frame)) continue
        if (frame.value.type === "hello" || frame.value.type === "presence") {
          heard.present(frame.value.presence.map((p) => p.memberId))
        }
        if (frame.value.type === "hello" && reconnected) { for (const key of EVERYTHING) keys.add(key) }
        if (frame.value.type === "notes.changed") { for (const key of [...NOTES, ...FRAME]) keys.add(key) }
        if (frame.value.type === "records.changed") { for (const key of REFETCH[frame.value.kind] ?? []) keys.add(key) }
        // A message posted or changed (M11.4): the list's previews and counts, and that conversation's page and threads.
        if (frame.value.type === "chat.message" || frame.value.type === "chat.message.updated") {
          for (const key of [...CHATS, chatKey(frame.value.conversationId)]) keys.add(key)
        }
        if (frame.value.type === "chat.typing") {
          heard.typing({
            conversationId: frame.value.conversationId,
            principalId: frame.value.principalId,
            at: Date.now()
          })
        }
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
    const heard: Heard = {
      present: (memberIds) => get.set(presenceAtom, memberIds),
      // One entry per person and conversation, the stale ones dropped as a new one comes.
      typing: (t) =>
        get.set(typingAtom, [
          ...get.once(typingAtom).filter((x) =>
            t.at - x.at < TYPING_MS && !(x.conversationId === t.conversationId && x.principalId === t.principalId)
          ),
          t
        ])
    }
    return Effect.suspend(() => connection(attempts++ > 0, heard)).pipe(
      // Doubling from half a second, never more than 30 s apart, for as long as the screen is open.
      Effect.retry(Schedule.min([Schedule.exponential("500 millis"), Schedule.spaced("30 seconds")])),
      Effect.provide(Socket.layerWebSocketConstructorGlobal)
    )
  })
)
