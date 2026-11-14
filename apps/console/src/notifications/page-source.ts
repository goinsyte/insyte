import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { NotePage, NoteTab } from "@insyte/modules/notifications/domain/Notifications"
import type { EventKey, Note, NotifyPrefs } from "@insyte/ui/app/lib/notifications"
import type { NotificationsSource } from "@insyte/ui/app/notifications/source"
import { Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useMemo, useRef, useState } from "react"
import { NOTES } from "../data/frame.ts"
import { noteTabAtom, noteWrites } from "../data/notifications.ts"
import { toNote } from "../frame/notes.ts"

/*
 * The notifications page in the console (PLAN 10, M5.2): the inbox, Later and Gewist from `Notifications.list`, each
 * the newest 50 and 50 more as the list nears its end, up to 500. Every write is the server's (`setRead`, `clear`,
 * `restore`, `snooze`, `setPref`) and names `NOTES`, so the page, the bell and the panel read again; until they have,
 * the page shows what it asked for. An Undo puts each note back as it was: its tab, then whether it was read. The
 * rows are the member's own on the server, and only what reached them there (a store they reach, a kind they may
 * open) is in them.
 */

const STEP = 50
const MOST = 500

type Limits = Record<NoteTab, number>

/** The last value a read gave, so asking for more rows keeps the list on screen. */
function useKept(result: AsyncResult.AsyncResult<NotePage, unknown>): NotePage | undefined {
  const value = Option.getOrUndefined(AsyncResult.value(result))
  const last = useRef<NotePage | undefined>(undefined)
  if (value !== undefined) last.current = value
  return value ?? last.current
}

/** A note with what the page did to it; `snoozeUntil: undefined` takes the time off. */
const patch = (note: Note, change: Partial<Omit<Note, "snoozeUntil">> & { snoozeUntil?: string | undefined }): Note => {
  const { snoozeUntil, ...rest } = { ...note, ...change }
  return snoozeUntil === undefined ? rest : { ...rest, snoozeUntil }
}

