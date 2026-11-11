import { Link } from "@tanstack/react-router"
import { type ReactNode, useMemo } from "react"
import { lastActionById, presenceById } from "../../data-source"
import { automations } from "../../data-source"
import { products } from "../../data-source"
import { Clock, Workflow } from "../../icons"
import { Glyph } from "../common/glyph"
import { isAssignedTo, ME } from "../lib/assignees"
import { formatCurrency } from "../lib/format"
import { convert } from "../lib/money"
import { supplierName } from "../lib/order-supplier"
import { revenueWindow } from "../lib/revenue"
import { undoable } from "../lib/undo"
import { cn } from "../lib/utils"
import { useHome, type WidgetId } from "../stores/home-store"
import { useWorkspace } from "../stores/workspace-store"
import { CustomerAgentCard, ReturnsCard } from "./agent-cards"
import { RevenueBreakdown } from "./breakdown-dialog"
import {
  BestsellersCard,
  BookmarksCard,
  ChatsCard,
  CountriesCard,
  InsyteCard,
  LiveCard,
  MentionsCard,
  RecentCard,
  TodayCard
} from "./cards"
import { setupTasks, Struck, type Task, TickBox } from "./setup-checklist"
import { WIDGET_DEFS, type WidgetMeta } from "./widget-defs"

import {
  type Column,
  COLUMNS,
  MyTicketsView,
  OrdersView,
  PRIORITY_RANK,
  RevenueView,
  SetupView,
  type Stage,
  STAGES,
  StockView,
  SuppliersView,
  TeamView,
  TicketsView,
  TodoView
} from "./widget-views"
export { Struck, TickBox }

/**
 * The home board's widgets.
 *
 * Each one answers a question an operator asks about the business between triage runs — is setup
 * done, what did I mean to do, how is revenue moving, where are orders stuck, which supplier is
 * slow — and every one of them reads the same workspace the rest of the console writes to. File a
 * chargeback on the queue above and the chargeback widget moves; mark an order fulfilled on Orders
 * and the stage bar shifts. None of them is a number for its own sake.
 *
 * The grammar is the queue's: a quiet heading, figures in tabular sans, bands instead of rules, one
 * arc accent per widget. A band is `bg-band`, which the frame sets from the widget's ground — `mist`
 * on white, white on light blue and grey — so a widget reads the same whichever ground it is given.
 * Each one leads with its own glyph from the house set, drawn in when it appears and answering a
 * hover with one small gesture; no icons in circles, no hero figure over a sparkline.
 */

export type WidgetDef = WidgetMeta & { render: () => ReactNode }

const RENDER: Record<WidgetId, () => ReactNode> = {
  queue: () => null,
  setup: () => <SetupWidget />,
  todo: () => <TodoWidget />,
  revenue: () => <RevenueWidget />,
  orders: () => <OrdersWidget />,
  chargebacks: () => <ChargebacksWidget />,
  suppliers: () => <SuppliersWidget />,
  tickets: () => <TicketsWidget />,
  stock: () => <StockWidget />,
  automations: () => <AutomationsWidget />,
  mytickets: () => <MyTicketsWidget />,
  team: () => <TeamWidget />,
  today: () => <TodayCard />,
  live: () => <LiveCard />,
  mentions: () => <MentionsCard />,
  recent: () => <RecentCard />,
  insyte: () => <InsyteCard />,
  customeragent: () => <CustomerAgentCard />,
  returns: () => <ReturnsCard />,
  bestsellers: () => <BestsellersCard />,
  bookmarks: () => <BookmarksCard />,
  countries: () => <CountriesCard />,
  chats: () => <ChatsCard />
}

export const WIDGETS = Object.fromEntries(
  (Object.keys(WIDGET_DEFS) as WidgetId[]).map((id) => [id, { ...WIDGET_DEFS[id], render: RENDER[id] }])
) as Record<WidgetId, WidgetDef>

/* ─── Setup ─────────────────────────────────────────────────────────────── */

export function useSetupTasks(): Task[] {
  const stores = useWorkspace((s) => s.stores)
  const members = useWorkspace((s) => s.members)
  const integrations = useWorkspace((s) => s.integrations)
  const ticked = useHome((s) => s.ticked)
  const connected = (k: string) => integrations.some((i) => i.key === k && i.status === "connected")
  const facts: Record<"store" | "inbox" | "team", boolean> = {
    store: stores.some((s) => s.status === "connected"),
    inbox: connected("gmail") || connected("outlook"),
    team: members.length > 1
  }
  return setupTasks((id) => (id === "store" || id === "inbox" || id === "team" ? facts[id] : ticked.includes(id)))
}

