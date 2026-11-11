import { useLive } from "../stores/live-store"
import { RefreshView } from "./toolbar"

/** "Bijgewerkt zojuist" with a refresh on click, over the demo's live store. */
export function RefreshControl() {
  const refreshedAt = useLive((s) => s.refreshedAt)
  const refreshing = useLive((s) => s.refreshing)
  const refresh = useLive((s) => s.refresh)
  return <RefreshView source={{ refreshedAt, refreshing, refresh }} />
}
