import { useEffect, useState } from "react"

/**
 * Whether the page has hydrated: `false` on the server and on the browser's first render, `true` after. Text that
 * depends on the clock or the time zone (the panel's "now") waits for it, so the server's render and the browser's
 * first one agree.
 */
export function useHydrated() {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])
  return hydrated
}
