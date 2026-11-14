import { useAtomSet } from "@effect/atom-react"
import { type Note, stateOf } from "@insyte/ui/app/lib/notifications"
import { useCallback, useRef } from "react"
import { reReadNotes } from "../data/notifications.ts"

/** How long a note that has come back waits before it asks again, while the server still holds it in Later. */
const AGAIN = 30_000

/**
 * The shell's `wake` (PLAN 10): a note set aside comes back by itself once its time has come. The server counts it in
 * the inbox again, unread, from that moment; the bell, the panel and the page read again when a note they hold passes
 * its time. Each time a note is set aside asks once; if the server's clock is behind and still says Later, it asks
 * again half a minute on.
 */
export function useWake(notes: ReadonlyArray<Note>): (now: number) => void {
  const reRead = useAtomSet(reReadNotes)
  const latest = useRef(notes)
  latest.current = notes
  const woken = useRef(new Map<string, number>())
  return useCallback((now: number) => {
    const held = latest.current.filter((n) => n.state === "later")
    const due = held.filter((n) => {
      if (stateOf(n, now) !== "inbox") return false
      const asked = woken.current.get(`${n.id}:${n.snoozeUntil ?? ""}`)
      return asked === undefined || now - asked >= AGAIN
    })
    // What is no longer held in Later is let go.
    const keys = new Set(held.map((n) => `${n.id}:${n.snoozeUntil ?? ""}`))
    for (const key of woken.current.keys()) if (!keys.has(key)) woken.current.delete(key)
    if (due.length === 0) return
    for (const n of due) woken.current.set(`${n.id}:${n.snoozeUntil ?? ""}`, now)
    reRead()
  }, [reRead])
}
