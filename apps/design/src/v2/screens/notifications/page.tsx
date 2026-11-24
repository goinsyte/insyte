import type { ReactNode } from "react"
import { getDemo, setNotesRead, unreadNotes, useDemo } from "../../demo.ts"
import { AGENTS } from "../../fixtures/agents.ts"
import { BUSY_NOTES, NOTIFICATIONS, setNoteOverride, setNoteOverrides } from "../../fixtures/notifications.ts"
import type { NoteFixture, NoteKind } from "../../fixtures/notifications.ts"
import { Link, navigate, paths, setQuery, useQuery } from "../../router.tsx"
import { AgentAvatar, Avatar } from "../../ui/avatar.tsx"
import { Button, IconButton } from "../../ui/button.tsx"
import { cx } from "../../ui/cx.ts"
import { Bell, Bot, Check, Eye, EyeOff, Settings } from "../../ui/icons.tsx"
import { GlyphTile } from "../../ui/list.tsx"
import { Page, PageHead } from "../../ui/page.tsx"
import { Rich } from "../../ui/rich.tsx"
import { ServiceLogo } from "../../ui/service-logo.tsx"
import { Skeleton } from "../../ui/skeleton.tsx"
import { EmptyState, ErrorState } from "../../ui/states.tsx"
import { Tabs } from "../../ui/tabs.tsx"
import { toast } from "../../ui/toast.tsx"
import { Toggle } from "../../ui/toggle.tsx"
import { dataState, setView, useView } from "../../view.ts"

type Filter = "alles" | NoteKind

const FILTERS: ReadonlyArray<{ readonly value: Filter; readonly label: string; readonly empty: string }> = [
  { value: "alles", label: "Alles", empty: "Je bent bij" },
  { value: "vermelding", label: "Vermeldingen", empty: "Niemand noemde je" },
  { value: "toewijzing", label: "Toewijzingen", empty: "Niets aan je toegewezen" },
  { value: "agent", label: "Agents", empty: "Je agents vroegen niets" },
  { value: "systeem", label: "Systeem", empty: "Geen systeemmeldingen" }
]

const DAYS = [
  { id: "vandaag", title: "Vandaag" },
  { id: "gisteren", title: "Gisteren" },
  { id: "eerder", title: "Eerder" }
] as const

const isFilter = (x: string | null): x is Filter => FILTERS.some((f) => f.value === x)

/**
 * Meldingen, the bell's full page: everything that happened that is about you, by day, filtered by
 * what it is (vermeldingen, toewijzingen, agents, systeem). Read or unread is the bell's own state:
 * "Alles gelezen" here and in the bell is one switch, and a single note read here takes the bell's
 * dot with it. A row opens its record and counts as read; the eye marks it without leaving.
 */
