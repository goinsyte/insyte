import { useInView, useReducedMotion } from "motion/react"
import { type RefObject, useEffect, useState } from "react"

/**
 * Whether a loop may run: the piece is on screen, the tab is visible and the reader did not ask for
 * less motion. Every loop on the site's pages runs through this, so none of them spends a frame off
 * screen or in a background tab.
 */
export function useRunning(ref: RefObject<Element | null>, amount = 0.3): boolean {
  const reduced = useReducedMotion() === true
  const seen = useInView(ref, { amount })
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const on = () => setVisible(document.visibilityState === "visible")
    on()
    document.addEventListener("visibilitychange", on)
    return () => document.removeEventListener("visibilitychange", on)
  }, [])
  return seen && visible && !reduced
}

/** A counter that steps every `ms` while `run`, for authored loops. */
export function useTicker(run: boolean, ms: number): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!run) return
    const id = window.setInterval(() => setN((v) => v + 1), ms)
    return () => window.clearInterval(id)
  }, [run, ms])
  return n
}
