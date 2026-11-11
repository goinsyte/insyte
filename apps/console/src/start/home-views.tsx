import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Frame } from "@insyte/api/rpc/ShellRpcs"
import type { ActivitySource, AgendaSpan } from "@insyte/modules/home/domain/Lists"
import { ActivityView } from "@insyte/ui/app/dashboard/activity-view"
import { AgendaView } from "@insyte/ui/app/dashboard/agenda-view"
import { BookmarksView, MentionsView, TodayView } from "@insyte/ui/app/dashboard/day-cards"
import { MyWorkView } from "@insyte/ui/app/dashboard/work-view"
import { useNow } from "@insyte/ui/app/hooks/use-now"
import { addDays, dayKey, dayStart } from "@insyte/ui/app/lib/home/dates"
import { groupOf, type WorkItem } from "@insyte/ui/app/lib/home/kinds"
import { stateOf } from "@insyte/ui/app/lib/notifications"
import { undoable } from "@insyte/ui/app/lib/undo"
import { WidgetBones } from "@insyte/ui/app/loading/page-skeletons"
import { useShellSource } from "@insyte/ui/app/shell/source"
import type { Shortcut } from "@insyte/ui/app/stores/pins-store"
import { Exit, Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useMemo, useRef, useState } from "react"
import { activityAtom, activityKey, agendaAtom, agendaKey, TODOS, todoWrites, workAtom } from "../data/home.ts"
import { QUEUE, queueWrites } from "../data/queue.ts"
import { TICKETS, ticketWrites } from "../data/tickets.ts"
import { usePrefSection } from "../frame/prefs.ts"
import { failureOf, sayRefusal } from "../frame/refusals.ts"
import { momentOf, MY_WORK_DEFAULT, myWorkOf, type MyWorkPref, noteOf, pruneMyWork, workItemOf } from "./home-lists.ts"

/*
 * Mijn werk, Agenda and Activiteit in the console (M10.3b), and the board's day cards ("Agenda vandaag",
 * "Vermeldingen en toegewezen", "Bladwijzers"): the design's views over `Home.work`, `Home.agenda`, `Home.activity`,
 * the inbox and the member's `pins`. A tick does the real thing where there is one: a to-do is ticked, a ticket closes,
 * a queue row is set aside, each with the server's undo. A supplier to chase or an invitation to follow up has no
 * record to change, so its tick and every snooze stay in the member's `my_work` preference.
 */

/** The last value a read gave, kept on screen while the next one is in flight. */
function useKept<T>(result: AsyncResult.AsyncResult<T, unknown>): T | undefined {
  const value = Option.getOrUndefined(AsyncResult.value(result))
  const last = useRef<T | undefined>(undefined)
  if (value !== undefined) last.current = value
  return value ?? last.current
}

/** The member's own snoozes and ticks, and the items `Home.work` lists with them laid over. */
export function useConsoleWork(frame: Frame, now: number) {
  const [saved, save] = usePrefSection<unknown>(frame, "my_work", MY_WORK_DEFAULT)
  const pref = useMemo(() => myWorkOf(saved), [saved])
  const work = useKept(useAtomValue(workAtom))
  const items = useMemo(() => work?.rows.map((r) => workItemOf(r, pref, now)), [work, pref, now])
  return { pref, save: (next: MyWorkPref) => save(pruneMyWork(next, now)), items }
}

/** Due today or late, for the tab's count. */
export const dueToday = (items: ReadonlyArray<WorkItem> | undefined, now: number) =>
  items?.filter((w) => {
    const g = groupOf(w, now)
    return g === "late" || g === "today"
  }).length