/** `undefined` until the three tabs are in; `prefs` are the member's, as the shell reads them for the bell. */
export function useConsoleNotificationsSource(prefs: NotifyPrefs): NotificationsSource | undefined {
  const [limits, setLimits] = useState<Limits>({ inbox: STEP, later: STEP, cleared: STEP })
  const inboxResult = useAtomValue(noteTabAtom(`inbox:${limits.inbox}`))
  const laterResult = useAtomValue(noteTabAtom(`later:${limits.later}`))
  const clearedResult = useAtomValue(noteTabAtom(`cleared:${limits.cleared}`))
  const pages = { inbox: useKept(inboxResult), later: useKept(laterResult), cleared: useKept(clearedResult) }
  const waiting = { inbox: inboxResult.waiting, later: laterResult.waiting, cleared: clearedResult.waiting }

  const write = {
    setRead: useAtomSet(noteWrites.setRead, { mode: "promiseExit" }),
    clear: useAtomSet(noteWrites.clear, { mode: "promiseExit" }),
    restore: useAtomSet(noteWrites.restore, { mode: "promiseExit" }),
    snooze: useAtomSet(noteWrites.snooze, { mode: "promiseExit" }),
    setPref: useAtomSet(noteWrites.setPref, { mode: "promiseExit" })
  }

  const served = useMemo(
    () =>
      pages.inbox === undefined || pages.later === undefined || pages.cleared === undefined
        ? undefined
        // A note moving between tabs can be in two of them while they read again: it shows once.
        : [...new Map([...pages.inbox.items, ...pages.later.items, ...pages.cleared.items].map((n) => [n.id, n]))
          .values()].map(toNote),
    [pages.inbox, pages.later, pages.cleared]
  )

  // What the page asked for, laid over what the server last said, until it says it again.
  const [asked, setAsked] = useState<{ of: ReadonlyArray<Note> | undefined; notes: ReadonlyMap<string, Note> }>({
    of: undefined,
    notes: new Map()
  })
  const notes = useMemo(() => {
    if (served === undefined) return undefined
    if (asked.of !== served || asked.notes.size === 0) return served
    return served.map((n) => asked.notes.get(n.id) ?? n)
  }, [served, asked])

  // The page's actions are kept by identity; they read what is current from here.
  const now = useRef({ notes, served, write, pages, waiting })
  now.current = { notes, served, write, pages, waiting }

  return useMemo<NotificationsSource | undefined>(() => {
    if (notes === undefined) return undefined
    const lay = (ids: ReadonlyArray<string>, change: (n: Note) => Note) => {
      const current = now.current
      const want = new Set(ids)
      setAsked((before) => {
        const laid = new Map(before.of === current.served ? before.notes : [])
        for (const n of current.notes ?? []) if (want.has(n.id)) laid.set(n.id, change(laid.get(n.id) ?? n))
        return { of: current.served, notes: laid }
      })
    }
    const go = <A>(run: () => Promise<A>) => void run()
    const setRead = (ids: ReadonlyArray<string>, read: boolean) => {
      if (ids.length === 0) return
      lay(ids, (n) => patch(n, { read }))
      go(() => now.current.write.setRead({ payload: { ids: [...ids], read }, reactivityKeys: NOTES }))
    }
    const clear = (ids: ReadonlyArray<string>): Promise<unknown> => {
      if (ids.length === 0) return Promise.resolve()
      lay(ids, (n) => patch(n, { state: "cleared", read: true, snoozeUntil: undefined }))
      return now.current.write.clear({ payload: { ids: [...ids] }, reactivityKeys: NOTES })
    }
    const restore = (ids: ReadonlyArray<string>): Promise<unknown> => {
      if (ids.length === 0) return Promise.resolve()
      lay(ids, (n) => patch(n, { state: "inbox", snoozeUntil: undefined }))
      return now.current.write.restore({ payload: { ids: [...ids] }, reactivityKeys: NOTES })
    }
    const snooze = (ids: ReadonlyArray<string>, until: string): Promise<unknown> => {
      if (ids.length === 0) return Promise.resolve()
      lay(ids, (n) => patch(n, { state: "later", snoozeUntil: until }))
      return now.current.write.snooze({ payload: { ids: [...ids], until: Date.parse(until) }, reactivityKeys: NOTES })
    }
    return {
      notes,
      prefs,
      setRead,
      clear: (ids) => go(() => clear(ids)),
      restore: (ids) => go(() => restore(ids)),
      snooze: (ids, until) => go(() => snooze(ids, until)),
      pick: (ids) => {
        const want = new Set(ids)
        return (now.current.notes ?? []).filter((n) => want.has(n.id))
      },
      // The Undo: each note back in its tab (Later until its time, if that is still ahead), then read as it was.
      put: (before) =>
        go(async () => {
          const at = Date.now()
          const inbox = before.filter((n) =>
            n.state === "inbox" || (n.state === "later" && Date.parse(n.snoozeUntil ?? "") <= at)
          )
          const later = before.filter((n) => n.state === "later" && Date.parse(n.snoozeUntil ?? "") > at)
          await Promise.all([
            restore(inbox.map((n) => n.id)),
            clear(before.filter((n) => n.state === "cleared").map((n) => n.id)),
            ...[...new Set(later.map((n) => n.snoozeUntil!))].map((until) =>
              snooze(later.filter((n) => n.snoozeUntil === until).map((n) => n.id), until)
            )
          ])
          setRead(before.filter((n) => n.read).map((n) => n.id), true)
          setRead(before.filter((n) => !n.read).map((n) => n.id), false)
        }),
      setEventApp: (event: EventKey, on: boolean) =>
        go(() => now.current.write.setPref({ payload: { kind: event, app: on }, reactivityKeys: NOTES })),
      more: {
        has: (tab) => (now.current.pages[tab]?.next ?? null) !== null && limits[tab] < MOST,
        read: (tab) => {
          if (now.current.waiting[tab]) return
          setLimits((l) => l[tab] === limits[tab] ? { ...l, [tab]: Math.min(MOST, l[tab] + STEP) } : l)
        }
      }
    }
  }, [notes, prefs, limits])
}
