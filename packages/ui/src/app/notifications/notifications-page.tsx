import { Link, useNavigate } from "@tanstack/react-router"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Checkbox } from "../../components/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "../../components/dropdown-menu"
import { Check, CheckCircle2, Clock, Eye, EyeOff, Keyboard, RotateCcw, Settings } from "../../icons"
import { EmptyState } from "../common/empty-state"
import { PageHeader } from "../common/page-header"
import {
  DAY_GROUPS,
  dayGroup,
  EVENTS,
  heard,
  isPrimary,
  type Note,
  type NoteSource,
  noteTime,
  snoozeChoices,
  SOURCES,
  stateOf,
  wakesAt
} from "../lib/notifications"
import type { Persona } from "../lib/types/persona"
import { undoable } from "../lib/undo"
import { cn } from "../lib/utils"
import { type RowAction, SelectionBar } from "../table/selection-bar"
import { NoteLead, NoteSentence, useNow } from "./note-parts"
import { NotePreview } from "./note-preview"
import { useNotificationsSource } from "./source"

/*
 * The notifications page, the way ClickUp's inbox works: the area panel picks the view (Primair,
 * Overig, Later, Gewist, or one source), the list is grouped by day, and a row opens its preview on
 * the right without leaving the list. A row is cleared, set aside or read from its hover actions, from
 * the keyboard, or in bulk from the selection bar.
 *
 * The page works the same for every persona; the area panel and its counts come from the same store. Its notes and
 * what it does with them come from the host (`source.tsx`): the design app's store, the console's server.
 */

export type NotificationsView = "other" | "later" | "cleared"

const VIEW_LABEL: Record<NotificationsView | "primary", string> = {
  primary: "Primair",
  other: "Overig",
  later: "Later",
  cleared: "Gewist"
}

const EMPTY: Record<NotificationsView | "primary", { title: string; body: string }> = {
  primary: {
    title: "Je bent bij",
    body: "Vermeldingen en wat aan jou is toegewezen, komen hier."
  },
  other: { title: "Niets onder Overig", body: "Updates over records die je volgt, komen hier." },
  later: { title: "Niets uitgesteld", body: "Zet een melding opzij met S. Hij komt terug wanneer je kiest." },
  cleared: { title: "Niets gewist", body: "Wat je wist met E blijft hier staan, zodat je het kunt terugzetten." }
}

const SHORTCUTS: ReadonlyArray<{ keys: string[]; what: string }> = [
  { keys: ["J"], what: "Volgende melding" },
  { keys: ["K"], what: "Vorige melding" },
  { keys: ["Enter"], what: "Het record openen" },
  { keys: ["E"], what: "Wissen" },
  { keys: ["S"], what: "Later" },
  { keys: ["U"], what: "Gelezen of ongelezen" },
  { keys: ["X"], what: "Selecteren" },
  { keys: ["Esc"], what: "Voorbeeld sluiten" },
  { keys: ["G", "N"], what: "Naar meldingen, van overal" }
]

const plural = (n: number) => `${n} ${n === 1 ? "melding" : "meldingen"}`

