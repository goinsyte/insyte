import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { NotePage, NoteTab } from "@insyte/modules/notifications/domain/Notifications"
import type { EventKey, Note, NotifyPrefs } from "@insyte/ui/app/lib/notifications"
import type { NotificationsSource } from "@insyte/ui/app/notifications/source"
import { Exit, Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { NOTES } from "../data/frame.ts"
import { noteTabAtom, noteWrites, reReadNotes } from "../data/notifications.ts"
import { toNote } from "../frame/notes.ts"

/*
 * The notifications page in the console (PLAN 10, M5.2): the inbox, Later and Gewist from `Notifications.list`, each
 * the newest 50 and 50 more as the list nears its end, up to 500. Every write is the server's (`setRead`, `clear`,
 * `restore`, `snooze`, `setPref`) and names `NOTES`, so the page, the bell and the panel read again; until all three
 * tabs have, after the last write to a note came back, the page shows that note as it asked. A note's writes go one
 * after another, so an Undo lands after what it undoes. Marking read waits a moment and goes as one write, so moving
 * through the list with J and K reads the tabs again once, not for every note. A write that fails puts its notes back
 * as the server has them and says so. The rows are the member's own on the server, and only what reached them there
 * (a store they reach, a kind they may open) is in them.
 */

const STEP = 50
const MOST = 500
/** How long marking read waits for more, to go as one write. */
const GATHER = 400

type Limits = Record<NoteTab, number>

/** A note as the page asked for it: how many of its writes are still out, and what was served when the last came back. */
interface Laid {
  note: Note
  out: number
  settled: ReadonlyArray<Note> | undefined
}

/** Marks waiting to go: each note's last word, and what had to land for that note before them. */
interface Gathered {
  reads: Map<string, boolean>
  after: Map<string, Promise<unknown>>
  done: Promise<void>
  finish: () => void
  timer: ReturnType<typeof setTimeout>
}

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

/** A promise and the hand that keeps it. */
function opened(): { done: Promise<void>; finish: () => void } {
  let finish: (() => void) | undefined
  const done = new Promise<void>((resolve) => {
    finish = resolve
  })
  return { done, finish: finish! }
}

/** What the page says when a write did not land. */
const failed = (title: string, n: number) =>
  void toast.error(title, {
    description: n === 1
      ? "De melding staat weer zoals hij was. Probeer het zo opnieuw."
      : "De meldingen staan weer zoals ze waren. Probeer het zo opnieuw."
  })

/** `undefined` until the three tabs are in; `prefs` are the member's, as the shell reads them for the bell. */
export function useConsoleNotificationsSource(prefs: NotifyPrefs): NotificationsSource | undefined {
  const [limits, setLimits] = useState<Limits>({ inbox: STEP, later: STEP, cleared: STEP })
  const inboxResult = useAtomValue(noteTabAtom(`inbox:${limits.inbox}`))
  const laterResult = useAtomValue(noteTabAtom(`later:${limits.later}`))
  const clearedResult = useAtomValue(noteTabAtom(`cleared:${limits.cleared}`))
  const pages = { inbox: useKept(inboxResult), later: useKept(laterResult), cleared: useKept(clearedResult) }
  const waiting = { inbox: inboxResult.waiting, later: laterResult.waiting, cleared: clearedResult.waiting }
  const reading = waiting.inbox || waiting.later || waiting.cleared

  const write = {
    setRead: useAtomSet(noteWrites.setRead, { mode: "promiseExit" }),
    clear: useAtomSet(noteWrites.clear, { mode: "promiseExit" }),
    restore: useAtomSet(noteWrites.restore, { mode: "promiseExit" }),
    snooze: useAtomSet(noteWrites.snooze, { mode: "promiseExit" }),
    setPref: useAtomSet(noteWrites.setPref, { mode: "promiseExit" })
  }
  const reRead = useAtomSet(reReadNotes)

  const served = useMemo(
    () =>
      pages.inbox === undefined || pages.later === undefined || pages.cleared === undefined
        ? undefined
        // A note moving between tabs can be in two of them while they read again: it shows once.
        : [...new Map([...pages.inbox.items, ...pages.later.items, ...pages.cleared.items].map((n) => [n.id, n]))
          .values()].map(toNote),
    [pages.inbox, pages.later, pages.cleared]
  )

  // What the page asked for, note by note, laid over what the server last said.
  const [laid, setLaid] = useState<ReadonlyMap<string, Laid>>(() => new Map())
  /** Whether a note is still shown as asked: a write is out, or not every tab has read again since the last came back. */
  const live = (l: Laid, of: ReadonlyArray<Note> | undefined, busy: boolean) => l.out > 0 || busy || l.settled === of

  const notes = useMemo(() => {
    if (served === undefined) return undefined
    if (laid.size === 0) return served
    const shown = served.map((n) => {
      const l = laid.get(n.id)
      return l !== undefined && live(l, served, reading) ? l.note : n
    })
    // A note the page moved can be in no tab's rows while they read again; it stays on screen.
    const seen = new Set(served.map((n) => n.id))
    for (const [id, l] of laid) if (!seen.has(id) && live(l, served, reading)) shown.push(l.note)
    return shown
  }, [served, laid, reading])

  // Once every tab has read again, what they confirm is let go.
  useEffect(() => {
    if (reading || served === undefined) return
    setLaid((before) => {
      const kept = new Map([...before].filter(([, l]) => live(l, served, false)))
      return kept.size === before.size ? before : kept
    })
  }, [served, reading])

  // The page's actions are kept by identity; they read what is current from here.
  const now = useRef({ notes, served, reading, write, pages, waiting, reRead })
  now.current = { notes, served, reading, write, pages, waiting, reRead }
  /** Each note's last write still out, for the next to wait on. */
  const chain = useRef(new Map<string, Promise<unknown>>())
  const gathered = useRef<Gathered | undefined>(undefined)

  // Marks still waiting go when the page closes.
  useEffect(() => () => send(), [])

  /** Lays `change` over each note; `fresh` are the ones a new write is out for. */
  function lay(ids: ReadonlyArray<string>, change: (n: Note) => Note, fresh: ReadonlyArray<string> = ids) {
    const current = now.current
    const want = new Set(ids)
    const more = new Set(fresh)
    const shown = new Map((current.notes ?? []).filter((n) => want.has(n.id)).map((n) => [n.id, n]))
    setLaid((before) => {
      const next = new Map(before)
      for (const id of want) {
        const had = before.get(id)
        const still = had !== undefined && live(had, current.served, current.reading)
        const base = still ? had.note : shown.get(id)
        if (base === undefined) continue
        next.set(id, {
          note: change(base),
          out: (still ? had.out : 0) + (more.has(id) ? 1 : 0),
          settled: still ? had.settled : undefined
        })
      }
      return next
    })
  }

  /** A write came back: on success the notes wait for the tabs to read again; on failure they are the server's again. */
  function settle(ids: ReadonlyArray<string>, exit: Exit.Exit<unknown, unknown>, title: string) {
    const ok = Exit.isSuccess(exit)
    const of = now.current.served
    setLaid((before) => {
      const next = new Map(before)
      for (const id of ids) {
        const l = next.get(id)
        if (l === undefined) continue
        if (ok) next.set(id, { ...l, out: Math.max(0, l.out - 1), settled: of })
        else next.delete(id)
      }
      return next
    })
    if (ok) return
    now.current.reRead()
    failed(title, ids.length)
  }

  /**
   * Runs a write once every earlier one for its notes has landed, except marks still gathering: a move between tabs
   * leaves whether a note is read as it is, and a clear reads it, so the marks become read and neither waits.
   */
  function queue(
    ids: ReadonlyArray<string>,
    run: () => Promise<Exit.Exit<unknown, unknown>>,
    title: string,
    reads = false
  ) {
    const g = gathered.current
    if (g !== undefined && reads) { for (const id of ids) if (g.reads.has(id)) g.reads.set(id, true) }
    const before = ids.map((id) => {
      const last = chain.current.get(id)
      return g !== undefined && last === g.done ? g.after.get(id) : last
    })
    const done = Promise.all(before).then(run).then(
      (exit) => settle(ids, exit, title),
      (cause: unknown) => settle(ids, Exit.die(cause), title)
    )
    for (const id of ids) chain.current.set(id, done)
    void done.then(() => {
      for (const id of ids) if (chain.current.get(id) === done) chain.current.delete(id)
    })
    return done
  }

  /** The gathered marks, as one write for read and one for unread. */
  function send() {
    const g = gathered.current
    if (g === undefined) return
    gathered.current = undefined
    clearTimeout(g.timer)
    const groups = [true, false]
      .map((read) => [read, [...g.reads].filter(([, r]) => r === read).map(([id]) => id)] as const)
      .filter(([, ids]) => ids.length > 0)
    void Promise.all(g.after.values())
      .then(() =>
        Promise.all(
          groups.map(([read, ids]) =>
            now.current.write.setRead({ payload: { ids: [...ids], read }, reactivityKeys: NOTES }).then(
              (exit) => settle(ids, exit, "Bijwerken lukte niet"),
              (cause: unknown) => settle(ids, Exit.die(cause), "Bijwerken lukte niet")
            )
          )
        )
      )
      .finally(() => {
        g.finish()
        for (const id of g.reads.keys()) if (chain.current.get(id) === g.done) chain.current.delete(id)
      })
  }

  function setRead(ids: ReadonlyArray<string>, read: boolean) {
    if (ids.length === 0) return
    if (gathered.current === undefined) {
      const { done, finish } = opened()
      gathered.current = { reads: new Map(), after: new Map(), done, finish, timer: setTimeout(send, GATHER) }
    }
    // A mark for a note written to since it was gathered goes after that write: the gathered ones go now.
    if (ids.some((id) => gathered.current?.reads.has(id) && chain.current.get(id) !== gathered.current.done)) {
      send()
      return setRead(ids, read)
    }
    const g = gathered.current
    const fresh = ids.filter((id) => !g.reads.has(id))
    for (const id of fresh) {
      const prior = chain.current.get(id)
      if (prior !== undefined) g.after.set(id, prior)
      chain.current.set(id, g.done)
    }
    for (const id of ids) g.reads.set(id, read)
    lay(ids, (n) => patch(n, { read }), fresh)
  }

  function clear(ids: ReadonlyArray<string>) {
    if (ids.length === 0) return
    lay(ids, (n) => patch(n, { state: "cleared", read: true, snoozeUntil: undefined }))
    void queue(
      ids,
      () => now.current.write.clear({ payload: { ids: [...ids] }, reactivityKeys: NOTES }),
      "Wissen lukte niet",
      true
    )
  }

  function restore(ids: ReadonlyArray<string>) {
    if (ids.length === 0) return
    lay(ids, (n) => patch(n, { state: "inbox", snoozeUntil: undefined }))
    void queue(
      ids,
      () => now.current.write.restore({ payload: { ids: [...ids] }, reactivityKeys: NOTES }),
      "Terugzetten lukte niet"
    )
  }

  function snooze(ids: ReadonlyArray<string>, until: string) {
    if (ids.length === 0) return
    lay(ids, (n) => patch(n, { state: "later", snoozeUntil: until }))
    void queue(
      ids,
      () => now.current.write.snooze({ payload: { ids: [...ids], until: Date.parse(until) }, reactivityKeys: NOTES }),
      "Naar Later zetten lukte niet"
    )
  }

  const acts = useRef({ setRead, clear, restore, snooze })
  acts.current = { setRead, clear, restore, snooze }

  return useMemo<NotificationsSource | undefined>(() => {
    if (notes === undefined) return undefined
    return {
      notes,
      prefs,
      setRead: (ids, read) => acts.current.setRead(ids, read),
      clear: (ids) => acts.current.clear(ids),
      restore: (ids) => acts.current.restore(ids),
      snooze: (ids, until) => acts.current.snooze(ids, until),
      pick: (ids) => {
        const want = new Set(ids)
        return (now.current.notes ?? []).filter((n) => want.has(n.id))
      },
      // The Undo: each note back in its tab (Later until its time, if that is still ahead), then read as it was. Each
      // write waits for what it undoes.
      put: (before) => {
        const at = Date.now()
        const inbox = before.filter((n) =>
          n.state === "inbox" || (n.state === "later" && Date.parse(n.snoozeUntil ?? "") <= at)
        )
        const later = before.filter((n) => n.state === "later" && Date.parse(n.snoozeUntil ?? "") > at)
        acts.current.restore(inbox.map((n) => n.id))
        acts.current.clear(before.filter((n) => n.state === "cleared").map((n) => n.id))
        for (const until of new Set(later.map((n) => n.snoozeUntil!))) {
          acts.current.snooze(later.filter((n) => n.snoozeUntil === until).map((n) => n.id), until)
        }
        acts.current.setRead(before.filter((n) => n.read).map((n) => n.id), true)
        acts.current.setRead(before.filter((n) => !n.read).map((n) => n.id), false)
      },
      setEventApp: (event: EventKey, on: boolean) =>
        void now.current.write.setPref({ payload: { kind: event, app: on }, reactivityKeys: NOTES }).then((exit) => {
          if (Exit.isFailure(exit)) toast.error("Opslaan lukte niet", { description: "Probeer het zo opnieuw." })
        }),
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