export function NotificationsPage() {
  const view = useView()
  const demo = useDemo()
  const state = dataState(view)
  const raw = useQuery("soort")
  const filter: Filter = isFilter(raw) ? raw : "alles"
  const onlyUnread = useQuery("ongelezen") === "1"

  const notes: ReadonlyArray<NoteFixture> = view.staat === "druk" ? [...NOTIFICATIONS, ...BUSY_NOTES] : NOTIFICATIONS
  const unread = (n: NoteFixture) => !demo.notesRead && n.unread
  const unreadCount = unreadNotes(demo)
  const shown = notes.filter((n) => (filter === "alles" || n.kind === filter) && (!onlyUnread || unread(n)))
  const countOf = (f: Filter) => notes.filter((n) => (f === "alles" || n.kind === f) && unread(n)).length

  const head = (
    <PageHead
      title="Meldingen"
      meta={state === "ready"
        ? (
          <>
            <span className="figure">{unreadCount}</span>{" "}
            ongelezen · vermeldingen, toewijzingen, je agents en het systeem
          </>
        )
        : "Vermeldingen, toewijzingen, je agents en het systeem"}
      actions={
        <>
          <Button size="sm" icon={<Check />} disabled={state !== "ready" || unreadCount === 0} onClick={readAll}>
            Alles gelezen
          </Button>
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

  const current = FILTERS.find((f) => f.value === filter)
  return (
    <Page width="text">
      {head}
      <div className="flex flex-col gap-6">
        <Tabs
          label="Soort melding"
          value={filter}
          onChange={(next) => setQuery({ soort: next === "alles" ? null : next })}
          tabs={FILTERS.map((f) => ({ value: f.value, label: f.label, count: countOf(f.value) || undefined }))}
          end={
            <label className="hidden shrink-0 items-center gap-2 pl-3 text-xs text-ink-2 sm:flex">
              Alleen ongelezen
              <Toggle
                label="Alleen ongelezen tonen"
                on={onlyUnread}
                onChange={(on) => setQuery({ ongelezen: on ? "1" : null })}
              />
            </label>
          }
        />
        <label className="-mt-3 flex min-h-11 items-center justify-between gap-2 text-sm text-ink-2 sm:hidden">
          Alleen ongelezen
          <Toggle
            label="Alleen ongelezen tonen"
            on={onlyUnread}
            onChange={(on) => setQuery({ ongelezen: on ? "1" : null })}
          />
        </label>

        {shown.length === 0
          ? (
            <EmptyState
              glyph={Bell}
              size="sm"
              title={onlyUnread ? "Alles gelezen" : current?.empty ?? "Je bent bij"}
              action={
                <Button size="sm" onClick={() => setQuery({ soort: null, ongelezen: null })}>
                  Alle meldingen tonen
                </Button>
              }
            >
              {onlyUnread
                ? "Zet het filter uit om ook de gelezen meldingen te zien."
                : "Nieuwe meldingen van deze soort komen hier."}
            </EmptyState>
          )
          : DAYS.map((day) => {
            const rows = shown.filter((n) => n.day === day.id)
            if (rows.length === 0) return null
            return (
              <section key={day.id} aria-labelledby={`dag-${day.id}`} className="flex flex-col gap-1">
                <h2 id={`dag-${day.id}`} className="px-2.5 text-sm font-semibold text-ink">{day.title}</h2>
                <ul className="flex flex-col">
                  {rows.map((note) => <NoteRow key={note.id} note={note} unread={unread(note)} />)}
                </ul>
              </section>
            )
          })}
      </div>
    </Page>
  )
}

/** "Alles gelezen": the bell's own switch, with the way back. */
function readAll() {
  setNotesRead(true)
  toast({
    title: "Alles gelezen",
    tone: "good",
    action: { label: "Ongedaan maken", onClick: () => setNotesRead(false) }
  })
}

/** Set one note read or unread, and let the bell and the menu's count hear it. */
function mark(note: NoteFixture, read: boolean) {
  const demo = getDemo()
  if (!read && demo.notesRead) {
    // Everything was read in one go; bringing one back means the rest stay read, one by one.
    setNoteOverrides(Object.fromEntries(NOTIFICATIONS.map((n) => [n.id, n.id !== note.id])))
    setNotesRead(false)
    return
  }
  setNoteOverride(note.id, read)
  // The demo store is what the bell listens to; setting it to what it is tells it to look again.
  setNotesRead(demo.notesRead)
}

function NoteRow({ note, unread }: { readonly note: NoteFixture; readonly unread: boolean }) {
  const body: ReactNode = (
    <>
      <span className={cx("text-sm text-pretty", unread ? "text-ink" : "text-ink-2")}>
        {/* The bell quotes the start of what was written; the page quotes it in full under the line. */}
        <Rich text={note.quote === undefined ? note.text : note.text.replace(/: ‘[^’]*’$/, "")} />
      </span>
      {note.quote !== undefined && <span className="text-sm text-pretty text-ink-2">‘{note.quote}’</span>}
      <span className="text-2xs text-ink-3">
        {note.record !== undefined && <>{note.record} ·{" "}</>}
        <span className="figure">{note.at}</span>
      </span>
    </>
  )
  return (
    <li className="group flex items-start gap-1 rounded-md transition-colors hover:bg-hover">
      {note.href === undefined
        ? (
          <div className="flex min-w-0 flex-1 items-start gap-3 px-2.5 py-3">
            <span className="flex shrink-0 pt-0.5">{markOf(note)}</span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">{body}</span>
          </div>
        )
        : (
          <Link
            to={note.href}
            onClick={() => {
              if (unread) mark(note, true)
            }}
            className="flex min-w-0 flex-1 items-start gap-3 rounded-md px-2.5 py-3"
          >
            <span className="flex shrink-0 pt-0.5">{markOf(note)}</span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">{body}</span>
          </Link>
        )}
      <span className="flex shrink-0 items-center gap-1 py-2 pr-1.5">
        <span className="flex w-2 justify-center">
          {unread && (
            <>
              <span className="size-2 rounded-full bg-accent" aria-hidden="true" />
              <span className="sr-only">ongelezen</span>
            </>
          )}
        </span>
        <IconButton
          size="sm"
          label={unread ? "Markeren als gelezen" : "Markeren als ongelezen"}
          onClick={() => mark(note, unread)}
          className={cx(
            "pointer-coarse:size-11",
            !unread &&
              "pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-visible:opacity-100"
          )}
        >
          {unread ? <Eye /> : <EyeOff />}
        </IconButton>
      </span>
    </li>
  )
}

function markOf(note: NoteFixture) {
  if (note.from.kind === "person") return <Avatar name={note.from.name} size={28} />
  if (note.from.kind === "agent") {
    const id = note.from.agentId
    const agent = AGENTS.find((a) => a.id === id)
    if (agent !== undefined) return <AgentAvatar glyph={agent.glyph} size={28} />
    return (
      <GlyphTile size={28}>
        <Bot size={15} />
      </GlyphTile>
    )
  }
  if (note.from.service !== undefined) return <ServiceLogo service={note.from.service} size={28} />
  return (
    <GlyphTile size={28}>
      <Bell size={15} />
    </GlyphTile>
  )
}
