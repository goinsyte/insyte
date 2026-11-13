import type { ReactNode } from "react"
import { useArrival } from "../loading/pace"
import { useVisitorFeed, useVisitors } from "../stores/visitors-store"
import { type LiveSource, LiveSourceProvider } from "./live-source"

/*
 * `/live` in the design app: the simulated visitors (`visitors-store.ts`), the connection that opens after the page
 * does, and Northwind's two stores in dollars. With nobody there (the empty scenario) it says there is no store yet,
 * so the page is the design's empty one.
 */

export function DemoLiveSource({ children }: { children: ReactNode }) {
  useVisitorFeed()
  const connected = useArrival("live:socket", 640)
  const visitors = useVisitors((s) => s.visitors)
  const events = useVisitors((s) => s.events)
  const base = useVisitors((s) => s.base)
  const paused = useVisitors((s) => s.paused)
  const setPaused = useVisitors((s) => s.setPaused)
  const source: LiveSource = {
    connection: connected ? "live" : "connecting",
    pixel: visitors.length === 0 && events.length === 0 ? "no_store" : "installed",
    visitors,
    events,
    revenueToday: base,
    currency: "USD",
    storesLabel: "Northwind US en EU",
    paused,
    setPaused
  }
  return <LiveSourceProvider value={source}>{children}</LiveSourceProvider>
}