export function NotificationsPage({
  persona,
  base,
  settingsTo,
  view,
  source
}: {
  persona: Persona
  base: string
  settingsTo: string
  view?: NotificationsView
  source?: NoteSource
}) {
  const now = useNow(30_000)
  const navigate = useNavigate()
  const still = useReducedMotion()
  const { notes: allNotes, prefs, setRead, snooze, clear, restore, pick, put, more } = useNotificationsSource()
  const notes = useMemo(() => allNotes.filter((n) => n.persona === persona && heard(n, prefs)), [
    allNotes,
    prefs,
    persona
  ])
  const latest = useRef(allNotes)
  latest.current = allNotes

  const [activeId, setActiveId] = useState<string | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [help, setHelp] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const key = source ? "source" : (view ?? "primary")
  const tab = view === "later" || view === "cleared" ? view : "inbox"
  const title = source ? SOURCES[source].label : VIEW_LABEL[view ?? "primary"]

  const rows = useMemo(() => {
    const inView = notes.filter((n) => {
      const st = stateOf(n, now)
      if (source) return st === "inbox" && n.source === source
      if (view === "later") return st === "later"
      if (view === "cleared") return st === "cleared"
      if (view === "other") return st === "inbox" && !isPrimary(n)
      return st === "inbox" && isPrimary(n)
    })
    const sorted = view === "later"
      ? inView.sort((a, b) => Date.parse(a.snoozeUntil ?? a.at) - Date.parse(b.snoozeUntil ?? b.at))
      : inView.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    return unreadOnly ? sorted.filter((n) => !n.read) : sorted
  }, [notes, now, view, source, unreadOnly])

  // Reset what is open and picked when the view changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the view
  useEffect(() => {
    setActiveId(null)
    setChecked(new Set())
  }, [key, source])

  const groups = useMemo(
    () =>
      DAY_GROUPS.map((d) => ({ day: d, notes: rows.filter((n) => dayGroup(n.at, now) === d) })).filter((g) =>
        g.notes.length > 0
      ),
    [rows, now]
  )
  const ordered = useMemo(() => groups.flatMap((g) => g.notes), [groups])
  const active = activeId ? (allNotes.find((n) => n.id === activeId) ?? null) : null
  const unread = rows.filter((n) => !n.read).length
  const inboxView = view !== "later" && view !== "cleared"

  /* An event muted for the app: say so where its rows would have been. */
  const mutedHere = useMemo(() => {
    if (persona !== "admin") return []
    return EVENTS.filter((e) => {
      if (prefs.events[e.key]?.app !== false) return false
      if (source) return allNotes.some((n) => n.persona === "admin" && n.event === e.key && n.source === source)
      return view === undefined ? e.primary : view === "other" ? !e.primary : false
    })
  }, [persona, prefs, source, view, allNotes])

  /* ── actions, each with Undo ── */

  const nextAfter = useCallback(
    (ids: ReadonlyArray<string>) => {
      if (!activeId || !ids.includes(activeId)) return activeId
      const at = ordered.findIndex((n) => n.id === activeId)
      const rest = ordered.filter((n) => !ids.includes(n.id))
      return (rest[at] ?? rest[at - 1])?.id ?? null
    },
    [activeId, ordered]
  )

  const doClear = useCallback(
    (ids: ReadonlyArray<string>) => {
      if (ids.length === 0) return
      const before = pick(ids)
      setActiveId(nextAfter(ids))
      clear(ids)
      undoable(ids.length === 1 ? "Melding gewist" : `${plural(ids.length)} gewist`, () => put(before))
    },
    [pick, clear, put, nextAfter]
  )
  const doSnooze = useCallback(
    (ids: ReadonlyArray<string>, until: string) => {
      if (ids.length === 0) return
      const before = pick(ids)
      setActiveId(nextAfter(ids))
      snooze(ids, until)
      undoable(
        `${ids.length === 1 ? "Uitgesteld" : `${plural(ids.length)} uitgesteld`} tot ${wakesAt(until, Date.now())}`,
        () => put(before)
      )
    },
    [pick, snooze, put, nextAfter]
  )
  const doRestore = useCallback(
    (ids: ReadonlyArray<string>) => {
      if (ids.length === 0) return
      const before = pick(ids)
      setActiveId(nextAfter(ids))
      restore(ids)
      undoable(ids.length === 1 ? "Terug in je inbox" : `${plural(ids.length)} terug in je inbox`, () => put(before))
    },
    [pick, restore, put, nextAfter]
  )
  const doRead = useCallback((ids: ReadonlyArray<string>, read: boolean) => setRead(ids, read), [setRead])

  const readAll = () => {
    const ids = rows.filter((n) => !n.read).map((n) => n.id)
    if (ids.length === 0) return
    const before = pick(ids)
    setRead(ids, true)
    undoable(`${plural(ids.length)} gelezen`, () => put(before))
  }

  const openRecord = (n: Note) => {
    setRead([n.id], true)
    navigate({ to: n.to, search: n.search } as never)
  }

  const preview = (n: Note) => setActiveId(n.id)
  // What is open in the preview has been read, however it got there: a click, J and K, or the row
  // that moved up when the one above it was cleared.
  useEffect(() => {
    if (!activeId) return
    const n = latest.current.find((x) => x.id === activeId)
    if (n && !n.read) setRead([n.id], true)
  }, [activeId, setRead])

  /* ── the keyboard ── */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t?.closest("input, textarea, select, [contenteditable=true], [role=dialog], [role=menu]")) return
      const k = e.key
      const at = ordered.findIndex((n) => n.id === activeId)
      const move = (to: number) => {
        const n = ordered[Math.max(0, Math.min(ordered.length - 1, to))]
        if (!n) return
        e.preventDefault()
        preview(n)
        listRef.current?.querySelector(`[data-note="${n.id}"]`)?.scrollIntoView({ block: "nearest" })
      }
      if (k === "?") {
        e.preventDefault()
        setHelp(true)
      } else if (k === "j" || k === "ArrowDown") move(at + 1)
      else if (k === "k" || k === "ArrowUp") move(at < 0 ? 0 : at - 1)
      else if (k === "Escape" && activeId) setActiveId(null)
      else if (!active || checked.size > 0) return
      else if (k === "Enter") {
        e.preventDefault()
        openRecord(active)
      } else if (k === "e") {
        e.preventDefault()
        if (inboxView || view === "later") doClear([active.id])
        else doRestore([active.id])
      } else if (k === "s" && inboxView) {
        e.preventDefault()
        setMenuFor(active.id)
      } else if (k === "u") {
        e.preventDefault()
        doRead([active.id], !active.read)
      } else if (k === "x") {
        e.preventDefault()
        toggleCheck(active.id)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  const toggleCheck = (id: string) =>
    setChecked((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  /* ── the selection bar ── */

  const picked = ordered.filter((n) => checked.has(n.id))
  const choices = snoozeChoices(now)
  const actions: ReadonlyArray<RowAction<Note>> = inboxView
    ? [
      {
        id: "read",
        label: "Gelezen",
        icon: Eye,
        bar: true,
        applies: (n) => !n.read,
        run: (r) => doRead(r.map((n) => n.id), true)
      },
      {
        id: "unread",
        label: "Ongelezen",
        icon: EyeOff,
        shortcut: "u",
        applies: (n) => n.read,
        run: (r) => doRead(r.map((n) => n.id), false)
      },
      ...choices.map((c, i) => ({
        id: `later-${c.id}`,
        label: `Later: ${c.label.toLowerCase()}`,
        icon: Clock,
        group: "Later",
        bar: i === 1,
        shortcut: i === 1 ? "s" : undefined,
        run: (r: Note[]) => doSnooze(r.map((n) => n.id), c.until)
      })),
      {
        id: "clear",
        label: "Wissen",
        icon: CheckCircle2,
        bar: true,
        shortcut: "e",
        run: (r) => doClear(r.map((n) => n.id))
      }
    ]
    : [
      {
        id: "restore",
        label: view === "later" ? "Nu terughalen" : "Terugzetten",
        icon: RotateCcw,
        bar: true,
        shortcut: "e",
        run: (r) => doRestore(r.map((n) => n.id))
      },
      ...(view === "later"
        ? [{
          id: "clear",
          label: "Wissen",
          icon: CheckCircle2,
          bar: true,
          run: (r: Note[]) => doClear(r.map((n) => n.id))
        }]
        : []),
      { id: "read", label: "Gelezen", icon: Eye, applies: (n) => !n.read, run: (r) => doRead(r.map((n) => n.id), true) }
    ]

  const allChecked = ordered.length > 0 && ordered.every((n) => checked.has(n.id))
  const someChecked = !allChecked && ordered.some((n) => checked.has(n.id))
  const totalForPersona = allNotes.filter((n) => n.persona === persona).length

  const empty = totalForPersona === 0
    ? {
      title: "Nog geen meldingen",
      body: "Kies in de instellingen wat je wilt horen."
    }
    : unreadOnly && notes.length > 0
    ? { title: "Alles gelezen", body: "Zet het filter uit om alles te zien." }
    : source
    ? { title: `Niets van ${SOURCES[source].label.toLowerCase()}`, body: "Nieuwe meldingen uit deze bron komen hier." }
    : EMPTY[view ?? "primary"]

  return (
    <div className="flex min-h-0 flex-1">
      <section className="flex min-w-0 flex-1 flex-col" aria-label={`Meldingen: ${title}`}>
        <PageHeader
          crumbs={[{ label: "Meldingen", to: base }]}
          title={title}
          meta={unread > 0 ? <span className="text-ink-3 text-sm tabular-nums">{unread} ongelezen</span> : null}
          actions={totalForPersona === 0 ? null : (
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                aria-pressed={unreadOnly}
                title="Alleen ongelezen tonen"
                onClick={() => setUnreadOnly((v) => !v)}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-sm transition-colors",
                  unreadOnly ? "bg-arc-tint text-arc-ink" : "text-ink-2 hover:bg-ink/6 hover:text-ink"
                )}
              >
                <span className={cn("size-2 rounded-full", unreadOnly ? "bg-arc" : "bg-ink-4")} aria-hidden />
                <span className="max-sm:sr-only">Ongelezen</span>
              </button>
              {inboxView ?
                (
                  <>
                    <button
                      type="button"
                      onClick={readAll}
                      disabled={unread === 0}
                      className="field flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-ink text-sm hover:field-hover disabled:pointer-events-none disabled:opacity-45"
                    >
                      <Check className="size-3.5 text-ink-3" strokeWidth={2} />
                      <span className="max-sm:sr-only">Alles gelezen</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => doClear(rows.map((n) => n.id))}
                      disabled={rows.length === 0}
                      className="field flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-ink text-sm hover:field-hover disabled:pointer-events-none disabled:opacity-45"
                    >
                      <CheckCircle2 className="size-3.5 text-ink-3" strokeWidth={1.75} />
                      <span className="max-sm:sr-only">Alles wissen</span>
                    </button>
                  </>
                ) :
                view === "cleared" ?
                (
                  <button
                    type="button"
                    onClick={() => doRestore(rows.map((n) => n.id))}
                    disabled={rows.length === 0}
                    className="field flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-ink text-sm hover:field-hover disabled:pointer-events-none disabled:opacity-45"
                  >
                    <RotateCcw className="size-3.5 text-ink-3" strokeWidth={1.75} />
                    Alles terugzetten
                  </button>
                ) :
                null}
              <button
                type="button"
                onClick={() => setHelp(true)}
                aria-label="Sneltoetsen"
                title="Sneltoetsen (?)"
                className="hidden size-8 sm:flex items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink"
              >
                <Keyboard className="size-4" strokeWidth={1.75} />
              </button>
              <Link
                to={settingsTo}
                aria-label="Meldingsinstellingen"
                title="Meldingsinstellingen"
                className="flex size-8 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink"
              >
                <Settings className="size-4" strokeWidth={1.75} />
              </Link>
            </div>
          )}
        />

        {mutedHere.length > 0 ?
          (
            <p className="mx-5 mb-2 flex flex-wrap items-center gap-x-1.5 rounded-md bg-mist px-3 py-2 text-ink-2 text-sm">
              <span>
                {mutedHere.length === 1
                  ? `“${mutedHere[0]?.label}” staat uit voor de app.`
                  : `${mutedHere.length} soorten meldingen staan uit voor de app.`}
              </span>
              <Link
                to={settingsTo}
                className="font-medium text-arc-ink underline decoration-arc-ink/35 underline-offset-2 hover:decoration-arc-ink"
              >
                Instellingen
              </Link>
            </p>
          ) :
          null}

        {ordered.length > 0 ?
          (
            <div className="flex h-8 shrink-0 items-center gap-3 px-5 text-ink-3 text-xs">
              <Checkbox
                checked={allChecked}
                indeterminate={someChecked}
                onCheckedChange={() => setChecked(allChecked ? new Set() : new Set(ordered.map((n) => n.id)))}
                aria-label="Alles selecteren"
              />
              <span className="tabular-nums">{plural(ordered.length)}</span>
              <span className="ml-auto hidden sm:inline">
                <kbd className="font-medium">J</kbd> en <kbd className="font-medium">K</kbd> om te lopen,{" "}
                <kbd className="font-medium">?</kbd> voor alle sneltoetsen
              </span>
            </div>
          ) :
          null}

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-3 pb-24">
          {ordered.length === 0 ?
            (
              <EmptyState
                kind="notifications"
                title={empty.title}
                body={empty.body}
                action={totalForPersona === 0
                  ? { label: "Instellingen openen", onClick: () => navigate({ to: settingsTo } as never) }
                  : undefined}
                secondary={view !== "cleared" && totalForPersona > 0 && !unreadOnly
                  ? {
                    label: "Gewist bekijken",
                    onClick: () => navigate({ to: base, search: { view: "cleared" } } as never)
                  }
                  : undefined}
              />
            ) :
            (
              <AnimatePresence initial={false}>
                {groups.map((g) => (
                  <motion.section
                    key={g.day}
                    aria-label={g.day}
                    exit={still ? { opacity: 0 } : { opacity: 0, height: 0 }}
                    transition={{ duration: 0.16 }}
                  >
                    <h2 className="sticky top-0 z-[1] flex h-8 items-center gap-2 bg-paper px-2 font-medium text-ink-3 text-xs">
                      {g.day}
                      <span className="tabular-nums">{g.notes.length}</span>
                    </h2>
                    <ul>
                      <AnimatePresence initial={false}>
                        {g.notes.map((n) => (
                          <Row
                            key={n.id}
                            note={n}
                            now={now}
                            active={n.id === activeId}
                            checked={checked.has(n.id)}
                            selecting={checked.size > 0}
                            view={view}
                            menuOpen={menuFor === n.id}
                            onMenu={(open) => setMenuFor(open ? n.id : null)}
                            onOpen={() => preview(n)}
                            onCheck={() => toggleCheck(n.id)}
                            onRead={() => doRead([n.id], !n.read)}
                            onSnooze={(until) => doSnooze([n.id], until)}
                            onClear={() => doClear([n.id])}
                            onRestore={() => doRestore([n.id])}
                          />
                        ))}
                      </AnimatePresence>
                    </ul>
                  </motion.section>
                ))}
              </AnimatePresence>
            )}
          {more?.has(tab)
            ? <ReadOn key={`${tab}:${allNotes.length}`} root={listRef} onNear={() => more.read(tab)} />
            : null}
        </div>
      </section>

      {/* The preview: a `mist` field beside the list from `lg`, the whole screen below it. */}
      <aside
        className={cn(
          "flex-col bg-mist",
          active ? "fixed inset-0 z-40 flex lg:static lg:z-auto" : "hidden lg:flex",
          "lg:w-[400px] lg:shrink-0 xl:w-[440px]"
        )}
      >
        {active ?
          (
            <NotePreview
              note={active}
              now={now}
              canMute={persona === "admin"}
              onClose={() => setActiveId(null)}
              onSnooze={() => setMenuFor(active.id)}
              onClear={() => doClear([active.id])}
              onRestore={() => doRestore([active.id])}
            />
          ) :
          ordered.length === 0 ?
          null :
          (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8">
              <EmptyState
                kind="notifications"
                title="Kies een melding"
                body="Hij opent hier, met het record erbij."
              />
              <p className="-mt-8 flex items-center gap-1.5 text-ink-3 text-sm">
                <kbd className="rounded bg-ink/6 px-1.5 py-0.5 text-ink-2 text-xs">J</kbd>
                <kbd className="rounded bg-ink/6 px-1.5 py-0.5 text-ink-2 text-xs">K</kbd>
                lopen door de lijst ·
                <kbd className="rounded bg-ink/6 px-1.5 py-0.5 text-ink-2 text-xs">?</kbd>
                alle sneltoetsen
              </p>
            </div>
          )}
      </aside>

      <SelectionBar
        rows={picked}
        actions={actions}
        noun={["melding", "meldingen"]}
        onClear={() => setChecked(new Set())}
      />

      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sneltoetsen voor meldingen</DialogTitle>
            <DialogDescription>Ze werken nooit terwijl je typt.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1">
            {SHORTCUTS.map((s) => (
              <div
                key={s.what}
                className="flex h-8 items-center justify-between gap-3 rounded-md bg-mist px-2.5 text-base text-ink-2"
              >
                {s.what}
                <span className="flex gap-1">
                  {s.keys.map((k) => (
                    <kbd
                      key={k}
                      className="flex h-5 min-w-5 items-center justify-center rounded-sm bg-paper px-1 font-medium text-ink text-xs"
                    >
                      {k}
                    </kbd>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ── one row ─────────────────────────────────────────────────────────────────────────────── */

function Row({
  note: n,
  now,
  active,
  checked,
  selecting,
  view,
  menuOpen,
  onMenu,
  onOpen,
  onCheck,
  onRead,
  onSnooze,
  onClear,
  onRestore
}: {
  note: Note
  now: number
  active: boolean
  checked: boolean
  selecting: boolean
  view?: NotificationsView
  menuOpen: boolean
  onMenu: (open: boolean) => void
  onOpen: () => void
  onCheck: () => void
  onRead: () => void
  onSnooze: (until: string) => void
  onClear: () => void
  onRestore: () => void
}) {
  const still = useReducedMotion()
  const inbox = view !== "later" && view !== "cleared"
  const time = view === "later" && n.snoozeUntil ? `terug ${wakesAt(n.snoozeUntil, now)}` : noteTime(n.at, now)
  return (
    <motion.li
      data-note={n.id}
      initial={false}
      exit={still ? { opacity: 0 } : { opacity: 0, height: 0, transition: { duration: 0.2, ease: [0.25, 1, 0.5, 1] } }}
      className="overflow-hidden"
    >
      <div
        className={cn(
          "glyph-host group/row relative flex min-h-[52px] items-center gap-2.5 rounded-lg pr-2 pl-2 transition-colors",
          checked ? "bg-arc-tint" : active ? "bg-ink/6" : "hover:bg-ink/4"
        )}
      >
        <span
          className={cn(
            "flex w-4 shrink-0 transition-opacity",
            selecting || checked ? "opacity-100" : "opacity-0 focus-within:opacity-100 group-hover/row:opacity-100"
          )}
        >
          <Checkbox checked={checked} onCheckedChange={onCheck} aria-label="Selecteren" />
        </span>
        <span
          className={cn("size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-arc")}
          aria-label={n.read ? undefined : "Ongelezen"}
        />
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left outline-offset-2"
        >
          <NoteLead note={n} size={28} />
          <span className="flex min-w-0 flex-1 flex-col">
            <NoteSentence note={n} className={cn("truncate text-base", n.read ? "text-ink-2" : "text-ink")} />
            {n.detail
              ? <span className="truncate text-ink-3 text-sm">{n.quote ? `“${n.detail}”` : n.detail}</span>
              : null}
          </span>
        </button>
        <span
          className={cn(
            "shrink-0 pl-2 text-ink-3 text-xs tabular-nums",
            menuOpen ? "hidden" : "group-focus-within/row:hidden group-hover/row:hidden"
          )}
        >
          {time}
        </span>
        <span
          className={cn(
            "shrink-0 items-center gap-0.5",
            menuOpen ? "flex" : "hidden group-focus-within/row:flex group-hover/row:flex"
          )}
        >
          <RowButton label={n.read ? "Ongelezen" : "Gelezen"} keys="U" onClick={onRead}>
            {n.read ? <EyeOff className="size-4" strokeWidth={1.75} /> : <Eye className="size-4" strokeWidth={1.75} />}
          </RowButton>
          {inbox ?
            (
              <DropdownMenu open={menuOpen} onOpenChange={onMenu}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Later"
                    title="Later (S)"
                    className="flex size-8 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-ink/8 hover:text-ink"
                  >
                    <Clock className="size-4" strokeWidth={1.75} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Terug in je inbox</DropdownMenuLabel>
                  {snoozeChoices(now).map((c) => (
                    <DropdownMenuItem key={c.id} onClick={() => onSnooze(c.until)}>
                      <Clock className="size-3.5" strokeWidth={1.75} />
                      <span className="flex-1">{c.label}</span>
                      <span className="text-ink-3 text-xs tabular-nums">{c.hint}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) :
            null}
          {view === "cleared" || view === "later" ?
            (
              <RowButton label={view === "later" ? "Nu terughalen" : "Terugzetten"} onClick={onRestore}>
                <RotateCcw className="size-4" strokeWidth={1.75} />
              </RowButton>
            ) :
            null}
          {view !== "cleared" ?
            (
              <RowButton label="Wissen" keys="E" onClick={onClear}>
                <CheckCircle2 className="size-4" strokeWidth={1.75} />
              </RowButton>
            ) :
            null}
        </span>
      </div>
    </motion.li>
  )
}

/** Where a host reads a page at a time: the next one, as the end of the list comes into view. */
function ReadOn({ root, onNear }: { root: React.RefObject<HTMLDivElement | null>; onNear: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const near = useRef(onNear)
  near.current = onNear
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const seen = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && near.current(), {
      root: root.current,
      rootMargin: "0px 0px 400px 0px"
    })
    seen.observe(el)
    return () => seen.disconnect()
  }, [root])
  return <div ref={ref} aria-hidden className="h-px" />
}

function RowButton(
  { label, keys, onClick, children }: { label: string; keys?: string; onClick: () => void; children: React.ReactNode }
) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={keys ? `${label} (${keys})` : label}
      className="flex size-8 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-ink/8 hover:text-ink"
    >
      {children}
    </button>
  )
}
