import { Link } from "@tanstack/react-router"
import { useMemo } from "react"
import { automations } from "../../data-source"
import { conversations } from "../../data-source"
import { customers } from "../../data-source"
import { products } from "../../data-source"
import { suppliers } from "../../data-source"
import { SCENARIO } from "../../data-source"
import { type IconComponent, Inbox, Mail, Sparkle, Workflow } from "../../icons"
import { UndoControl, useNow } from "../ask/agent-parts"
import { Glyph } from "../common/glyph"
import { canUndo } from "../lib/agent-log"
import { counts } from "../lib/analytics/engine"
import { type Country, COUNTRY_NAME, HISTORY, HISTORY_END } from "../lib/analytics/history"
import { clock, dayKey } from "../lib/home/dates"
import { convert } from "../lib/money"
import { dayGroup, stateOf } from "../lib/notifications"
import { undoable } from "../lib/undo"
import { cn } from "../lib/utils"
import { useHeardNotes } from "../notifications/heard"
import { useAgentEntries } from "../stores/agent-log-store"
import { useChatStore } from "../stores/chat-store"
import { useHome } from "../stores/home-store"
import { useInbox } from "../stores/inbox-store"
import { useLive } from "../stores/live-store"
import { useNotifications } from "../stores/notifications-store"
import { type Shortcut, usePins } from "../stores/pins-store"
import { useWorkspace } from "../stores/workspace-store"
import { useDay } from "./use-day"

import { BestsellersView, ChatsView, CountriesView, LiveView, Quiet, RecentView, ROW } from "./card-views"
import { BookmarksView, MentionsView, TodayView } from "./day-cards"
/*
 * The home's compact cards, in ClickUp's density: 32–36px rows, one line each, the record's own glyph
 * and where it lives ("in Bestellingen"), a time at the end. Each one reads a store the rest of the
 * console writes to, so they move while the operator works elsewhere — a ticket closed on Tickets
 * leaves "Vermeldingen", a record opened anywhere lands at the head of "Recent".
 */

/* ─── Agenda vandaag ───────────────────────────────────────────────────── */

export function TodayCard() {
  const { now, moments } = useDay()
  return <TodayView now={now} moments={moments} />
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
  return (
    <MentionsView
      mine={mine}
      now={now}
      onRead={(ids, read) => {
        setRead([...ids], read)
        if (read && ids.length > 1) undoable(`${ids.length} als gelezen gemarkeerd`, () => setRead([...ids], false))
      }}
    />
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
  const all = useCandidates()
  return (
    <BookmarksView
      pinned={pinned}
      favourites={favourites}
      actions={{
        unpin: (p) => {
          usePins.getState().unpin(p.to, p.label)
          undoable(`${p.label} losgemaakt`, () => usePins.getState().repin(p))
        },
        repin: (s) => {
          usePins.getState().repin(s)
          undoable(`${s.label} als bladwijzer bewaard`, () => usePins.getState().unpin(s.to, s.label))
        },
        unfavourite: (f) => {
          usePins.getState().unfavourite(f.to, f.label)
          undoable(`${f.label} uit je favorieten`, () => usePins.getState().favourite(f))
        },
        useHits: (q, taken) => {
          const has = new Set(taken.map((t) => `${t.to}|${t.label}`))
          return all
            .filter((c) => !has.has(`${c.to}|${c.label}`) && c.label.toLowerCase().includes(q.trim().toLowerCase()))
            .slice(0, 8)
        }
      }}
    />
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
  return (
    <ChatsView
      rows={list.map((c) => ({
        id: c.id,
        group: c.type !== "dm",
        name: c.name,
        preview: c.last_message_preview,
        unread: c.unread_count
      }))}
      unread={list.reduce((n, c) => n + c.unread_count, 0)}
    />
  )
}
