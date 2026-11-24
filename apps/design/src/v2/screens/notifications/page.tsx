import { useEffect, useRef, useState } from "react"
import { useDemo } from "../../demo.ts"
import { boxOf, BUSY_NOTES, isRead, NOTIFICATIONS, SNOOZE, useNoteMarks } from "../../fixtures/notifications.ts"
import type { NoteBox, NoteFixture, NoteKind } from "../../fixtures/notifications.ts"
import { navigate, paths, setQuery, useQuery } from "../../router.tsx"
import type { RowAction } from "../../ui/bulk.tsx"
import { typing } from "../../ui/bulk.tsx"
import { Button, IconButton } from "../../ui/button.tsx"
import { RowCheckbox } from "../../ui/checkbox.tsx"
import { cx } from "../../ui/cx.ts"
import { Dialog } from "../../ui/dialog.tsx"
import { SelectionBar } from "../../ui/filters.tsx"
import { Bell, Check, CheckCircle, Clock, Eye, EyeOff, Keyboard, RotateCcw, Settings } from "../../ui/icons.tsx"
import { Kbd } from "../../ui/kbd.tsx"
import { Page, PageHead } from "../../ui/page.tsx"
import { Rich } from "../../ui/rich.tsx"
import { Skeleton } from "../../ui/skeleton.tsx"
import { EmptyState, ErrorState } from "../../ui/states.tsx"
import { useSelection } from "../../ui/table.tsx"
import { Tabs } from "../../ui/tabs.tsx"
import { Segmented, Toggle } from "../../ui/toggle.tsx"
import { dataState, setView, useView } from "../../view.ts"
import { clearNotes, readMany, restoreNotes, setRead, snoozeNotes } from "./actions.ts"
import { NoteLead, NotePreview, sentenceOf, SnoozeMenu } from "./preview.tsx"

type Kind = "alles" | NoteKind

const KINDS: ReadonlyArray<{ readonly value: Kind; readonly label: string; readonly empty: string }> = [
  { value: "alles", label: "Alles", empty: "Je bent bij" },
  { value: "vermelding", label: "Vermeldingen", empty: "Niemand noemde je" },
  { value: "toewijzing", label: "Toewijzingen", empty: "Niets aan je toegewezen" },
  { value: "agent", label: "Agents", empty: "Je agents vroegen niets" },
  { value: "systeem", label: "Systeem", empty: "Geen systeemmeldingen" }
]

const BOXES: ReadonlyArray<
  { readonly value: NoteBox; readonly label: string; readonly title: string; readonly body: string }
> = [
  { value: "inbox", label: "Inbox", title: "", body: "Nieuwe meldingen van deze soort komen hier." },
  {
    value: "later",
    label: "Later",
    title: "Niets uitgesteld",
    body: "Zet een melding opzij met S. Hij komt terug wanneer je kiest."
  },
  {
    value: "gewist",
    label: "Gewist",
    title: "Niets gewist",
    body: "Wat je wist met E blijft hier staan, zodat je het kunt terugzetten."
  }
]

const DAYS = [
  { id: "vandaag", title: "Vandaag" },
  { id: "gisteren", title: "Gisteren" },
  { id: "eerder", title: "Eerder" }
] as const

const SHORTCUTS: ReadonlyArray<{ readonly keys: ReadonlyArray<string>; readonly what: string }> = [
  { keys: ["J"], what: "Volgende melding" },
  { keys: ["K"], what: "Vorige melding" },
  { keys: ["Enter"], what: "Het record openen" },
  { keys: ["E"], what: "Wissen, of terugzetten onder Gewist" },
  { keys: ["S"], what: "Later" },
  { keys: ["U"], what: "Gelezen of ongelezen" },
  { keys: ["X"], what: "Kiezen voor acties op meer tegelijk" },
  { keys: ["⌘", "K"], what: "Acties voor wat je koos" },
  { keys: ["Esc"], what: "Voorbeeld sluiten of keuze wissen" }
]

