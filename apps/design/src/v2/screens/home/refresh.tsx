import { useEffect, useState } from "react"
import { cx } from "../../ui/cx.ts"
import { RefreshCcw } from "../../ui/icons.tsx"
import { Toggle } from "../../ui/toggle.tsx"
import { refresh, setAuto, useHome } from "./store.ts"

/*
 * The board's clock. "Bijgewerkt" counts up from the last time Start read the workspace; a click
 * reads it again, and with Automatisch on it does so every minute, so new orders keep arriving in
 * today's figures. Honest about itself: while it reads, it says so.
 */

const AUTO_MS = 60_000

function ago(ms: number) {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return "zojuist"
  if (minutes < 60) return `${minutes} min geleden`
  return `${Math.floor(minutes / 60)} u geleden`
}

export function RefreshClock() {
  const { refreshedAt, refreshing, auto } = useHome()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!auto) return
    const id = window.setInterval(refresh, AUTO_MS)
    return () => window.clearInterval(id)
  }, [auto])

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={refresh}
        title="Nu bijwerken"
        className="inline-flex h-7 items-center gap-1.5 rounded-sm px-2 text-xs text-ink-3 transition-colors hover:bg-hover hover:text-ink pointer-coarse:h-11"
      >
        <RefreshCcw size={13} className={cx(refreshing && "animate-spin motion-reduce:animate-none")} />
        <span aria-live="polite">{refreshing ? "Bijwerken" : `Bijgewerkt ${ago(Math.max(0, now - refreshedAt))}`}</span>
      </button>
      <span className="flex items-center gap-2 pl-1 text-xs text-ink-3">
        <span className="hidden lg:inline" aria-hidden="true">Automatisch</span>
        <Toggle on={auto} onChange={setAuto} label="Automatisch bijwerken" />
      </span>
    </div>
  )
}
