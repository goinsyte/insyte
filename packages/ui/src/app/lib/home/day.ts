import { SCENARIO } from "../../../data-source"
import {
  BarChart3,
  Bell,
  Check,
  CornerDownLeft,
  type IconComponent,
  Inbox,
  Phone,
  Ticket,
  Truck,
  UserPlus,
  Wallet,
  Workflow
} from "../../../icons"
import type { Todo } from "../../stores/home-store"
import type { QueueItem } from "../../stores/workspace-store"
import { isAssignedTo, ME } from "../assignees"
import type { NotifyPrefs } from "../notifications"
import { supplierName } from "../order-supplier"
import type { Invite } from "../team"
import type { Automation, Chargeback, Order, Ticket as TicketRecord } from "../types/domain"
import { addDays, at, dayKey } from "./dates"

/*
 * The day, as one list of things with a time. The agenda reads it as a clock, My work reads it as a
 * list of what is yours to do, and the board's "Agenda vandaag" reads today's part of it.
 *
 * The records in this demo are dated months ago, so a deadline is placed the way the queue already
 * states it — "4u 10m", "vandaag", "2d" — measured from now, which is how the area panel's today
 * ruler places the same rows. Everything else is anchored to a time of day: the morning digest at
 * the hour settings send it, the automations at their schedule, the supplier hand-offs in the
 * afternoon, the report on Monday. Nothing here is a fact the rest of the console does not also hold.
 */

export type MomentKind =
  | "chargeback"
  | "supplier"
  | "ticket"
  | "queue"
  | "automation"
  | "digest"
  | "call"
  | "report"
  | "payout"
  | "todo"
  | "invite"

export const KIND: Record<MomentKind, { label: string; icon: IconComponent; area: string }> = {
  chargeback: { label: "Chargeback", icon: CornerDownLeft, area: "Chargebacks" },
  supplier: { label: "Leverancier", icon: Truck, area: "Leveranciers" },
  ticket: { label: "Ticket", icon: Ticket, area: "Tickets" },
  queue: { label: "Wachtrij", icon: Inbox, area: "Je wachtrij" },
  automation: { label: "Automatisering", icon: Workflow, area: "Automatiseringen" },
  digest: { label: "Overzicht", icon: Bell, area: "Meldingen" },
  call: { label: "Afspraak", icon: Phone, area: "Klantenservice" },
  report: { label: "Rapport", icon: BarChart3, area: "Analyse" },
  payout: { label: "Uitbetaling", icon: Wallet, area: "Data" },
  todo: { label: "Taak", icon: Check, area: "Je lijst" },
  invite: { label: "Uitnodiging", icon: UserPlus, area: "Team" }
}

export type Tone = "red" | "amber" | "arc" | "green" | "ink"

export type Moment = {
  id: string
  kind: MomentKind
  /** When it happens or is due. All-day items carry the day's start and `allDay`. */
  at: number
  /** How long it occupies the clock, in minutes, for the agenda's blocks. */
  minutes: number
  allDay?: boolean
  title: string
  detail?: string
  tone: Tone
  to: string
  search?: Record<string, string>
  /** The queue row it belongs to, so opening it draws its plate. */
  queueId?: string
}

/** "4u 10m" and "6u" from now, "vandaag" at 18:00, "1d" and "2d" as that many days on. */
export function dueAt(due: string, now: number): number | null {
  if (due === "vandaag" || due === "today") return Math.max(at("18:00", 0, now), now + 30 * 60_000)
  const d = /^(\d+)d$/.exec(due)
  if (d) return now + Number(d[1]) * 86_400_000
  const h = /(\d+)[hu]/.exec(due)
  const m = /(\d+)m/.exec(due)
  if (!h && !m) return null
  return now + (Number(h?.[1] ?? 0) * 60 + Number(m?.[1] ?? 0)) * 60_000
}

const queueKind = (q: QueueItem): MomentKind => {
  const first = q.title.split(" ")[0]?.toLowerCase() ?? ""
  if (first === "chargeback") return "chargeback"
  if (first === "ticket" || first === "klant") return "ticket"
  if (q.title.includes("leverancier")) return "supplier"
  return "queue"
}

