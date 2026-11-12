import type { LiveVisitors } from "@insyte/api/Frames"
import { ConsoleClient } from "./client.ts"

/*
 * Live (M14 step 3): `/live` reads `Live.snapshot` in the browser once the page is open, and takes the room's
 * `live.visitors` frames on the tab's realtime socket while it holds a lease (`Live.subscribe` with the socket's tab
 * id). A sale (an order) or a store's pixel changing names `LIVE`, so the figures and the feed's sales read again.
 */

export const LIVE = ["live"] as const

export const liveSnapshotAtom = ConsoleClient.query("Live.snapshot", undefined, { reactivityKeys: LIVE })

export const pixelsAtom = ConsoleClient.query("Live.pixels", undefined, { reactivityKeys: LIVE })

export const liveWrites = {
  subscribe: ConsoleClient.mutation("Live.subscribe"),
  unsubscribe: ConsoleClient.mutation("Live.unsubscribe"),
  installPixel: ConsoleClient.mutation("Live.installPixel")
} as const

let tab: string | undefined
/** This tab's id on its realtime socket, which the room's frames are addressed to. Made once, in the browser. */
export const tabId = () => (tab ??= crypto.randomUUID().replaceAll("-", ""))

/** What the realtime socket tells `/live`: it opened (or opened again), it went down, or the room sent visitors. */
export type LiveSignal =
  | { readonly type: "open" }
  | { readonly type: "down" }
  | { readonly type: "frame"; readonly frame: LiveVisitors }

let open = false
const listeners = new Set<(signal: LiveSignal) => void>()

export const liveSignals = {
  /** Whether the socket is open now: `/live` opened after it did subscribes at once. */
  isOpen: () => open,
  listen: (listener: (signal: LiveSignal) => void) => {
    listeners.add(listener)
    return () => void listeners.delete(listener)
  },
  emit: (signal: LiveSignal) => {
    if (signal.type !== "frame") open = signal.type === "open"
    for (const listener of listeners) listener(signal)
  }
}