function SetupWidget() {
  const tasks = useSetupTasks()
  const toggleTask = useHome((s) => s.toggleTask)
  return <SetupView tasks={tasks} onToggle={toggleTask} />
}

/* ─── To-do ─────────────────────────────────────────────────────────────── */

function TodoWidget() {
  const todos = useHome((s) => s.todos)
  const addTodo = useHome((s) => s.addTodo)
  const toggleTodo = useHome((s) => s.toggleTodo)
  const removeTodo = useHome((s) => s.removeTodo)
  const restoreTodo = useHome((s) => s.restoreTodo)
  return (
    <TodoView
      todos={todos}
      onAdd={(text) => addTodo(text)}
      onToggle={toggleTodo}
      onRemove={(id) => {
        const gone = removeTodo(id)
        if (gone) undoable("Taak verwijderd", () => restoreTodo(gone))
      }}
    />
  )
}

/* ─── Revenue ───────────────────────────────────────────────────────────── */

const DAY = 86_400_000

function RevenueWidget() {
  const orders = useWorkspace((s) => s.orders)
  const range = useHome((s) => s.range)
  const currency = useHome((s) => s.currency)
  const w = useMemo(() => revenueWindow(orders, range, currency), [orders, range, currency])
  return (
    <RevenueView
      total={w.total}
      change={w.change}
      points={w.points}
      range={range}
      currency={currency}
      breakdown={(open, onOpenChange) => (
        <RevenueBreakdown open={open} onOpenChange={onOpenChange} window={w} days={range} currency={currency} />
      )}
    />
  )
}

/* ─── Orders by stage ───────────────────────────────────────────────────── */

function OrdersWidget() {
  const all = useWorkspace((s) => s.orders)
  const range = useHome((s) => s.range)
  // Orders placed in the board's window, ending at the latest order the workspace has.
  const orders = useMemo(() => {
    const end = Math.max(0, ...all.map((o) => Date.parse(o.created_at))) + DAY
    return all.filter((o) => Date.parse(o.created_at) >= end - range * DAY)
  }, [all, range])
  const stages = Object.fromEntries(
    STAGES.map((st) => [st.id, orders.filter((o) => o.status === st.id).length])
  ) as Record<Stage, number>
  const delayed =
    orders.filter((o) => o.tags.includes("at_risk") && o.status !== "cancelled" && o.status !== "refunded").length
  return <OrdersView stages={stages} delayed={delayed} />
}

/* ─── Chargebacks ───────────────────────────────────────────────────────── */

function ChargebacksWidget() {
  const cases = useWorkspace((s) => s.chargebacks)
  const open = cases.filter((c) => c.status === "open" || c.status === "awaiting_evidence")
  const won = cases.filter((c) => c.status === "won")
  const lost = cases.filter((c) => c.status === "lost").length
  const submitted = cases.filter((c) => c.status === "submitted").length
  const decided = won.length + lost
  const currency = useHome((s) => s.currency)
  const atStake = open.reduce((s, c) => s + convert(c.amount, c.currency, currency), 0)
  const nearest = [...open].toSorted((a, b) => Date.parse(a.deadline_at) - Date.parse(b.deadline_at))[0]
  const daysLeft = nearest ? Math.max(0, Math.ceil((Date.parse(nearest.deadline_at) - Date.now()) / DAY)) : null

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-1.5">
        <Stat label="Bewijs nodig" value={String(open.length)} />
        <Stat label="Op het spel" value={formatCurrency(atStake, currency)} />
        <Stat label="Gewonnen" value={decided === 0 ? "—" : `${won.length} van ${decided}`} />
        <Stat label="Ingediend" value={String(submitted)} />
      </div>
      {nearest ?
        (
          <Link
            to={"/chargebacks/$chargebackId" as string}
            params={{ chargebackId: nearest.id } as never}
            className="glyph-host flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink-2 transition-colors hover:bg-ink/4 hover:text-ink"
          >
            <Glyph draw={false} icon={Clock} size={14} className="text-ink-3" />
            <span className="min-w-0 flex-1 truncate">
              Eerstvolgende: <span className="font-medium text-ink">{nearest.case_number}</span>,{" "}
              {nearest.customer_name}
            </span>
            <span className="shrink-0 font-medium text-ink tabular-nums">
              {daysLeft === 0 ? "vandaag" : `${daysLeft}d`}
            </span>
          </Link>
        ) :
        <p className="px-2 text-sm text-ink-3">Er wacht geen zaak op bewijs.</p>}
    </div>
  )
}