export type DayInput = {
  queue: ReadonlyArray<QueueItem>
  chargebacks: ReadonlyArray<Chargeback>
  orders: ReadonlyArray<Order>
  tickets: ReadonlyArray<TicketRecord>
  automations: ReadonlyArray<Automation>
  todos: ReadonlyArray<Todo>
  invites: ReadonlyArray<Invite>
  prefs: NotifyPrefs
  now: number
}

/** Suppliers holding late orders, worst first: who to chase today. */
export function supplierFollowUps(orders: ReadonlyArray<Order>) {
  const by = new Map<string, Order[]>()
  for (const o of orders) {
    if (
      !o.tags.includes("at_risk") || o.status === "cancelled" || o.status === "refunded" || o.status === "delivered"
    ) continue
    const name = supplierName(o.id)
    by.set(name, [...(by.get(name) ?? []), o])
  }
  return [...by].map(([name, list]) => ({ name, orders: list })).sort((a, b) => b.orders.length - a.orders.length)
}

const AUTOMATION_TIMES = ["07:00", "10:00", "13:30", "16:00", "20:00"]

/** Every dated thing from yesterday to a week out, in time order. */
export function moments(input: DayInput): Moment[] {
  const { now } = input
  const out: Moment[] = []

  if (input.prefs.digest.on && SCENARIO !== "empty") {
    out.push({
      id: "digest",
      kind: "digest",
      at: at(input.prefs.digest.at, 0, now),
      minutes: 15,
      title: "Ochtendoverzicht verstuurd",
      detail: "Wat er vannacht binnenkwam, in één e-mail",
      tone: "ink",
      to: "/notifications"
    })
  }

  for (const q of input.queue) {
    if (q.state !== "open" || (q.signal !== "red" && q.signal !== "amber")) continue
    const t = dueAt(q.due, now)
    if (t === null) continue
    const kind = queueKind(q)
    out.push({
      id: `q:${q.id}`,
      kind,
      at: t,
      minutes: 30,
      title: q.plate?.heading ?? q.title.split(" · ")[0] ?? q.title,
      detail: q.plate ? `Voorstel klaar · ${q.store}` : q.store,
      tone: q.signal === "red" ? "red" : "amber",
      to: "/dashboard",
      search: { view: "overzicht", row: q.id },
      queueId: q.id
    })
  }

  // Cases waiting on evidence that the queue has not drawn: their deadlines, a few days apart.
  const drawn = new Set(input.queue.map((q) => q.plate?.number).filter(Boolean))
  input.chargebacks
    .filter((c) => (c.status === "awaiting_evidence" || c.status === "open") && !drawn.has(c.case_number))
    .forEach((c, i) => {
      out.push({
        id: `cb:${c.id}`,
        kind: "chargeback",
        at: at("18:00", 2 + i * 2, now),
        minutes: 30,
        title: `Bewijsdeadline ${c.case_number}`,
        detail: `${c.customer_name} · ${c.reason}`,
        tone: "amber",
        to: `/chargebacks/${c.id}`
      })
    })

  supplierFollowUps(input.orders)
    .slice(0, 3)
    .forEach((s, i) => {
      out.push({
        id: `sup:${s.name}`,
        kind: "supplier",
        at: at(["15:00", "11:00", "14:00"][i] ?? "15:00", i, now),
        minutes: 45,
        title: `Overdracht ${s.name}`,
        detail: `${s.orders.length} ${s.orders.length === 1 ? "bestelling loopt" : "bestellingen lopen"} uit · ${
          s.orders
            .slice(0, 3)
            .map((o) => o.number)
            .join(", ")
        }`,
        tone: i === 0 ? "amber" : "ink",
        to: "/orders"
      })
    })

  if (SCENARIO !== "empty") {
    out.push({
      id: "call:12212",
      kind: "call",
      at: at("14:00", 0, now),
      minutes: 20,
      title: "Klant van SO-12212 belt terug",
      detail: "Sofía vroeg om een leverdatum vóór het gesprek",
      tone: "ink",
      to: "/orders/ord_5012"
    })
    out.push({
      id: "payout:stripe",
      kind: "payout",
      at: at("09:00", (5 - new Date(now).getDay() + 7) % 7 || 7, now),
      minutes: 15,
      title: "Uitbetaling Stripe",
      detail: "Wekelijkse uitbetaling naar de zakelijke rekening",
      tone: "green",
      to: "/data"
    })
  }

  const toMonday = (8 - new Date(now).getDay()) % 7
  if (SCENARIO !== "empty") {
    out.push({
      id: "report",
      kind: "report",
      at: at("07:00", toMonday === 0 ? 7 : toMonday, now),
      minutes: 15,
      title: "Weekrapport",
      detail: "Wat er vorige week bewoog, met de bevindingen",
      tone: "arc",
      to: "/analytics"
    })
  }

  input.automations
    .filter((a) => a.status === "active")
    .slice(0, AUTOMATION_TIMES.length)
    .forEach((a, i) => {
      const time = AUTOMATION_TIMES[i] ?? "12:00"
      for (const day of [-1, 0, 1, 2, 3, 4, 5, 6]) {
        out.push({
          id: `auto:${a.id}:${day}`,
          kind: "automation",
          at: at(time, day, now),
          minutes: 15,
          title: a.name,
          detail: `Gepland · ${a.runs_30d} keer in 30 dagen`,
          tone: "ink",
          to: `/automations/${a.id}`
        })
      }
    })

  for (const inv of input.invites) {
    if (inv.expiresAt < now - 7 * 86_400_000 || inv.expiresAt > now + 7 * 86_400_000) continue
    out.push({
      id: `inv:${inv.id}`,
      kind: "invite",
      at: inv.expiresAt,
      minutes: 15,
      title: inv.expiresAt < now ? `Uitnodiging verlopen: ${inv.email}` : `Uitnodiging verloopt: ${inv.email}`,
      detail: "Opnieuw versturen houdt de plek vrij",
      tone: inv.expiresAt < now ? "red" : "ink",
      to: "/settings/team"
    })
  }

  for (const t of input.todos) {
    if (t.done || t.due === undefined) continue
    const [y, m, d] = t.due.split("-").map(Number)
    out.push({
      id: `todo:${t.id}`,
      kind: "todo",
      at: new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).getTime(),
      minutes: 0,
      allDay: true,
      title: t.text,
      tone: "arc",
      to: "/dashboard",
      search: { view: "werk" }
    })
  }

  return out.sort((a, b) => a.at - b.at)
}