const isKind = (x: string | null): x is Kind => KINDS.some((k) => k.value === x)
const isBox = (x: string | null): x is NoteBox => BOXES.some((b) => b.value === x)
const plural = (n: number) => `${n} ${n === 1 ? "melding" : "meldingen"}`

/** Marks a note read and opens what it is about. */
function openRecord(n: NoteFixture) {
  setRead([n.id], true)
  if (n.href !== undefined) navigate(n.href)
}

const idsOf = (rows: ReadonlyArray<NoteFixture>) => rows.map((n) => n.id)

/**
 * Meldingen, the bell's full page: everything that happened that is about you, by day. The inbox,
 * Later (set aside till a time you pick) and Gewist (cleared, still there to bring back) are its
 * three places; the tabs cut each by what it is. A row opens its preview beside the list, where the
 * note's one act is done without leaving it; the keyboard walks the list (J and K) and acts on the
 * open note, and ticked rows get the same actions in bulk. Read and unread are the bell's own state.
 */
export function NotificationsPage() {
  const view = useView()
  const demo = useDemo()
  const marks = useNoteMarks()
  const state = dataState(view)
  const rawKind = useQuery("soort")
  const rawBox = useQuery("map")
  const kind: Kind = isKind(rawKind) ? rawKind : "alles"
  const box: NoteBox = isBox(rawBox) ? rawBox : "inbox"
  const onlyUnread = useQuery("ongelezen") === "1"
  const [activeId, setActiveId] = useState<string | null>(null)
  const [help, setHelp] = useState(false)
  const list = useRef<HTMLDivElement>(null)

  const notes: ReadonlyArray<NoteFixture> = view.staat === "druk" ? [...NOTIFICATIONS, ...BUSY_NOTES] : NOTIFICATIONS
  const read = (n: NoteFixture) => demo.notesRead || isRead(n.id)
  const inBox = notes.filter((n) => boxOf(n.id) === box)
  const shown = inBox.filter((n) => (kind === "alles" || n.kind === kind) && (!onlyUnread || !read(n)))
  const groups = DAYS.map((day) => ({ day, rows: shown.filter((n) => n.day === day.id) })).filter((g) =>
    g.rows.length > 0
  )
  const ordered = groups.flatMap((g) => g.rows)
  const selection = useSelection(ordered)
  const active = ordered.find((n) => n.id === activeId) ?? null
  const unreadIn = (k: Kind) => inBox.filter((n) => (k === "alles" || n.kind === k) && !read(n)).length
  const unreadCount = notes.filter((n) => boxOf(n.id) === "inbox" && !read(n)).length
  const laterCount = notes.filter((n) => boxOf(n.id) === "later").length

  // Moving to another place or tab closes the preview and drops the ticks.
  const { clear: clearTicks } = selection
  useEffect(() => {
    setActiveId(null)
    clearTicks()
  }, [box, kind])

  // What is open in the preview has been read, however it got there: a click, J and K.
  useEffect(() => {
    if (activeId !== null && !demo.notesRead && !isRead(activeId)) setRead([activeId], true)
  }, [activeId, demo.notesRead])

  /** After notes leave the list, the preview moves to the next one rather than closing. */
  const nextAfter = (ids: ReadonlyArray<string>) => {
    if (activeId === null || !ids.includes(activeId)) return
    const at = ordered.findIndex((n) => n.id === activeId)
    const rest = ordered.filter((n) => !ids.includes(n.id))
    setActiveId((rest[at] ?? rest[at - 1])?.id ?? null)
  }
  const clear = (ids: ReadonlyArray<string>) => {
    nextAfter(ids)
    clearNotes(ids)
  }
  const snooze = (ids: ReadonlyArray<string>, until: string) => {
    nextAfter(ids)
    snoozeNotes(ids, until)
  }
  const restore = (ids: ReadonlyArray<string>) => {
    nextAfter(ids)
    restoreNotes(ids)
  }

  // The keyboard: J and K walk, the rest act on the open note. Never while typing; with rows ticked
  // the selection bar takes E, S and U for all of them.
  const keys = useRef<(event: KeyboardEvent) => void>(() => undefined)
  keys.current = (event) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return
    const k = event.key
    const at = ordered.findIndex((n) => n.id === activeId)
    const move = (to: number) => {
      const n = ordered[Math.max(0, Math.min(ordered.length - 1, to))]
      if (n === undefined) return
      event.preventDefault()
      setActiveId(n.id)
      list.current?.querySelector(`[data-note="${n.id}"]`)?.scrollIntoView({ block: "nearest" })
    }
    if (k === "?") {
      event.preventDefault()
      setHelp(true)
    } else if (k === "j" || k === "ArrowDown") move(at + 1)
    else if (k === "k" || k === "ArrowUp") move(at < 0 ? 0 : at - 1)
    else if (k === "Escape" && activeId !== null) setActiveId(null)
    else if (active === null || selection.picked.length > 0) return
    else if (k === "Enter") {
      event.preventDefault()
      openRecord(active)
    } else if (k === "e") {
      event.preventDefault()
      if (box === "gewist") restore([active.id])
      else clear([active.id])
    } else if (k === "s" && box === "inbox") {
      event.preventDefault()
      document.querySelector<HTMLButtonElement>("[data-preview] [data-snooze]")?.click()
    } else if (k === "u") {
      event.preventDefault()
      setRead([active.id], !read(active))
    } else if (k === "x") {
      event.preventDefault()
      selection.toggle(active.id)
    }
  }
  useEffect(() => {
    if (state !== "ready") return
    const onKey = (event: KeyboardEvent) => keys.current(event)
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [state])

  const actions: ReadonlyArray<RowAction<NoteFixture>> = box === "inbox"
    ? [
      {
        id: "read",
        label: "Gelezen",
        icon: <Eye />,
        bar: true,
        applies: (n) => !read(n),
        run: (r) => readMany(idsOf(r))
      },
      {
        id: "unread",
        label: "Ongelezen",
        icon: <EyeOff />,
        shortcut: "u",
        applies: read,
        run: (r) => setRead(idsOf(r), false)
      },
      ...SNOOZE.map((choice): RowAction<NoteFixture> => ({
        id: `later-${choice.id}`,
        label: `Later: ${choice.label.toLowerCase()}`,
        icon: <Clock />,
        group: "Later",
        bar: choice.id === "morgen",
        shortcut: choice.id === "morgen" ? "s" : undefined,
        run: (r) => snooze(idsOf(r), choice.until)
      })),
      { id: "clear", label: "Wissen", icon: <CheckCircle />, bar: true, shortcut: "e", run: (r) => clear(idsOf(r)) }
    ]
    : [
      {
        id: "restore",
        label: box === "later" ? "Nu terughalen" : "Terugzetten",
        icon: <RotateCcw />,
        bar: true,
        shortcut: "e",
        run: (r) => restore(idsOf(r))
      },
      ...(box === "later"
        ? [{
          id: "clear",
          label: "Wissen",
          icon: <CheckCircle />,
          bar: true,
          run: (r: ReadonlyArray<NoteFixture>) => clear(idsOf(r))
        }]
        : []),
      { id: "read", label: "Gelezen", icon: <Eye />, applies: (n) => !read(n), run: (r) => readMany(idsOf(r)) }
    ]

  const unreadShown = shown.filter((n) => !read(n))
  const head = (
    <PageHead
      title="Meldingen"
      meta={state === "ready"
        ? (
          <>
            <span className="figure">{unreadCount}</span> ongelezen
            {laterCount > 0 && (
              <>
                {" "}· <span className="figure">{laterCount}</span> voor later
              </>
            )}
          </>
        )
        : "Vermeldingen, toewijzingen, je agents en het systeem"}
      actions={
        <>
          {state === "ready" && box !== "gewist" && (
            <Button
              size="sm"
              icon={<Check />}
              disabled={unreadShown.length === 0}
              onClick={() => readMany(idsOf(unreadShown))}
            >
              Alles gelezen
            </Button>
          )}
          {state === "ready" && box === "inbox" && (
            <Button
              size="sm"
              variant="ghost"
              icon={<CheckCircle />}
              disabled={shown.length === 0}
              onClick={() => clear(idsOf(shown))}
            >
              Alles wissen
            </Button>
          )}
          {state === "ready" && box === "gewist" && (
            <Button
              size="sm"
              icon={<RotateCcw />}
              disabled={shown.length === 0}
              onClick={() => restore(idsOf(shown))}
            >
              Alles terugzetten
            </Button>
          )}
          <IconButton label="Sneltoetsen (?)" className="hidden sm:inline-flex" onClick={() => setHelp(true)}>
            <Keyboard />
          </IconButton>
          <IconButton label="Meldingsinstellingen" onClick={() => navigate(paths.settings("meldingen"))}>
            <Settings />
          </IconButton>
        </>
      }
    />
  )

  if (state === "loading") {
    return (
      <Page width="text">
        {head}
        <div aria-busy="true" aria-label="Meldingen laden" className="flex flex-col gap-6">
          <Skeleton className="h-8 w-full max-w-md" />
          {[4, 3].map((rows, g) => (
            <div key={g} className="flex flex-col gap-1">
              <Skeleton className="mb-2 h-3.5 w-20" />
              {Array.from({ length: rows }, (_, i) => (
                <span key={i} className="flex items-start gap-3 px-2.5 py-3">
                  <Skeleton className="size-7 rounded-full" />
                  <span className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-3 w-4/5" />
                    <Skeleton className="h-2.5 w-1/3" />
                  </span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </Page>
    )
  }

  if (state === "error") {
    return (
      <Page width="text">
        {head}
        <ErrorState
          title="Meldingen laden lukte niet"
          detail="GET /notifications · 503 · req_7f2c19"
          action={<Button onClick={() => setView({ staat: "gewoon" })}>Opnieuw proberen</Button>}
        >
          Je meldingen staan nog klaar; de verbinding met de server viel weg. Probeer het zo opnieuw.
        </ErrorState>
      </Page>
    )
  }

  if (state === "empty") {
    return (
      <Page width="text">
        {head}
        <EmptyState
          glyph={Bell}
          title="Nog geen meldingen"
          action={<Button onClick={() => navigate(paths.settings("meldingen"))}>Meldingen instellen</Button>}
        >
          Noemt een collega je, wijst iemand je iets toe of vraagt een agent je ja, dan staat het hier en in de bel.
          Welke meldingen je krijgt en hoe, kies je bij Instellingen.
        </EmptyState>
      </Page>
    )
  }

  const place = BOXES.find((b) => b.value === box) ?? BOXES[0]
  const emptyTitle = onlyUnread
    ? "Alles gelezen"
    : box === "inbox"
    ? KINDS.find((k) => k.value === kind)?.empty ?? "Je bent bij"
    : place?.title ?? ""
  const unreadToggle = (
    <Toggle
      label="Alleen ongelezen tonen"
      on={onlyUnread}
      onChange={(on) => setQuery({ ongelezen: on ? "1" : null })}
    />
  )

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <Page width="text">
        {head}
        <div ref={list} className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented
              label="Plaats"
              value={box}
              onChange={(next) => setQuery({ map: next === "inbox" ? null : next })}
              options={BOXES.map((b) => ({ value: b.value, label: b.label }))}
            />
            <label className="flex items-center gap-2 text-xs text-ink-2">
              Alleen ongelezen
              {unreadToggle}
            </label>
          </div>
          <Tabs
            label="Soort melding"
            value={kind}
            onChange={(next) => setQuery({ soort: next === "alles" ? null : next })}
            tabs={KINDS.map((k) => ({ value: k.value, label: k.label, count: unreadIn(k.value) || undefined }))}
          />

          {selection.picked.length > 0
            ? (
              <SelectionBar
                rows={selection.picked}
                actions={actions}
                noun={["melding", "meldingen"]}
                onClear={selection.clear}
                className="sticky top-0 z-10"
              />
            )
            : ordered.length > 0 && (
              <div className="flex min-h-9 items-center gap-3 px-2.5 text-xs text-ink-3">
                <RowCheckbox
                  label="Alles kiezen"
                  checked={selection.all}
                  indeterminate={selection.some}
                  onChange={selection.setAll}
                />
                <span className="figure">{plural(ordered.length)}</span>
                <span className="ml-auto hidden items-center gap-1 sm:inline-flex">
                  <Kbd>J</Kbd> <Kbd>K</Kbd> om te lopen, <Kbd>?</Kbd> voor alle sneltoetsen
                </span>
              </div>
            )}

          {ordered.length === 0
            ? (
              <EmptyState
                glyph={box === "later" ? Clock : Bell}
                size="sm"
                title={emptyTitle}
                action={onlyUnread || kind !== "alles"
                  ? (
                    <Button size="sm" onClick={() => setQuery({ soort: null, ongelezen: null })}>
                      Alle meldingen tonen
                    </Button>
                  )
                  : box === "inbox"
                  ? <Button size="sm" onClick={() => setQuery({ map: "gewist" })}>Gewist bekijken</Button>
                  : undefined}
              >
                {onlyUnread ? "Zet het filter uit om ook de gelezen meldingen te zien." : place?.body}
              </EmptyState>
            )
            : groups.map(({ day, rows }) => (
              <section key={day.id} aria-labelledby={`dag-${day.id}`} className="flex flex-col gap-1">
                <h2 id={`dag-${day.id}`} className="flex items-baseline gap-2 px-2.5 text-sm font-semibold text-ink">
                  {day.title}
                  <span className="figure text-xs font-normal text-ink-3">{rows.length}</span>
                </h2>
                <ul className="flex flex-col">
                  {rows.map((note) => (
                    <NoteRow
                      key={note.id}
                      note={note}
                      box={box}
                      read={read(note)}
                      until={marks[note.id]?.until}
                      active={note.id === activeId}
                      checked={selection.has(note.id)}
                      selecting={selection.picked.length > 0}
                      onOpen={() => setActiveId(note.id)}
                      onCheck={() =>
                        selection.toggle(note.id)}
                      onRead={() =>
                        setRead([note.id], !read(note))}
                      onSnooze={(until) =>
                        snooze([note.id], until)}
                      onClear={() => clear([note.id])}
                      onRestore={() => restore([note.id])}
                    />
                  ))}
                </ul>
              </section>
            ))}
        </div>
      </Page>

      {/* The preview: a pane beside the list from `lg`, the whole screen below it. */}
      <aside
        data-preview=""
        aria-label="Voorbeeld van de melding"
        className={cx(
          "min-h-0 flex-col bg-panel lg:w-[26rem] lg:shrink-0 xl:w-[28rem]",
          active === null ? "hidden lg:flex" : "fixed inset-0 z-40 flex lg:static lg:z-auto"
        )}
      >
        {active !== null
          ? (
            <NotePreview
              note={active}
              read={read(active)}
              box={box}
              until={marks[active.id]?.until}
              done={marks[active.id]?.done === true}
              onClose={() => setActiveId(null)}
              onSnooze={(until) => snooze([active.id], until)}
              onClear={() => clear([active.id])}
              onRestore={() => restore([active.id])}
            />
          )
          : ordered.length > 0 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
              <p className="text-sm font-medium text-ink">Kies een melding</p>
              <p className="text-sm text-pretty text-ink-3">
                Hij opent hier, met wat het record zegt en wat je eraan kunt doen.
              </p>
              <p className="flex items-center gap-1 pt-1 text-xs text-ink-3">
                <Kbd>J</Kbd> <Kbd>K</Kbd> lopen door de lijst
              </p>
            </div>
          )}
      </aside>

      <Dialog
        open={help}
        onClose={() => setHelp(false)}
        title="Sneltoetsen voor meldingen"
        description="Ze werken nooit terwijl je typt."
        size="sm"
      >
        <dl className="flex flex-col pb-3">
          {SHORTCUTS.map((s) => (
            <div key={s.what} className="flex min-h-9 items-center justify-between gap-3 text-sm">
              <dt className="text-ink-2">{s.what}</dt>
              <dd className="flex gap-1">{s.keys.map((key) => <Kbd key={key}>{key}</Kbd>)}</dd>
            </div>
          ))}
        </dl>
      </Dialog>
    </div>
  )
}

function NoteRow(
  { note, box, read, until, active, checked, selecting, onOpen, onCheck, onRead, onSnooze, onClear, onRestore }: {
    readonly note: NoteFixture
    readonly box: NoteBox
    readonly read: boolean
    readonly until?: string
    readonly active: boolean
    readonly checked: boolean
    readonly selecting: boolean
    readonly onOpen: () => void
    readonly onCheck: () => void
    readonly onRead: () => void
    readonly onSnooze: (until: string) => void
    readonly onClear: () => void
    readonly onRestore: () => void
  }
) {
  const reveal =
    "pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:group-focus-within:opacity-100"
  return (
    <li
      data-note={note.id}
      className={cx(
        "group flex items-start gap-1 rounded-md transition-colors",
        checked ? "bg-accent-tint" : active ? "bg-selected" : "hover:bg-hover"
      )}
    >
      <span className={cx("flex shrink-0 pt-3.5 pl-2.5", !selecting && !checked && reveal)}>
        <RowCheckbox label={`Kiezen: ${note.record ?? "melding"}`} checked={checked} onChange={onCheck} />
      </span>
      <button
        type="button"
        aria-current={active ? "true" : undefined}
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-start gap-3 rounded-md py-3 pl-1.5 text-left"
      >
        <span className="flex shrink-0 pt-0.5">
          <NoteLead note={note} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className={cx("text-sm text-pretty", read ? "text-ink-2" : "text-ink")}>
            <Rich text={sentenceOf(note)} />
          </span>
          {note.quote !== undefined && (
            <span className="line-clamp-2 text-sm text-pretty text-ink-2">‘{note.quote}’</span>
          )}
          <span className="text-2xs text-ink-3">
            {note.record !== undefined && <>{note.record} ·{" "}</>}
            {box === "later" && until !== undefined
              ? <span className="text-accent-ink">terug {until}</span>
              : <span className="figure">{note.at}</span>}
          </span>
        </span>
      </button>
      <span className="flex shrink-0 items-center gap-0.5 py-2 pr-1.5">
        <span className="flex w-3 justify-center">
          {!read && (
            <>
              <span className="size-2 rounded-full bg-accent" aria-hidden="true" />
              <span className="sr-only">ongelezen</span>
            </>
          )}
        </span>
        <span className={cx("flex items-center gap-0.5", reveal)}>
          <IconButton
            size="sm"
            label={read ? "Markeren als ongelezen (U)" : "Markeren als gelezen (U)"}
            onClick={onRead}
            className="pointer-coarse:size-11"
          >
            {read ? <EyeOff /> : <Eye />}
          </IconButton>
          {box === "inbox" && <SnoozeMenu onSnooze={onSnooze} />}
          {box !== "inbox" && (
            <IconButton
              size="sm"
              label={box === "later" ? "Nu terughalen" : "Terugzetten (E)"}
              onClick={onRestore}
              className="pointer-coarse:size-11"
            >
              <RotateCcw />
            </IconButton>
          )}
          {box !== "gewist" && (
            <IconButton size="sm" label="Wissen (E)" onClick={onClear} className="pointer-coarse:size-11">
              <CheckCircle />
            </IconButton>
          )}
        </span>
      </span>
    </li>
  )
}
