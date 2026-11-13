import { createContext, useContext } from "react"
import type { Currency } from "../lib/types/domain"

/**
 * What `/live` reads, from whoever hosts it (as `settings/notifications-source.tsx` is for Meldingen): the design app
 * from its simulated visitors (`visitors-store.ts`), the console from `Live.snapshot` and the realtime socket's
 * `live.visitors` frames (M14 step 3). A host says honestly what it has: no store yet, a store without the Live pixel,
 * nobody right now, or the connection lost and coming back.
 */

/** Where a visitor is in the funnel. */
export type Stage = "browsing" | "cart" | "checkout" | "bought"

export const STAGE_LABEL: Record<Stage, string> = {
  browsing: "Kijkt rond",
  cart: "In mandje",
  checkout: "Rekent af",
  bought: "Gekocht"
}

/** One visitor on the map: anonymised, as the design's `Visitor` (whose extra fields a host may leave out). */
export interface LiveVisitor {
  id: string
  /** Empty when the visitor's city is not known; the screen then names the country only. */
  city: string
  /** In Dutch: "Nederland". */
  country: string
  lon: number
  lat: number
  source: string
  device: "mobiel" | "desktop"
  stage: Stage
  page: string
  arrivedAt: number
  movedAt: number
  returning: boolean
}

/** One line of "Wat er gebeurt": a visitor's step, or a sale with its order. */
export interface LiveFeedEvent {
  id: string
  at: number
  kind: "arrive" | Stage | "leave"
  visitor: LiveVisitor
  /** A sale's total, in the source's currency. */
  amount?: number | undefined
  /** A sale's order number. */
  order?: string | undefined
}

/**
 * `connecting`: not open yet (bones, "Verbinden"). `live`: open. `reconnecting`: lost, coming back; the figures keep
 * their last values. `error`: the first read failed, with `retry`.
 */
export type LiveConnection = "connecting" | "live" | "reconnecting" | "error"

/** Whether anything can show: no store, a store without the pixel, or at least one store with it. */
export type LivePixel = "no_store" | "not_installed" | "installed"

export interface LiveSource {
  connection: LiveConnection
  pixel: LivePixel
  visitors: ReadonlyArray<LiveVisitor>
  /** Newest first. The sales in it are what "Gekocht, laatste 10 min" counts. */
  events: ReadonlyArray<LiveFeedEvent>
  /** "Omzet vandaag", in major units of `currency`. */
  revenueToday: number
  currency: Currency
  /** The stores the view covers, as the header says them: "Northwind US en EU". */
  storesLabel: string
  paused: boolean
  setPaused: (paused: boolean) => void
  /** Reads again after `error`. */
  retry?: (() => void) | undefined
}

const Context = createContext<LiveSource | null>(null)

export const LiveSourceProvider = Context.Provider

export function useLiveSource(): LiveSource {
  const source = useContext(Context)
  if (source === null) throw new Error("The live page needs a LiveSourceProvider around it.")
  return source
}