/* ── My work ───────────────────────────────────────────────────────────────────────────────── */

export type WorkGroup = "late" | "today" | "next" | "later" | "none" | "done"
export const WORK_GROUPS: ReadonlyArray<{ id: WorkGroup; label: string }> = [
  { id: "late", label: "Te laat" },
  { id: "today", label: "Vandaag" },
  { id: "next", label: "Volgende" },
  { id: "later", label: "Later" },
  { id: "none", label: "Zonder datum" },
  { id: "done", label: "Klaar vandaag" }
]

export type WorkItem = {
  id: string
  kind: MomentKind
  title: string
  /** The record it is about, set in medium after the title. */
  record?: string
  /** Where it lives in the console: "in Tickets". */
  where: string
  due?: string
  /** A time on the due day, when the work has one. */
  time?: number
  tone: Tone
  to: string
  search?: Record<string, string>
  done: boolean
  doneAt?: number
  /** How ticking it is done: on the to-do itself, on the record, or only on this list. */
  check: "todo" | "ticket" | "queue" | "plate" | "local"
  ticketId?: string
  queueId?: string
}

export function workItems(
  input: DayInput & { snoozed: Record<string, string>; doneWork: Record<string, number> }
): WorkItem[] {
  const { now } = input
  const today = dayKey(now)
  const items: WorkItem[] = []
  const localDone = (id: string) => input.doneWork[id] !== undefined

  for (const t of input.todos) {
    items.push({
      id: `todo:${t.id}`,
      kind: "todo",
      title: t.text,
      where: "Je lijst",
      due: t.due,
      tone: "arc",
      to: "/dashboard",
      search: { view: "werk" },
      done: t.done,
      doneAt: t.doneAt,
      check: "todo"
    })
  }

  for (const q of input.queue) {
    if (q.signal !== "red" && q.signal !== "amber") continue
    if (q.state !== "open" && !localDone(`q:${q.id}`)) continue
    const t = dueAt(q.due, now)
    items.push({
      id: `q:${q.id}`,
      kind: queueKind(q),
      title: q.plate ? q.plate.heading : (q.title.split(" · ")[0] ?? q.title),
      record: q.plate?.number,
      where: "Je wachtrij",
      due: t === null ? undefined : dayKey(t),
      time: t ?? undefined,
      tone: q.signal === "red" ? "red" : "amber",
      to: "/dashboard",
      search: { view: "overzicht", row: q.id },
      done: q.state !== "open",
      doneAt: input.doneWork[`q:${q.id}`],
      check: q.plate ? "plate" : "queue",
      queueId: q.id
    })
  }

  for (const t of input.tickets) {
    if (!isAssignedTo(t.assignee_ids, ME) || t.archived_at || t.deleted_at || t.spam_at) continue
    const closedHere = localDone(`tkt:${t.id}`)
    if (t.status === "done" && !closedHere) continue
    const due = t.due_at
      ? dayKey(Date.parse(t.due_at))
      : t.priority === "high"
      ? today
      : t.priority === "medium"
      ? addDays(now, 1)
      : undefined
    items.push({
      id: `tkt:${t.id}`,
      kind: "ticket",
      title: t.title,
      record: t.number,
      where: "Tickets",
      due,
      tone: t.priority === "high" ? "red" : t.priority === "medium" ? "amber" : "ink",
      to: `/tickets/${t.id}`,
      done: t.status === "done",
      doneAt: input.doneWork[`tkt:${t.id}`],
      check: "ticket",
      ticketId: t.id
    })
  }

  supplierFollowUps(input.orders)
    .slice(0, 4)
    .forEach((s, i) => {
      const id = `sup:${s.name}`
      items.push({
        id,
        kind: "supplier",
        title: `${s.name} aansporen over ${s.orders.length} ${s.orders.length === 1 ? "bestelling" : "bestellingen"}`,
        record: s.orders[0]?.number,
        where: "Leveranciers",
        due: i === 0 ? addDays(now, -1) : i === 1 ? today : addDays(now, i - 1),
        tone: i === 0 ? "red" : "amber",
        to: "/orders",
        done: localDone(id),
        doneAt: input.doneWork[id],
        check: "local"
      })
    })

  const drawn = new Set(input.queue.map((q) => q.plate?.number).filter(Boolean))
  input.chargebacks
    .filter((c) => (c.status === "awaiting_evidence" || c.status === "open") && !drawn.has(c.case_number))
    .forEach((c, i) => {
      const id = `cb:${c.id}`
      items.push({
        id,
        kind: "chargeback",
        title: "Bewijs indienen",
        record: c.case_number,
        where: "Chargebacks",
        due: addDays(now, 2 + i * 2),
        time: at("18:00", 2 + i * 2, now),
        tone: "amber",
        to: `/chargebacks/${c.id}`,
        done: localDone(id),
        doneAt: input.doneWork[id],
        check: "local"
      })
    })

  for (const inv of input.invites) {
    const id = `inv:${inv.id}`
    const lapsed = inv.expiresAt < now
    items.push({
      id,
      kind: "invite",
      title: lapsed ? `Uitnodiging opnieuw versturen aan ${inv.email}` : `Uitnodiging opvolgen: ${inv.email}`,
      where: "Team",
      due: lapsed ? dayKey(inv.expiresAt) : dayKey(inv.expiresAt - 86_400_000),
      tone: lapsed ? "red" : "ink",
      to: "/settings/team",
      done: localDone(id),
      doneAt: input.doneWork[id],
      check: "local"
    })
  }

  // Moved to another day: the snooze wins over the record's own date.
  return items.map((w) => (input.snoozed[w.id] && !w.done ? { ...w, due: input.snoozed[w.id], time: undefined } : w))
}

export function groupOf(w: WorkItem, now: number): WorkGroup | null {
  const today = dayKey(now)
  if (w.done) return w.doneAt !== undefined && dayKey(w.doneAt) === today ? "done" : null
  if (w.due === undefined) return "none"
  if (w.due < today) return "late"
  if (w.due === today) return "today"
  if (w.due <= addDays(now, 7)) return "next"
  return "later"
}
