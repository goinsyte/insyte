import { useAtomMount } from "@effect/atom-react"
import { realtimeAtom } from "../data/realtime.ts"

/** Keeps the tab's realtime socket open while a signed-in screen shows (M5.1). Draws nothing. */
function Listen() {
  useAtomMount(realtimeAtom)
  return null
}

export { Listen as LiveUpdates }
