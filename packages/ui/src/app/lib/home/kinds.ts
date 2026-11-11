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
import { addDays, dayKey } from "./dates"

/*
 * The kinds of dated things on Start (Mijn werk, Agenda, the board's "Agenda vandaag") and how a piece of work
 * is grouped by when: shared by the design's day (`day.ts`, from the demo's stores) and the console's (from
 * `Home.work` and `Home.agenda`), so neither reads the other's data.
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

export function groupOf(w: WorkItem, now: number): WorkGroup | null {
  const today = dayKey(now)
  if (w.done) return w.doneAt !== undefined && dayKey(w.doneAt) === today ? "done" : null
  if (w.due === undefined) return "none"
  if (w.due < today) return "late"
  if (w.due === today) return "today"
  if (w.due <= addDays(now, 7)) return "next"
  return "later"
}
