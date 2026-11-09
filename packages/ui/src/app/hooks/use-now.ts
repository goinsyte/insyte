import { useEffect, useState } from "react"

/** The time, ticking every `every` milliseconds. */
export function useNow(every = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), every)
    return () => window.clearInterval(t)
  }, [every])
  return now
}