export function ConsoleWork(
  { now, items, pref, save }: {
    now: number
    items: ReadonlyArray<WorkItem> | undefined
    pref: MyWorkPref
    save: (next: MyWorkPref) => void
  }
) {
  const addTodo = useAtomSet(todoWrites.add)
  const toggleTodo = useAtomSet(todoWrites.toggle)
  const setStatus = useAtomSet(ticketWrites.setStatus, { mode: "promiseExit" })
  const undoTicket = useAtomSet(ticketWrites.undo, { mode: "promiseExit" })
  const markSeen = useAtomSet(queueWrites.markSeen, { mode: "promiseExit" })
  const undoQueue = useAtomSet(queueWrites.undo, { mode: "promiseExit" })
  const current = useRef(pref)
  current.current = pref
  if (items === undefined) return <WidgetBones rows={6} />

  const todoKeys = [...TODOS]
  const ticketKeys = [...TICKETS]
  const queueKeys = [...QUEUE]
  const local = (id: string, done: boolean) => {
    const { [id]: _, ...rest } = current.current.done
    save({ ...current.current, done: done ? { ...rest, [id]: Date.now() } : rest })
  }

  async function tick(w: WorkItem) {
    if (w.check === "todo") {
      const id = w.id.slice("todo:".length)
      toggleTodo({ payload: { id }, reactivityKeys: todoKeys })
      if (!w.done) undoable("Taak afgevinkt", () => toggleTodo({ payload: { id }, reactivityKeys: todoKeys }))
      return
    }
    if (w.check === "ticket" && w.ticketId !== undefined) {
      const exit = await setStatus({
        payload: { ids: [w.ticketId], status: w.done ? "in_progress" : "done" },
        reactivityKeys: ticketKeys
      })
      if (Exit.isFailure(exit)) return sayRefusal(failureOf(exit), { gone: "Dat ticket is er niet meer" })
      const ticket = exit.value.undo
      if (w.done || ticket === null) return
      undoable(
        `${w.record ?? "Ticket"} gesloten`,
        () =>
          void undoTicket({ payload: { token: ticket.token }, reactivityKeys: ticketKeys }).then((e) => {
            if (Exit.isFailure(e)) sayRefusal(failureOf(e), { gone: "Dat ticket is er niet meer" })
          })
      )
      return
    }
    if (w.check === "queue" && w.queueId !== undefined) {
      // Set aside today stays set aside: the queue reopens a row from its own panel.
      if (w.done) return
      const exit = await markSeen({ payload: { id: w.queueId }, reactivityKeys: queueKeys })
      if (Exit.isFailure(exit)) return sayRefusal(failureOf(exit), { gone: "Die zaak is er niet meer" })
      const ticket = exit.value.undo
      if (ticket === null) return
      undoable(
        "Van je wachtrij gehaald",
        () =>
          void undoQueue({ payload: { token: ticket.token }, reactivityKeys: queueKeys }).then((e) => {
            if (Exit.isFailure(e)) sayRefusal(failureOf(e), { gone: "Die zaak is er niet meer" })
          }),
        "Er is niets aan het record veranderd."
      )
      return
    }
    local(w.id, !w.done)
    if (!w.done) undoable("Afgevinkt", () => local(w.id, false))
  }

  const snoozeTo = (id: string, day: string | undefined) => {
    const { [id]: _, ...rest } = current.current.snoozed
    save({ ...current.current, snoozed: day === undefined ? rest : { ...rest, [id]: day } })
  }

  return (
    <MyWorkView
      now={now}
      work={items}
      actions={{
        snoozed: pref.snoozed,
        add: (text, due) => addTodo({ payload: { text, due: due ?? null }, reactivityKeys: todoKeys }),
        tick: (w) => void tick(w),
        snooze: (w, day, label) => {
          const before = current.current.snoozed[w.id]
          snoozeTo(w.id, day)
          undoable(`Verplaatst naar ${label.toLowerCase()}`, () => snoozeTo(w.id, before))
        },
        unsnooze: (w) => snoozeTo(w.id, undefined)
      }}
    />
  )
}

/** The screens an empty view's first steps may link to; automations and integrations have none in the console yet. */
const CONSOLE_HAS: ReadonlySet<string> = new Set(["/suppliers", "/settings/stores", "/settings/team", "/tickets"])

/** The Monday of the week a day is in, as the agenda's week view starts it. */
const mondayOf = (day: string) => addDays(dayStart(day), -((new Date(dayStart(day)).getDay() + 6) % 7))

/** The moments `Home.agenda` dates for a day or the week it is in. */
function useAgenda(day: string, span: AgendaSpan) {
  const from = span === "day" ? day : mondayOf(day)
  const agenda = useKept(useAtomValue(agendaAtom(agendaKey(from, span))))
  return useMemo(() => agenda?.rows.map(momentOf), [agenda])
}

export function ConsoleAgenda({ now }: { now: number }) {
  const [span, setSpan] = useState<AgendaSpan>("day")
  const [day, setDay] = useState(() => dayKey(now))
  const moments = useAgenda(day, span)
  if (moments === undefined) return <WidgetBones rows={6} />
  return (
    <AgendaView
      now={now}
      moments={moments}
      span={span}
      onSpan={setSpan}
      day={day}
      onDay={setDay}
      opens={(to) => CONSOLE_HAS.has(to)}
    />
  )
}

/** Today's timed moments still ahead, for the tab's count. */
export function useAgendaAhead(now: number) {
  const moments = useAgenda(dayKey(now), "day")
  return moments?.filter((m) => !m.allDay && dayKey(m.at) === dayKey(now) && m.at > now).length
}