/* ─── Suppliers ─────────────────────────────────────────────────────────── */

function SuppliersWidget() {
  const orders = useWorkspace((s) => s.orders)
  const rows = useMemo(() => {
    const open = orders.filter((o) => o.status !== "cancelled" && o.status !== "refunded" && o.status !== "delivered")
    const by = new Map<string, { delayed: number; open: number }>()
    for (const o of open) {
      const name = supplierName(o.id)
      const r = by.get(name) ?? { delayed: 0, open: 0 }
      r.open += 1
      if (o.tags.includes("at_risk")) r.delayed += 1
      by.set(name, r)
    }
    return [...by]
      .map(([name, r]) => ({ name, ...r }))
      .toSorted((a, b) => b.delayed - a.delayed || b.open - a.open)
      .slice(0, 5)
  }, [orders])
  return <SuppliersView rows={rows} />
}

/* ─── Tickets ───────────────────────────────────────────────────────────── */

function TicketsWidget() {
  const tickets = useWorkspace((s) => s.tickets)
  const columns = Object.fromEntries(
    COLUMNS.map((c) => [c.id, tickets.filter((t) => t.status === c.id).length])
  ) as Record<Column, number>
  const high = tickets.filter((t) => t.priority === "high" && t.status !== "done").length
  return <TicketsView columns={columns} high={high} />
}

/* ─── Low stock ─────────────────────────────────────────────────────────── */

const LOW = 12

function StockWidget() {
  const rows = useMemo(
    () =>
      products
        .flatMap((p) =>
          p.variants.map((v) => ({
            id: v.id,
            product: p.title,
            productId: p.id,
            variant: v.title,
            sku: v.sku,
            left: v.inventory_level
          }))
        )
        .filter((v) => v.left <= LOW)
        .toSorted((a, b) => a.left - b.left)
        .slice(0, 5),
    []
  )
  return <StockView rows={rows} />
}

/* ─── Automations ───────────────────────────────────────────────────────── */

function AutomationsWidget() {
  const active = automations.filter((a) => a.status === "active")
  const runs = automations.reduce((s, a) => s + a.runs_30d, 0)
  const top = [...automations].toSorted((a, b) => b.runs_30d - a.runs_30d).slice(0, 3)
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-1.5">
        <Stat label="Actief" value={`${active.length} van ${automations.length}`} />
        <Stat label="Uitvoeringen, 30 dagen" value={runs.toLocaleString("nl-NL")} />
      </div>
      <ul className="flex flex-col">
        {top.map((a, i) => (
          <li
            key={a.id}
            className={cn(
              "glyph-host flex h-8 items-center gap-2.5 rounded-md px-2 text-base",
              i % 2 === 0 && "bg-band"
            )}
          >
            <Glyph draw={false} icon={Workflow} size={14} className="text-ink-3" />
            <span className="min-w-0 flex-1 truncate text-ink">{a.name}</span>
            <span className="text-sm text-ink-2 tabular-nums">{a.runs_30d.toLocaleString("nl-NL")}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-band px-2.5 py-2">
      <span className="text-xs text-ink-3">{label}</span>
      <span className="font-medium text-lg text-ink tabular-nums">{value}</span>
    </div>
  )
}

/* ─── My tickets ────────────────────────────────────────────────────────── */

function MyTicketsWidget() {
  const tickets = useWorkspace((s) => s.tickets)
  const mine = useMemo(
    () =>
      tickets
        .filter((t) => t.status !== "done" && isAssignedTo(t.assignee_ids, ME))
        .toSorted((a, b) =>
          PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || Date.parse(b.updated_at) - Date.parse(a.updated_at)
        ),
    [tickets]
  )
  return <MyTicketsView rows={mine.slice(0, 5)} total={mine.length} />
}

/* ─── Team online ───────────────────────────────────────────────────────── */

function TeamWidget() {
  const members = useWorkspace((s) => s.members)
  const team = useMemo(
    () =>
      members
        .filter((m) => m.id !== ME && m.status === "active")
        .map((m) => ({
          id: m.id,
          name: m.name,
          presence: presenceById[m.id] ?? "offline",
          doing: lastActionById[m.id]
        })),
    [members]
  )
  return <TeamView team={team} message />
}
