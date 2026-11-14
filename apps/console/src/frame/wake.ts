import { useAtomSet } from "@effect/atom-react"
import { type Note, stateOf } from "@insyte/ui/app/lib/notifications"
import { useCallback, useRef } from "react"
import { reReadNotes } from "../data/notifications.ts"

/**
 * The shell's `wake` (PLAN 10): a note set aside comes back by itself once its time has come. The server counts it in
 * the inbox again, unread, from that moment; the bell, the panel and the page read again when a note they hold passes
 * its time, once for each note.
 */
export function useWake(notes: ReadonlyArray<Note>): (now: number) => void {
  const reRead = useAtomSet(reReadNotes)
  const latest = useRef(notes)
  latest.current = notes
  const woken = useRef(new Set<string>())
  return useCallback((now: number) => {
    const due = latest.current.filter((n) =>
      n.state === "later" && stateOf(n, now) === "inbox" && !woken.current.has(n.id)
    )
    if (due.length === 0) return
    for (const n of due) woken.current.add(n.id)
    reRead()
  }, [reRead])
}