/** The feed's actors without a name of their own, by their kind. */
const nameOfKey = (key: string, name: string | null) =>
  name ??
    (key.startsWith("shop:")
      ? "Shopify"
      : key.startsWith("api_key:") || key.startsWith("service_account:")
      ? "Een API-sleutel"
      : key.startsWith("agent:") || key.startsWith("insyte:")
      ? "Insyte"
      : "Het systeem")

const PAGE = 60
/** `Home.activity` answers at most this many rows at once. */
const MOST = 200

export function ConsoleActivity({ now }: { now: number }) {
  const [who, setWho] = useState("all")
  const [source, setSource] = useState<ActivitySource | "all">("all")
  const [limit, setLimit] = useState(PAGE)
  const feed = useKept(useAtomValue(activityAtom(activityKey({
    who: who === "all" ? undefined : who,
    source: source === "all" ? undefined : source,
    limit
  }))))
  const rows = useMemo(() => feed?.rows.map(noteOf), [feed])
  if (feed === undefined || rows === undefined) return <WidgetBones rows={8} />
  return (
    <ActivityView
      now={now}
      rows={rows}
      total={feed.total}
      people={feed.actors.map((a) => [a.key, nameOfKey(a.key, a.name), a.count] as const)}
      sources={feed.sources.map((s) => s.source)}
      who={who}
      onWho={(w) => {
        setWho(w)
        setLimit(PAGE)
      }}
      source={source}
      onSource={(s) => {
        // The design's sources include ones the feed never has; only the feed's own reach the read.
        setSource(s as ActivitySource | "all")
        setLimit(PAGE)
      }}
      onMore={limit < MOST && feed.next !== null ? () => setLimit((l) => Math.min(MOST, l + PAGE)) : undefined}
      opens={(to) => CONSOLE_HAS.has(to)}
    />
  )
}

/* ── the board's day cards ─────────────────────────────────────────────────────────────────────── */

/** "Agenda vandaag": today's moments on a short clock. */
export function ConsoleToday() {
  const now = useNow(60_000)
  const moments = useAgenda(dayKey(now), "day")
  if (moments === undefined) return <WidgetBones rows={4} />
  return <TodayView now={now} moments={moments} />
}

/** "Vermeldingen en toegewezen": what reached the member directly, from the inbox the bell reads. */
export function ConsoleMentions() {
  const { heardNotes, notifications } = useShellSource()
  const now = Date.now()
  const mine = heardNotes
    .filter((n) => n.reason !== undefined && stateOf(n, now) === "inbox")
    .toSorted((a, b) => Date.parse(b.at) - Date.parse(a.at))
  return (
    <MentionsView
      mine={mine}
      now={now}
      onRead={(ids, read) => {
        notifications.setRead(ids, read)
        if (read && ids.length > 1) {
          undoable(`${ids.length} als gelezen gemarkeerd`, () => notifications.setRead(ids, false))
        }
      }}
    />
  )
}

/** "Bladwijzers": the member's pins and favourites, the frame's own, and the palette's search to add one. */
export function ConsoleBookmarks() {
  const { pins, useRecordSearch } = useShellSource()
  const latest = useRef(pins)
  latest.current = pins
  return (
    <BookmarksView
      pinned={pins.pinned}
      favourites={pins.favourites}
      actions={{
        unpin: (p) => {
          pins.unpin(p.to, p.label)
          undoable(`${p.label} losgemaakt`, () => latest.current.repin(p))
        },
        repin: (s) => {
          pins.repin(s)
          undoable(`${s.label} als bladwijzer bewaard`, () => latest.current.unpin(s.to, s.label))
        },
        unfavourite: (f) => {
          pins.unfavourite(f.to, f.label)
          undoable(`${f.label} uit je favorieten`, () => latest.current.favourite(f))
        },
        useHits: (q, taken) => {
          const hits = useRecordSearch(q)
          const has = new Set(taken.map((t) => `${t.to}|${t.label}`))
          const all: Array<Shortcut> = [
            ...(hits?.orders ?? []).map((o) => ({
              to: `/orders/${o.id}`,
              label: `Bestelling ${o.number}`,
              kind: "order" as const
            })),
            ...(hits?.customers ?? []).map((c) => ({
              to: `/customers/${c.id}`,
              label: c.name,
              kind: "customer" as const
            }))
          ]
          return all.filter((s) => !has.has(`${s.to}|${s.label}`)).slice(0, 8)
        }
      }}
    />
  )
}
