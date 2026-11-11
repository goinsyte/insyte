import { Link } from "@tanstack/react-router"
import { motion, useReducedMotion } from "motion/react"
import { useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "../../components/popover"
import { ArrowRight, Check, Pin, Plus, Search, Star } from "../../icons"
import { clock, dayKey } from "../lib/home/dates"
import { KIND, type Moment } from "../lib/home/kinds"
import { type Note, noteTime } from "../lib/notifications"
import { cn } from "../lib/utils"
import { NoteLead, NoteSentence } from "../notifications/note-parts"
import type { Shortcut } from "../stores/pins-store"
import { Quiet, SHORT, ShortcutRow } from "./card-views"

/*
 * The board's day cards over plain items: "Agenda vandaag", "Vermeldingen en toegewezen" and "Bladwijzers". What a
 * host hands them is the demo's stores or the console's `Home.agenda`, inbox and `pins` preference; nothing here reads
 * a store, so the console draws them with no data source installed (ADR-0034).
 */

function More({ to, search, children }: { to: string; search?: Record<string, string>; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      search={search as never}
      className="mt-1 flex h-7 w-fit items-center gap-1 rounded-md px-2 font-medium text-sm text-arc-ink transition-colors hover:bg-arc-tint"
    >
      {children}
      <ArrowRight className="size-3.5" strokeWidth={2} />
    </Link>
  )
}

const TICK: Record<Moment["tone"], string> = {
  red: "bg-signal-red",
  amber: "bg-signal-amber",
  arc: "bg-arc",
  green: "bg-signal-green",
  ink: "bg-ink-4"
}

/**
 * Today on one ruled line: everything with a time today from across the console, the past in
 * `ink-3`, and the `arc` now-line between what is behind and what is ahead.
 */
export function TodayView({ now, moments }: { now: number; moments: ReadonlyArray<Moment> }) {
  const still = useReducedMotion()
  const today = dayKey(now)
  const timed = moments.filter((m) => !m.allDay && dayKey(m.at) === today)
  const allDay = moments.filter((m) => m.allDay && dayKey(m.at) === today)
  const split = timed.findIndex((m) => m.at > now)
  const cut = split === -1 ? timed.length : split
  // The two before now and what is ahead, so the line is always about the rest of the day.
  const from = Math.max(0, cut - 2)
  const shown = timed.slice(from, from + 8)
  const at = cut - from
  const later = timed.length - from - shown.length

  if (timed.length === 0 && allDay.length === 0) return <Quiet>Niets gepland vandaag.</Quiet>
  return (
    <div className="flex flex-col">
      {allDay.length > 0 ?
        (
          <div className="mb-1.5 flex flex-wrap gap-1 px-1">
            {allDay.map((m) => (
              <Link
                key={m.id}
                to={m.to}
                search={m.search as never}
                className="flex h-6 max-w-full items-center gap-1.5 rounded-sm bg-arc-tint px-1.5 text-xs text-arc-ink"
              >
                <Check className="size-3 shrink-0" strokeWidth={2} />
                <span className="truncate">{m.title}</span>
              </Link>
            ))}
          </div>
        ) :
        null}
      <ol className="relative">
        <span aria-hidden className="absolute top-1 bottom-1 left-[51px] w-px bg-ink/10" />
        {shown.map((m, i) => (
          <li key={m.id}>
            {i === at ? <NowLine now={now} still={still} /> : null}
            <Link
              to={m.to}
              search={m.search as never}
              className={cn(
                "group/m relative flex h-9 items-center rounded-md pr-2 transition-colors hover:bg-ink/[0.045]",
                i < at ? "text-ink-3" : "text-ink"
              )}
            >
              <span className="w-11 shrink-0 text-right text-xs text-ink-3 tabular-nums">{clock(m.at)}</span>
              <span
                aria-hidden
                className={cn("mx-[5px] h-[3px] w-[9px] shrink-0 rounded-full", i < at ? "bg-ink-4" : TICK[m.tone])}
              />
              <span className="flex min-w-0 flex-1 flex-col pl-1.5 leading-tight">
                <span className="truncate text-base">{m.title}</span>
                <span className="truncate text-xs text-ink-3">
                  {KIND[m.kind].label}
                  {m.detail ? ` · ${m.detail}` : ""}
                </span>
              </span>
            </Link>
          </li>
        ))}
        {at >= shown.length ? <NowLine now={now} still={still} /> : null}
      </ol>
      <More to="/dashboard" search={{ view: "agenda" }}>
        {later > 0 ? `Nog ${later} vandaag in de agenda` : "Hele agenda"}
      </More>
    </div>
  )
}

function NowLine({ now, still }: { now: number; still: boolean | null }) {
  return (
    <div className="relative flex h-5 items-center" aria-label={`Nu, ${clock(now)}`}>
      <span className="w-11 shrink-0 text-right font-medium text-xs text-arc-ink tabular-nums">{clock(now)}</span>
      <motion.span
        aria-hidden
        className="ml-[5px] h-[2px] flex-1 origin-left rounded-full bg-arc"
        initial={still ? false : { scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  )
}

/**
 * What reached the member directly, newest first: `mine` is every such note in the inbox, of which the card shows five.
 * Reading them is the host's: the demo's store, or `Notifications.setRead`.
 */
export function MentionsView({
  mine,
  now,
  onRead: setRead
}: {
  mine: ReadonlyArray<Note>
  now: number
  onRead: (ids: ReadonlyArray<string>, read: boolean) => void
}) {
  const unread = mine.filter((n) => !n.read)

  if (mine.length === 0) return <Quiet>Niets voor jou.</Quiet>
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 px-2 text-sm text-ink-2">
        <span className="flex-1 tabular-nums">
          {unread.length === 0 ? "Alles gelezen" : `${unread.length} ongelezen`}
        </span>
        {unread.length > 0 ?
          (
            <button
              type="button"
              onClick={() => {
                const ids = unread.map((n) => n.id)
                setRead(ids, true)
              }}
              className="h-7 cursor-pointer rounded-md px-2 font-medium text-sm text-arc-ink transition-colors hover:bg-arc-tint"
            >
              Alles gelezen
            </button>
          ) :
          null}
      </div>
      <ul className="flex flex-col">
        {mine.slice(0, 5).map((n) => (
          <li key={n.id} className="group/n relative">
            <Link
              to={n.to}
              search={n.search as never}
              onClick={() => setRead([n.id], true)}
              className="flex min-w-0 items-start gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-ink/[0.045]"
            >
              <NoteLead note={n} size={26} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <NoteSentence note={n} className={cn("line-clamp-1 text-base", n.read ? "text-ink-2" : "text-ink")} />
                {n.detail ? <span className="line-clamp-1 text-xs text-ink-3">{n.detail}</span> : null}
              </span>
              <span className="flex shrink-0 items-center gap-1.5 pt-0.5 text-xs text-ink-3 tabular-nums">
                {noteTime(n.at, now)}
                {n.read ? null : <span className="size-1.5 rounded-full bg-arc" aria-label="Ongelezen" />}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {mine.length > 5 ? <More to="/notifications">Nog {mine.length - 5} in meldingen</More> : null}
    </div>
  )
}

/** What a bookmark's controls do, and what the picker finds for what is typed. */
export interface BookmarkActions {
  readonly unpin: (s: Shortcut) => void
  readonly repin: (s: Shortcut) => void
  readonly unfavourite: (s: Shortcut) => void
  /** The records matching `q`, at most eight, that are not already kept. */
  readonly useHits: (q: string, taken: ReadonlyArray<Shortcut>) => ReadonlyArray<Shortcut>
}

/** The member's pinned and favourite records, and "Bladwijzer toevoegen". */
export function BookmarksView({
  pinned,
  favourites,
  actions
}: {
  pinned: ReadonlyArray<Shortcut>
  favourites: ReadonlyArray<Shortcut>
  actions: BookmarkActions
}) {
  const { unpin, repin, unfavourite } = actions
  const [open, setOpen] = useState(false)
  const empty = pinned.length === 0 && favourites.length === 0

  const add = (
    <AddBookmark
      open={open}
      onOpenChange={setOpen}
      taken={[...pinned, ...favourites]}
      useHits={actions.useHits}
      onPick={(s) => {
        repin(s)
        setOpen(false)
      }}
    />
  )

  if (empty) {
    return (
      <div className="flex flex-col items-start gap-2 rounded-lg bg-band px-3 py-3">
        <p className="text-sm text-ink-2">Nog niets vastgezet.</p>
        {add}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      <ul className="flex flex-col">
        {pinned.map((p) => (
          <ShortcutRow
            key={`p-${p.to}-${p.label}`}
            s={p}
            trail={<Pin className="size-3 shrink-0 text-ink-4" strokeWidth={1.75} aria-label="Vastgezet" />}
            onRemove={() => unpin(p)}
          />
        ))}
        {favourites.map((f) => (
          <ShortcutRow
            key={`f-${f.to}-${f.label}`}
            s={f}
            trail={<Star className="size-3 shrink-0 text-ink-4" strokeWidth={1.75} aria-label="Favoriet" />}
            onRemove={() => unfavourite(f)}
          />
        ))}
      </ul>
      {add}
    </div>
  )
}

function AddBookmark({
  open,
  onOpenChange,
  taken,
  useHits,
  onPick
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  taken: ReadonlyArray<Shortcut>
  useHits: BookmarkActions["useHits"]
  onPick: (s: Shortcut) => void
}) {
  const [q, setQ] = useState("")
  const hits = useHits(q, taken)
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-7 w-fit cursor-pointer items-center gap-1.5 rounded-md px-2 font-medium text-sm text-arc-ink transition-colors hover:bg-arc-tint"
        >
          <Plus className="size-3.5" strokeWidth={2} />
          Bladwijzer toevoegen
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-1.5">
        <label className="field flex h-9 items-center gap-2 rounded-md px-2.5 focus-within:bg-paper">
          <Search className="size-3.5 shrink-0 text-ink-3" strokeWidth={1.75} />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && hits[0]) onPick(hits[0])
            }}
            placeholder="Zoek een bestelling, klant, zaak of product"
            aria-label="Record zoeken"
            className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-3"
          />
        </label>
        <ul className="mt-1 flex max-h-72 flex-col overflow-y-auto">
          {hits.map((h) => {
            const k = SHORT[h.kind]
            return (
              <li key={`${h.to}|${h.label}`}>
                <button
                  type="button"
                  onClick={() => onPick(h)}
                  className="flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-md px-2 text-left text-base text-ink transition-colors hover:bg-ink/6"
                >
                  <k.icon className="size-3.5 shrink-0 text-ink-3" strokeWidth={1.75} />
                  <span className="min-w-0 flex-1 truncate">{h.label}</span>
                  <span className="shrink-0 text-xs text-ink-3">{k.area}</span>
                </button>
              </li>
            )
          })}
          {hits.length === 0 ? <li className="px-2 py-2 text-sm text-ink-3">Niets gevonden met “{q}”.</li> : null}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
