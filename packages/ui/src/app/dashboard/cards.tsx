import { Link } from "@tanstack/react-router"
import { motion, useReducedMotion } from "motion/react"
import { useMemo, useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "../../components/popover"
import { automations } from "../../data-source"
import { conversations } from "../../data-source"
import { customers } from "../../data-source"
import { products } from "../../data-source"
import { suppliers } from "../../data-source"
import { SCENARIO } from "../../data-source"
import {
  ArrowRight,
  Check,
  Hash,
  type IconComponent,
  Inbox,
  Mail,
  Pin,
  Plus,
  Search,
  Sparkle,
  Star,
  Workflow
} from "../../icons"
import { UndoControl, useNow } from "../ask/agent-parts"
import { Glyph } from "../common/glyph"
import { canUndo } from "../lib/agent-log"
import { counts } from "../lib/analytics/engine"
import { type Country, COUNTRY_NAME, HISTORY, HISTORY_END } from "../lib/analytics/history"
import { initials } from "../lib/format"
import { clock, dayKey } from "../lib/home/dates"
import { KIND, type Moment } from "../lib/home/day"
import { convert } from "../lib/money"
import { dayGroup, noteTime, stateOf } from "../lib/notifications"
import { personStyle } from "../lib/person-color"
import { undoable } from "../lib/undo"
import { cn } from "../lib/utils"
import { useHeardNotes } from "../notifications/heard"
import { NoteLead, NoteSentence } from "../notifications/note-parts"
import { useAgentEntries } from "../stores/agent-log-store"
import { useChatStore } from "../stores/chat-store"
import { useHome } from "../stores/home-store"
import { useInbox } from "../stores/inbox-store"
import { useLive } from "../stores/live-store"
import { useNotifications } from "../stores/notifications-store"
import { type Shortcut, usePins } from "../stores/pins-store"
import { useWorkspace } from "../stores/workspace-store"
import { useDay } from "./use-day"

import { BestsellersView, CountriesView, LiveView, Quiet, RecentView, ROW, SHORT, ShortcutRow } from "./card-views"
/*
 * The home's compact cards, in ClickUp's density: 32–36px rows, one line each, the record's own glyph
 * and where it lives ("in Bestellingen"), a time at the end. Each one reads a store the rest of the
 * console writes to, so they move while the operator works elsewhere — a ticket closed on Tickets
 * leaves "Vermeldingen", a record opened anywhere lands at the head of "Recent".
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

/* ─── Agenda vandaag ───────────────────────────────────────────────────── */

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
export function TodayCard() {
  const { now, moments } = useDay()
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

/* ─── Live bestellingen ────────────────────────────────────────────────── */

/**
 * Orders as they arrive. A new one slides in at the head and its band glows `arc-tint` for a moment
 * before it settles; reduced motion just shows it. Pausing holds the list still while it is read.
 */
export function LiveCard() {
  const orders = useLive((s) => s.orders)
  const paused = useLive((s) => s.paused)
  const setPaused = useLive((s) => s.setPaused)
  const auto = useHome((s) => s.autoRefresh)
  const currency = useHome((s) => s.currency)
  const today = orders.filter((o) => dayKey(o.at) === dayKey())
  const sum = today.reduce((n, o) => n + convert(o.total, "USD", currency), 0)
  if (SCENARIO === "empty") {
    return <Quiet>Nog geen bestellingen.</Quiet>
  }
  return (
    <LiveView
      rows={orders.slice(0, 6).map((o) => ({
        id: o.id,
        number: o.number,
        customer: o.customer,
        qty: o.qty,
        title: o.title,
        image: o.image,
        total: convert(o.total, "USD", currency),
        country: o.country,
        at: o.at,
        to: `/products/${o.productId}`
      }))}
      today={{ count: today.length, sum }}
      auto={auto}
      paused={paused}
      onPause={setPaused}
      currency={currency}
    />
  )
}

/* ─── Vermeldingen en toegewezen ───────────────────────────────────────── */

export function MentionsCard() {
  const notes = useHeardNotes("admin")
  const setRead = useNotifications((s) => s.setRead)
  const now = Date.now()
  const mine = notes
    .filter((n) => n.reason !== undefined && stateOf(n, now) === "inbox")
    .toSorted((a, b) => Date.parse(b.at) - Date.parse(a.at))
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
                undoable(`${ids.length} als gelezen gemarkeerd`, () => setRead(ids, false))
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

/* ─── Recent and bookmarks ─────────────────────────────────────────────── */

export function RecentCard() {
  const recent = usePins((s) => s.recent)
  return <RecentView recent={recent} />
}

/** What can be bookmarked: every record the workspace holds that has a page of its own. */
function useCandidates(): Shortcut[] {
  const orders = useWorkspace((s) => s.orders)
  const chargebacks = useWorkspace((s) => s.chargebacks)
  return useMemo(
    () => [
      ...chargebacks.map((c): Shortcut => ({ to: `/chargebacks/${c.id}`, label: c.case_number, kind: "chargeback" })),
      ...orders.map((o): Shortcut => ({ to: `/orders/${o.id}`, label: `Bestelling ${o.number}`, kind: "order" })),
      ...customers.map((c): Shortcut => ({ to: `/customers/${c.id}`, label: c.name, kind: "customer" })),
      ...products.map((p): Shortcut => ({ to: `/products/${p.id}`, label: p.title, kind: "product" })),
      ...automations.map((a): Shortcut => ({ to: `/automations/${a.id}`, label: a.name, kind: "automation" })),
      ...suppliers.map((s): Shortcut => ({ to: "/suppliers", label: s.name, kind: "supplier" }))
    ],
    [orders, chargebacks]
  )
}

export function BookmarksCard() {
  const pinned = usePins((s) => s.pinned)
  const favourites = usePins((s) => s.favourites)
  const unpin = usePins((s) => s.unpin)
  const repin = usePins((s) => s.repin)
  const unfavourite = usePins((s) => s.unfavourite)
  const favourite = usePins((s) => s.favourite)
  const [open, setOpen] = useState(false)
  const empty = pinned.length === 0 && favourites.length === 0

  const add = (
    <AddBookmark
      open={open}
      onOpenChange={setOpen}
      taken={[...pinned, ...favourites]}
      onPick={(s) => {
        repin(s)
        setOpen(false)
        undoable(`${s.label} als bladwijzer bewaard`, () => usePins.getState().unpin(s.to, s.label))
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
            onRemove={() => {
              unpin(p.to, p.label)
              undoable(`${p.label} losgemaakt`, () => repin(p))
            }}
          />
        ))}
        {favourites.map((f) => (
          <ShortcutRow
            key={`f-${f.to}-${f.label}`}
            s={f}
            trail={<Star className="size-3 shrink-0 text-ink-4" strokeWidth={1.75} aria-label="Favoriet" />}
            onRemove={() => {
              unfavourite(f.to, f.label)
              undoable(`${f.label} uit je favorieten`, () => favourite(f))
            }}
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
  onPick
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  taken: ReadonlyArray<Shortcut>
  onPick: (s: Shortcut) => void
}) {
  const all = useCandidates()
  const [q, setQ] = useState("")
  const has = new Set(taken.map((t) => `${t.to}|${t.label}`))
  const hits = all
    .filter((c) => !has.has(`${c.to}|${c.label}`) && c.label.toLowerCase().includes(q.trim().toLowerCase()))
    .slice(0, 8)
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

/* ─── Wat Insyte deed ──────────────────────────────────────────────────── */

const MIN_PER = { draft: 4, plate: 12, run: 2, action: 1 }

const duration = (min: number) => {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h === 0 ? `${m} min` : m === 0 ? `${h} u` : `${h} u ${m} min`
}

/** One line of Insyte's card: what it did, as a door to where it waits. */
const line = (
  icon: IconComponent,
  to: string,
  search: Record<string, string> | undefined,
  figure: string,
  text: string,
  trail?: string
) => (
  <li>
    <Link to={to} search={search as never} className={cn(ROW, "glyph-host")}>
      <Glyph icon={icon} size={14} draw={false} className="shrink-0 text-arc-ink" />
      <span className="min-w-0 flex-1 truncate text-base text-ink">
        <span className="font-medium tabular-nums">{figure}</span> {text}
      </span>
      {trail ? <span className="shrink-0 text-xs text-ink-2 tabular-nums">{trail}</span> : null}
    </Link>
  </li>
)

/**
 * Today's work Insyte did before anyone asked, each line the door to the place it is waiting. It
 * proposes and the operator decides, so a draft is "opgesteld", never "verstuurd", until someone
 * sends it. The time saved is a sum with its rates beside it, so it can be checked, not believed.
 */
export function InsyteCard() {
  const queue = useWorkspace((s) => s.queue)
  const threads = useInbox((s) => s.threads)
  const notes = useHeardNotes("admin")
  const drawn = queue.filter((q) => q.plate)
  const waiting = drawn.filter((q) => q.state === "open").length
  const filed = drawn.filter((q) => q.state === "filed").length
  const open = threads.filter((t) => !t.archived && !t.spam)
  const drafts = open.filter((t) => (t.sent ?? []).length === 0).length
  const sent = open.filter((t) => (t.sent ?? []).length > 0).length
  const active = automations.filter((a) => a.status === "active")
  const runs = active.reduce((n, a) => n + (a.runs_30d > 0 ? Math.max(1, Math.round(a.runs_30d / 30)) : 0), 0)
  const failed = notes.filter((n) => n.event === "automation.failed" && dayGroup(n.at, Date.now()) === "Vandaag").length
  const fromInsyte = notes.filter((n) => n.actor?.kind === "insyte" && dayGroup(n.at, Date.now()) === "Vandaag").length
  const agent = useAgentEntries()
  const now = useNow(1000)
  const todayStart = new Date().setHours(0, 0, 0, 0)
  const acted = agent.filter((e) => Date.parse(e.at) >= todayStart && e.status !== "failed")
  const backable = acted.filter((e) => canUndo(e, now)).length
  const saved = drafts * MIN_PER.draft + drawn.length * MIN_PER.plate + runs * MIN_PER.run +
    acted.filter((e) => e.status === "done").length * MIN_PER.action

  if (SCENARIO === "empty") {
    return <Quiet>Nog niets klaargezet.</Quiet>
  }
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col">
        {line(
          Sparkle,
          "/ask/activity",
          undefined,
          String(acted.length),
          acted.length === 1 ? "actie zelf gedaan" : "acties zelf gedaan",
          backable > 0 ? `${backable} kan nog terug` : undefined
        )}
        {line(
          Sparkle,
          "/dashboard",
          { view: "overzicht" },
          String(drawn.length),
          drawn.length === 1 ? "voorstel getekend" : "voorstellen getekend",
          waiting > 0 ? `${waiting} wacht op jou` : filed > 0 ? `${filed} uitgevoerd` : undefined
        )}
        {line(
          Mail,
          "/inbox",
          undefined,
          String(drafts),
          drafts === 1 ? "antwoord opgesteld, klaar om na te lezen" : "antwoorden opgesteld, klaar om na te lezen",
          sent > 0 ? `${sent} verstuurd` : undefined
        )}
        {line(
          Workflow,
          "/automations",
          undefined,
          String(runs),
          runs === 1 ? "uitvoering door je automatiseringen" : "uitvoeringen door je automatiseringen",
          failed > 0 ? `${failed} mislukt` : undefined
        )}
        {line(
          Inbox,
          "/notifications",
          undefined,
          String(fromInsyte),
          fromInsyte === 1 ? "melding van Insyte vandaag" : "meldingen van Insyte vandaag"
        )}
      </ul>
      {acted.length > 0 ?
        (
          <ul className="flex flex-col gap-0.5 rounded-md bg-paper/70 py-1">
            {acted.slice(0, 3).map((e) => (
              <li key={e.id} className="flex min-w-0 items-center gap-2 px-2.5 py-1">
                <span className="shrink-0 text-ink-3 text-xs tabular-nums">{clock(Date.parse(e.at))}</span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-sm",
                    e.status === "undone" ? "text-ink-3 line-through" : "text-ink"
                  )}
                >
                  {e.sentence}
                </span>
                <UndoControl e={e} now={now} size="xs" />
              </li>
            ))}
          </ul>
        ) :
        null}
      <p className="flex flex-col gap-0.5 rounded-md bg-paper/70 px-2.5 py-2">
        <span className="text-base text-ink">
          Ongeveer <span className="font-medium tabular-nums">{duration(saved)}</span> werk uit handen
        </span>
        <span className="text-xs text-ink-2">
          {MIN_PER.draft} min per concept, {MIN_PER.plate} per voorstel, {MIN_PER.run} per uitvoering, {MIN_PER.action}
          {" "}
          per actie
        </span>
      </p>
    </div>
  )
}

/* ─── Bestsellers ──────────────────────────────────────────────────────── */

const DAY = 86_400_000

function historyWindow(days: number) {
  const end = Date.parse(`${HISTORY_END}T12:00:00Z`)
  const from = new Date(end - (days - 1) * DAY).toISOString().slice(0, 10)
  return HISTORY.orders.filter((o) => o.day >= from && o.day <= HISTORY_END && counts(o))
}

export function BestsellersCard() {
  const range = useHome((s) => s.range)
  const currency = useHome((s) => s.currency)
  const edits = useWorkspace((s) => s.productEdits)
  const rows = useMemo(() => {
    const by = new Map<string, { units: number; revenue: number }>()
    for (const o of historyWindow(range)) {
      const r = by.get(o.product) ?? { units: 0, revenue: 0 }
      r.units += o.qty
      r.revenue += o.total
      by.set(o.product, r)
    }
    return [...by]
      .map(([id, r]) => {
        const p = products.find((x) => x.id === id)
        const stock = p ? p.variants.reduce((n, v) => n + (edits[id]?.variantStock?.[v.id] ?? v.inventory_level), 0) : 0
        return p ? { id, title: p.title, image: p.images[0], stock, ...r } : null
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .toSorted((a, b) => b.units - a.units)
      .slice(0, 5)
      .map((r) => ({ ...r, revenue: convert(r.revenue, "USD", currency) }))
  }, [range, edits, currency])
  return <BestsellersView rows={rows} currency={currency} />
}

/* ─── Bestellingen per land ────────────────────────────────────────────── */

export function CountriesCard() {
  const range = useHome((s) => s.range)
  const rows = useMemo(() => {
    const by = new Map<Country, number>()
    for (const o of historyWindow(range)) by.set(o.country, (by.get(o.country) ?? 0) + 1)
    return [...by].map(([country, n]) => ({ country: country as string | null, name: COUNTRY_NAME[country], n }))
      .toSorted((
        a,
        b
      ) => b.n - a.n)
  }, [range])
  return <CountriesView rows={rows} range={range} />
}

/* ─── Ongelezen chats ──────────────────────────────────────────────────── */

export function ChatsCard() {
  const created = useChatStore((s) => s.created)
  const muted = useChatStore((s) => s.muted)
  const list = [...created, ...conversations]
    .filter((c) => !muted.includes(c.id))
    .toSorted((a, b) =>
      b.unread_count - a.unread_count || Date.parse(b.last_message_at) - Date.parse(a.last_message_at)
    )
    .slice(0, 5)
  const unread = list.reduce((n, c) => n + c.unread_count, 0)
  if (list.every((c) => !c.last_message_preview)) {
    return <Quiet>#algemeen is nog stil.</Quiet>
  }
  return (
    <div className="flex flex-col gap-1">
      <p className="px-2 text-sm text-ink-2 tabular-nums">
        {unread === 0 ? "Je bent bij" : `${unread} ongelezen ${unread === 1 ? "bericht" : "berichten"}`}
      </p>
      <ul className="flex flex-col">
        {list.map((c) => {
          const group = c.type !== "dm"
          return (
            <li key={c.id}>
              <Link to={"/chats" as string} search={{ id: c.id } as never} className={cn(ROW, "h-11")}>
                {group ?
                  (
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-band text-ink-2">
                      <Hash className="size-3.5" strokeWidth={1.75} />
                    </span>
                  ) :
                  (
                    <span
                      className="flex size-7 shrink-0 items-center justify-center rounded-full font-medium text-xs"
                      style={personStyle(c.name)}
                    >
                      {initials(c.name)}
                    </span>
                  )}
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span
                    className={cn("truncate text-base", c.unread_count > 0 ? "font-medium text-ink" : "text-ink-2")}
                  >
                    {group ? `#${c.name}` : c.name}
                  </span>
                  <span className="truncate text-xs text-ink-3">{c.last_message_preview || "Nog geen berichten"}</span>
                </span>
                {c.unread_count > 0 ?
                  (
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-arc px-1.5 font-medium text-2xs text-mesh-ink tabular-nums">
                      {c.unread_count}
                    </span>
                  ) :
                  null}
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
