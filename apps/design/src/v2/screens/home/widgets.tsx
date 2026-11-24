import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import { ASSISTANT } from "../../assistant.ts"
import { formatValue } from "../../charts/format.ts"
import { LineChart } from "../../charts/line-chart.tsx"
import { RankChart } from "../../charts/rank-chart.tsx"
import { openProposals, useDemo } from "../../demo.ts"
import { ACTIVITY, AGENTS, hoursSaved } from "../../fixtures/agents.ts"
import type { Activity, Autonomy, Glyph } from "../../fixtures/agents.ts"
import { SEED as AUTOMATIONS } from "../../fixtures/automations.ts"
import { CASE_STATUS, casesOf, CHANNEL_LABEL, isOpenCase, timeLeft, useCases } from "../../fixtures/chargebacks.ts"
import {
  BOOKMARKS,
  CUSTOMER_AGENT_TODAY,
  ELSEWHERE,
  MOMENTS,
  ORDERS_BY_COUNTRY,
  RECENT,
  SETUP_TASKS
} from "../../fixtures/home.ts"
import { assignedTo, CONVERSATIONS, PRIORITY, STATUS_ORDER, TICKET_STATUS, TICKETS } from "../../fixtures/inbox.ts"
import { EVENTS, INCOMING } from "../../fixtures/live.ts"
import type { LiveEvent } from "../../fixtures/live.ts"
import { NOTIFICATIONS } from "../../fixtures/notifications.ts"
import { ORDER_STATUS, ORDERS, product, PRODUCTS, supplierOrders, SUPPLIERS, VAT } from "../../fixtures/records.ts"
import type { OrderStatus } from "../../fixtures/records.ts"
import { deadlineOf, readyToResolve, returnsOf, toReview, useReturnsState } from "../../fixtures/returns.ts"
import { PEOPLE } from "../../fixtures/workspace.ts"
import { Link, paths } from "../../router.tsx"
import { undoable } from "../../ui/acts.ts"
import { AgentAvatar, Avatar } from "../../ui/avatar.tsx"
import { Status } from "../../ui/badge.tsx"
import { Button, IconButton } from "../../ui/button.tsx"
import { Checkbox } from "../../ui/checkbox.tsx"
import { cx } from "../../ui/cx.ts"
import {
  At,
  BarChart3,
  Bot,
  Box,
  Calendar,
  Check,
  Clock,
  CreditCard,
  Globe,
  Inbox,
  MessageCircle,
  MessagesSquare,
  Newspaper,
  Pause,
  Pin,
  Play,
  Plus,
  Returns,
  Rocket,
  ShoppingBag,
  Sparkle,
  Star,
  Ticket,
  Trash,
  Truck,
  Users,
  Workflow
} from "../../ui/icons.tsx"
import { List, ListRow } from "../../ui/list.tsx"
import { ProgressBar } from "../../ui/progress.tsx"
import { Rich } from "../../ui/rich.tsx"
import type { PermArea } from "../../view.ts"
import { useOpenBreakdown } from "./breakdown.tsx"
import { dayAfter, minutesOf, NOW_MINUTES, parseDue } from "./dates.ts"
import { Queue } from "./queue.tsx"
import { addTodo, removeTodo, restoreTodo, tickSetup, toggleTodo, useHome } from "./store.ts"
import type { WidgetId, WidgetSize } from "./store.ts"

/*
 * The board's cards. Each answers one question an operator asks between triage runs (what did the
 * agents do, is setup done, where are orders stuck, which supplier is slow) and reads the same
 * fixtures the area itself shows, so a card and its screen never disagree. The grammar is Start's:
 * a small heading, figures in the tabular face, rows without rules, one accent at most.
 */

type WidgetDef = {
  readonly title: string
  /** One line for "Kaart toevoegen". */
  readonly blurb: string
  readonly glyph: Glyph
  readonly size: WidgetSize
  /** Where "Openen" in the heading goes, when the card is a window onto a screen. */
  readonly href?: string
  /** The permission it reads; a role without it does not get the card. */
  readonly area?: PermArea
  readonly render: (ctx: { readonly active: boolean }) => ReactNode
}

const SETTING: Record<Autonomy, string> = { zelf: "Zelf doen", vragen: "Eerst vragen", nooit: "Nooit" }

export const WIDGETS: Readonly<Record<WidgetId, WidgetDef>> = {
  queue: {
    title: "Te doen vandaag",
    blurb: "Wat vandaag moet, van jou en van je agents, op volgorde van wat er op het spel staat.",
    glyph: Inbox,
    size: 2,
    render: ({ active }) => <Queue active={active} />
  },
  gedaan: {
    title: "Vannacht en vandaag gedaan",
    blurb: "Wat je agents zelf deden, met de regel waaronder.",
    glyph: Bot,
    size: 1,
    href: paths.log,
    render: () => <DoneByAgents />
  },
  elders: {
    title: "Elders in Northwind",
    blurb: "De paar cijfers uit andere onderdelen die vandaag een blik waard zijn.",
    glyph: Newspaper,
    size: 1,
    render: () => <Elsewhere />
  },
  agents: {
    title: "Je agents",
    blurb: "Welke agents aan het werk zijn en hoe vaak ze vandaag iets deden.",
    glyph: Bot,
    size: 1,
    href: paths.agents,
    render: () => <Agents />
  },
  team: {
    title: "Team nu",
    blurb: "Wie er is en waar ze aan werken.",
    glyph: Users,
    size: 1,
    href: paths.settings("team"),
    area: "team",
    render: () => <Team />
  },
  setup: {
    title: "Inrichting afronden",
    blurb: "Wat de onboarding voor later liet, afgevinkt zodra je het doet.",
    glyph: Rocket,
    size: 1,
    render: () => <Setup />
  },
  todo: {
    title: "Je lijst",
    blurb: "Een korte takenlijst die alleen jij ziet; dezelfde als in Mijn werk.",
    glyph: Check,
    size: 1,
    render: () => <Todos />
  },
  revenue: {
    title: "Omzet deze week",
    blurb: "Omzet per dag sinds maandag, en waar die van vandaag vandaan komt.",
    glyph: BarChart3,
    size: 1,
    href: paths.board("week"),
    area: "analytics",
    render: () => <Revenue />
  },
  orders: {
    title: "Bestellingen per fase",
    blurb: "Waar elke open bestelling staat, en hoeveel er vertraagd zijn.",
    glyph: ShoppingBag,
    size: 1,
    href: paths.orders,
    area: "orders",
    render: () => <OrdersByStage />
  },
  chargebacks: {
    title: "Chargebacks",
    blurb: "Zaken die op bewijs wachten, de eerstvolgende deadline en je resultaat.",
    glyph: CreditCard,
    size: 1,
    href: paths.chargebacks,
    area: "chargebacks",
    render: () => <Chargebacks />
  },
  suppliers: {
    title: "Vertragingen bij leveranciers",
    blurb: "Welke leveranciers trager leveren dan beloofd.",
    glyph: Truck,
    size: 1,
    href: paths.suppliers,
    area: "suppliers",
    render: () => <Suppliers />
  },
  tickets: {
    title: "Tickets",
    blurb: "De kolommen van de inbox in één oogopslag.",
    glyph: Ticket,
    size: 1,
    href: paths.tickets,
    area: "support",
    render: () => <Tickets />
  },
  stock: {
    title: "Lage voorraad",
    blurb: "Producten die bijna of helemaal op zijn.",
    glyph: Box,
    size: 1,
    href: paths.products,
    area: "products",
    render: () => <LowStock />
  },
  automations: {
    title: "Automatiseringen",
    blurb: "Wat er de afgelopen 30 dagen is uitgevoerd.",
    glyph: Workflow,
    size: 1,
    href: paths.automations,
    area: "automations",
    render: () => <Automations />
  },
  mytickets: {
    title: "Mijn tickets",
    blurb: "De open tickets die aan jou zijn toegewezen, de belangrijkste eerst.",
    glyph: Ticket,
    size: 1,
    href: paths.inbox,
    area: "support",
    render: () => <MyTickets />
  },
  today: {
    title: "Agenda vandaag",
    blurb: "De deadlines en geplande dingen van vandaag, met een lijn voor nu.",
    glyph: Calendar,
    size: 1,
    render: () => <TodayAgenda />
  },
  live: {
    title: "Live bestellingen",
    blurb: "Verkopen en mandjes zoals ze binnenkomen, te pauzeren.",
    glyph: ShoppingBag,
    size: 1,
    href: paths.live,
    area: "orders",
    render: () => <LiveOrders />
  },
  mentions: {
    title: "Vermeldingen en toegewezen",
    blurb: "Waar iemand je noemde of werk bij je neerlegde.",
    glyph: At,
    size: 1,
    href: paths.notifications,
    render: () => <Mentions />
  },
  recent: {
    title: "Recent",
    blurb: "De records die je het laatst opende.",
    glyph: Clock,
    size: 1,
    render: () => <Recent />
  },
  magnus: {
    title: `Wat ${ASSISTANT} deed`,
    blurb: "Uitvoeringen, voorstellen en de tijd die het je vandaag scheelt.",
    glyph: Sparkle,
    size: 1,
    href: paths.agents,
    render: () => <WhatMagnusDid />
  },
  customeragent: {
    title: "Klantagent vandaag",
    blurb: "Gesprekken op de winkelchat: wat de agent afhandelde en wat hij doorgaf.",
    glyph: MessageCircle,
    size: 1,
    href: paths.storeChat,
    area: "support",
    render: () => <CustomerAgent />
  },
  returns: {
    title: "Retouren",
    blurb: "Wat te beoordelen of af te handelen is, met de eerstvolgende deadline.",
    glyph: Returns,
    size: 1,
    href: paths.returns,
    area: "returns",
    render: () => <ReturnsCard />
  },
  bestsellers: {
    title: "Bestsellers",
    blurb: "Wat deze week het meest verkocht, met de voorraad die nog over is.",
    glyph: Star,
    size: 1,
    href: paths.products,
    area: "products",
    render: () => <Bestsellers />
  },
  bookmarks: {
    title: "Bladwijzers",
    blurb: "Je vastgezette weergaven en records, één klik van Start.",
    glyph: Pin,
    size: 1,
    render: () => <Bookmarks />
  },
  countries: {
    title: "Bestellingen per land",
    blurb: "Waar de bestellingen van deze week vandaan komen.",
    glyph: Globe,
    size: 1,
    href: paths.board("week"),
    area: "analytics",
    render: () => <Countries />
  },
  chats: {
    title: "Ongelezen chats",
    blurb: "Kanalen en privéberichten van het team met iets nieuws.",
    glyph: MessagesSquare,
    size: 1,
    href: paths.teamChat,
    render: () => <UnreadChats />
  }
}

/* ── small parts ───────────────────────────────────────────────────────────────────────────────── */

/** A figure with its label under it: the one number a card leads with. */
function Lead({ value, label, tone }: { readonly value: string; readonly label: string; readonly tone?: "warn" }) {
  return (
    <p className="flex items-baseline gap-2">
      <span className={cx("figure text-xl font-semibold", tone === "warn" ? "text-warn-ink" : "text-ink")}>
        {value}
      </span>
      <span className="text-xs text-ink-3">{label}</span>
    </p>
  )
}

/** A quiet line under a card's rows. */
function Foot({ children }: { readonly children: ReactNode }) {
  return <p className="text-xs text-pretty text-ink-3">{children}</p>
}

/** Label, a thin share bar, and the figure: the cards' ranking row. */
function ShareRow({ label, value, of, shown, href, strong = false }: {
  readonly label: ReactNode
  readonly value: number
  readonly of: number
  readonly shown: string
  readonly href?: string
  readonly strong?: boolean
}) {
  const body = (
    <>
      <span className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate text-ink">{label}</span>
        <span className="figure shrink-0 text-ink-2">{shown}</span>
      </span>
      <span className="block h-1 overflow-hidden rounded-full bg-well" aria-hidden="true">
        <span
          className={cx("block h-full rounded-full", strong ? "bg-ink" : "bg-ink-3")}
          style={{ width: `${of === 0 ? 0 : Math.max(2, (value / of) * 100)}%` }}
        />
      </span>
    </>
  )
  return (
    <li>
      {href === undefined ?
        <div className="flex flex-col gap-1 py-1">{body}</div> :
        (
          <Link to={href} className="-mx-2 flex flex-col gap-1 rounded-md px-2 py-1 transition-colors hover:bg-hover">
            {body}
          </Link>
        )}
    </li>
  )
}

/* ── the cards ─────────────────────────────────────────────────────────────────────────────────── */

/** How many lines of what the agents did the card shows; the log has the rest. */
const DONE = 5

function DoneByAgents() {
  return (
    <ol className="flex flex-col gap-3 pt-1">
      {ACTIVITY.slice(0, DONE).map((line) => <DoneLine key={line.id} line={line} />)}
    </ol>
  )
}

function DoneLine({ line }: { readonly line: Activity }) {
  const agent = AGENTS.find((a) => a.id === line.agentId)
  const night = line.at.startsWith("vannacht")
  return (
    <li className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-2.5">
      <span className="figure pt-px text-xs text-ink-3">{night ? line.at.replace("vannacht ", "") : line.at}</span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-sm text-pretty text-ink">{line.text}</p>
        <p className="text-xs text-pretty text-ink-3">
          {agent !== undefined && (
            <Link to={paths.agent(agent.id)} className="text-ink-2 hover:text-ink hover:underline">
              {agent.name}
            </Link>
          )}
          {night && " · vannacht"} · {SETTING[line.setting]}: {line.rule}
        </p>
      </div>
    </li>
  )
}

function Elsewhere() {
  return (
    <ul className="-mx-2 flex flex-col gap-px">
      {ELSEWHERE.map((row) => (
        <li key={row.id}>
          <Link
            to={row.href}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 rounded-md px-2 py-1.5 transition-colors hover:bg-hover pointer-coarse:py-2.5"
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm text-ink">{row.label}</span>
              <span className="truncate text-xs text-ink-3">{row.detail}</span>
            </span>
            <Status tone={row.tone}>
              <span className="figure">{row.value}</span>
            </Status>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function Agents() {
  const handled = AGENTS.reduce((sum, agent) => sum + agent.runsToday, 0)
  return (
    <div className="flex flex-col gap-2">
      <Foot>
        <span className="figure">{handled}</span> keer zelf gedaan vandaag
      </Foot>
      <List label="Agents aan het werk" className="-mx-2">
        {AGENTS.filter((agent) => agent.active).slice(0, 4).map((agent) => (
          <ListRow
            key={agent.id}
            href={paths.agent(agent.id)}
            lead={<AgentAvatar glyph={agent.glyph} size={26} />}
            title={agent.name}
            meta={agent.lastWorked}
            trail={<span className="figure">{agent.runsToday}×</span>}
          />
        ))}
      </List>
    </div>
  )
}

const TEAM = [
  { person: PEOPLE.sofia, doing: "beantwoordt ticket #5142" },
  { person: PEOPLE.ethan, doing: "in de bestellingenwachtrij" },
  { person: PEOPLE.liam, doing: "18 min geleden actief" },
  { person: PEOPLE.maya, doing: "gisteren voor het laatst" }
] as const

function Team() {
  return (
    <List label="Team" className="-mx-2">
      {TEAM.map(({ person, doing }) => (
        <ListRow
          key={person.id}
          href={paths.person(person.id)}
          lead={<Avatar name={person.name} size={26} presence={person.presence} />}
          title={person.name}
          meta={doing}
        />
      ))}
    </List>
  )
}

function Setup() {
  const { ticked } = useHome()
  const tasks = SETUP_TASKS.map((t) => ({ ...t, done: t.done || ticked.includes(t.id) }))
  const done = tasks.filter((t) => t.done).length
  if (done === tasks.length) {
    return <Foot>Alles staat. Haal de kaart van je bord als je hem niet meer nodig hebt.</Foot>
  }
  return (
    <div className="flex flex-col gap-3">
      <ProgressBar label="Ingericht" value={done} max={tasks.length} detail={`${done} van ${tasks.length}`} />
      <ul className="flex flex-col">
        {tasks.filter((t) => !t.done || ticked.includes(t.id)).map((task) => (
          <li key={task.id} className="flex min-h-9 items-center justify-between gap-3">
            {task.auto
              ? (
                <span className="flex items-center gap-2.5 text-sm text-ink">
                  <span
                    aria-hidden="true"
                    className="size-4 shrink-0 rounded-full ring-1 ring-line-strong ring-inset"
                  />
                  {task.label}
                </span>
              )
              : (
                <Checkbox
                  checked={task.done}
                  onChange={(on) => tickSetup(task.id, on)}
                  label={task.label}
                />
              )}
            {!task.done && (
              <Link to={task.href} className="shrink-0 text-xs text-ink-3 hover:text-ink">
                Openen
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Todos() {
  const { todos } = useHome()
  const [draft, setDraft] = useState("")
  const parsed = parseDue(draft)
  return (
    <div className="flex flex-col gap-2">
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (parsed.text === "") return
          addTodo(parsed.text, parsed.due)
          setDraft("")
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-label="Taak toevoegen"
          placeholder="Taak toevoegen, bijvoorbeeld ‘Allure bellen morgen’"
          className="h-8 min-w-0 flex-1 rounded-sm bg-canvas px-2.5 text-sm text-ink ring-1 ring-line-strong ring-inset outline-none placeholder:text-ink-3 focus:ring-2 focus:ring-accent"
        />
        <IconButton label="Toevoegen" size="sm" tone="outline" type="submit" disabled={draft.trim() === ""}>
          <Plus />
        </IconButton>
      </form>
      {todos.length === 0
        ? <Foot>Niets op je lijst.</Foot>
        : (
          <ul className="flex flex-col">
            {todos.map((todo) => (
              <li key={todo.id} className="group flex min-h-9 items-center gap-2">
                <span className="min-w-0 flex-1">
                  <Checkbox checked={todo.done} onChange={() => toggleTodo(todo.id)} label={todo.text} />
                </span>
                {todo.due !== undefined && !todo.done && <DueWord day={todo.due} />}
                <IconButton
                  label={`${todo.text} verwijderen`}
                  size="sm"
                  className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                  onClick={() => {
                    const gone = removeTodo(todo.id)
                    if (gone !== undefined) undoable("Taak verwijderd", () => restoreTodo(gone))
                  }}
                >
                  <Trash />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
    </div>
  )
}

function DueWord({ day }: { readonly day: string }) {
  const today = dayAfter(0)
  return (
    <span className={cx("shrink-0 text-xs", day < today ? "text-bad-ink" : "text-ink-3")}>
      {day === today ? "vandaag" : day === dayAfter(1) ? "morgen" : new Intl.DateTimeFormat("nl-NL", {
        weekday: "short"
      }).format(new Date(`${day}T12:00:00`))}
    </span>
  )
}

const DAY_LABELS = ["ma 16", "di 17", "wo 18", "do 19", "vr 20", "za 21", "zo 22", "vandaag"]

/** Revenue per day this week, excl. btw (as Analyse counts it), from the orders themselves. */
function revenueByDay() {
  const start = new Date(2026, 10, 16).getTime()
  const days = Array.from({ length: 8 }, () => 0)
  for (const o of ORDERS) {
    const i = Math.floor((o.placedAt.getTime() - start) / 86_400_000)
    if (i >= 0 && i < days.length) days[i] = (days[i] ?? 0) + o.total / VAT
  }
  return days.map((v) => Math.round(v))
}

function Revenue() {
  const open = useOpenBreakdown()
  const days = revenueByDay()
  const total = days.reduce((sum, v) => sum + v, 0)
  return (
    <div className="flex flex-col gap-2">
      <Lead value={formatValue(total, "euro")} label="sinds maandag 16 nov" />
      <LineChart data={{ labels: DAY_LABELS, current: days, format: "euro", focus: days.length - 1 }} height={132} />
      <Button size="sm" variant="ghost" className="-ml-2.5 self-start" onClick={() => open("Omzet")}>
        Waar de omzet van vandaag vandaan komt
      </Button>
    </div>
  )
}

const OPEN_STAGES: ReadonlyArray<OrderStatus> = ["betaald", "bij-leverancier", "verzonden", "vertraagd"]

function OrdersByStage() {
  const counts = OPEN_STAGES.map((status) => ({ status, n: ORDERS.filter((o) => o.status === status).length }))
  const total = counts.reduce((sum, c) => sum + c.n, 0)
  const late = counts.find((c) => c.status === "vertraagd")?.n ?? 0
  return (
    <div className="flex flex-col gap-3">
      <Lead value={formatValue(total, "count")} label="open bestellingen" />
      <ul className="flex flex-col gap-1">
        {counts.map((c) => (
          <ShareRow
            key={c.status}
            label={ORDER_STATUS[c.status].label}
            value={c.n}
            of={total}
            shown={formatValue(c.n, "count")}
            href={`${paths.orders}?status=${c.status}`}
            strong={c.status === "vertraagd"}
          />
        ))}
      </ul>
      {late > 0 && (
        <Foot>
          <span className="figure text-warn-ink">{late}</span> later dan beloofd aan de klant.
        </Foot>
      )}
    </div>
  )
}

function Chargebacks() {
  const cases = casesOf(useCases())
  const open = cases.filter(isOpenCase)
  const atStake = open.reduce((sum, c) => sum + c.amount, 0)
  const won = cases.filter((c) => c.status === "gewonnen").length
  const decided = won + cases.filter((c) => c.status === "verloren").length
  const nearest = open.filter((c) => c.status === "wacht-op-bewijs").toSorted((a, b) => a.dueAt - b.dueAt)[0]
  return (
    <div className="flex flex-col gap-3">
      <Lead value={`${open.length} open`} label={`${formatValue(atStake, "euro")} op het spel`} />
      {nearest !== undefined && (
        <Link
          to={paths.chargeback(nearest.id)}
          className="-mx-2 flex flex-col rounded-md px-2 py-1.5 transition-colors hover:bg-hover"
        >
          <span className="text-sm text-ink">
            {nearest.id} · {CHANNEL_LABEL[nearest.channel]}
          </span>
          <span className="text-xs text-bad-ink">
            {CASE_STATUS[nearest.status].label}, {timeLeft(nearest.dueAt)}
          </span>
        </Link>
      )}
      {decided > 0 && (
        <Foot>
          <span className="figure">{won}</span> van <span className="figure">{decided}</span> beslist in je voordeel.
        </Foot>
      )}
    </div>
  )
}

function Suppliers() {
  const rows = SUPPLIERS.filter((s) => s.status === "actief")
    .map((s) => ({
      s,
      late: supplierOrders(s.id).filter((o) => o.status === "vertraagd").length
    }))
    .toSorted((a, b) => b.s.leadDays - b.s.promiseDays - (a.s.leadDays - a.s.promiseDays))
  return (
    <ul className="-mx-2 flex flex-col gap-px">
      {rows.map(({ s, late }) => {
        const slow = s.leadDays > s.promiseDays
        return (
          <li key={s.id}>
            <Link
              to={paths.supplier(s.id)}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 rounded-md px-2 py-1.5 transition-colors hover:bg-hover"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm text-ink">{s.name}</span>
                <span className="truncate text-xs text-ink-3">
                  {late > 0 ? `${late} vertraagd` : "niets vertraagd"}
                </span>
              </span>
              <span className={cx("figure text-xs", slow ? "font-medium text-warn-ink" : "text-ink-2")}>
                {formatValue(s.leadDays, "days")} / {s.promiseDays} d
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function Tickets() {
  const high = TICKETS.filter((t) => t.status !== "klaar" && t.priority === "hoog").length
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-4 gap-2">
        {STATUS_ORDER.map((status) => (
          <Link
            key={status}
            to={`${paths.tickets}?status=${status}`}
            className="-mx-1 flex flex-col gap-0.5 rounded-md px-1 py-1 transition-colors hover:bg-hover"
          >
            <dt className="truncate text-2xs text-ink-3">{TICKET_STATUS[status].label}</dt>
            <dd className="figure text-md font-medium text-ink">
              {TICKETS.filter((t) => t.status === status).length}
            </dd>
          </Link>
        ))}
      </dl>
      {high > 0 && (
        <Foot>
          <span className="figure text-bad-ink">{high}</span> open met prioriteit {PRIORITY.hoog.label.toLowerCase()}.
        </Foot>
      )}
    </div>
  )
}

function LowStock() {
  const low = PRODUCTS.filter((p) => p.status === "actief" && p.stock <= 60).toSorted((a, b) => a.stock - b.stock)
  return (
    <List label="Lage voorraad" className="-mx-2">
      {low.slice(0, 5).map((p) => (
        <ListRow
          key={p.id}
          href={paths.product(p.id)}
          title={p.name}
          meta={p.sku}
          trail={p.stock === 0 ?
            <Status tone="bad">Op</Status> :
            <span className={cx("figure", p.stock <= 20 ? "text-warn-ink" : "text-ink-2")}>{p.stock} stuks</span>}
        />
      ))}
    </List>
  )
}

function Automations() {
  const active = AUTOMATIONS.filter((a) => a.status === "actief")
  const runs = AUTOMATIONS.reduce((sum, a) => sum + a.runs30, 0)
  const top = AUTOMATIONS.toSorted((a, b) => b.runs30 - a.runs30).slice(0, 3)
  return (
    <div className="flex flex-col gap-3">
      <Lead value={formatValue(runs, "count")} label="keer uitgevoerd in 30 dagen" />
      <ul className="flex flex-col gap-1">
        {top.map((a) => (
          <ShareRow
            key={a.id}
            label={a.name}
            value={a.runs30}
            of={top[0]?.runs30 ?? 1}
            shown={formatValue(a.runs30, "count")}
            href={paths.automation(a.id)}
          />
        ))}
      </ul>
      <Foot>
        <span className="figure">{active.length}</span> van <span className="figure">{AUTOMATIONS.length}</span>{" "}
        staan aan.
      </Foot>
    </div>
  )
}

const RANK = { hoog: 0, gemiddeld: 1, laag: 2 } as const

function MyTickets() {
  const mine = assignedTo("elena").toSorted((a, b) => RANK[a.priority] - RANK[b.priority])
  if (mine.length === 0) return <Foot>Geen open tickets op jouw naam.</Foot>
  return (
    <List label="Mijn tickets" className="-mx-2">
      {mine.slice(0, 5).map((t) => (
        <ListRow
          key={t.number}
          href={paths.ticket(t.number)}
          title={t.subject}
          meta={`#${t.number}`}
          trail={<Status tone={PRIORITY[t.priority].tone}>{PRIORITY[t.priority].label}</Status>}
        />
      ))}
    </List>
  )
}

function TodayAgenda() {
  const today = MOMENTS.filter((m) => m.day === 0 && m.time !== undefined).toSorted((a, b) =>
    minutesOf(a.time ?? "") - minutesOf(b.time ?? "")
  )
  const allDay = MOMENTS.filter((m) => m.day === 0 && m.time === undefined)
  const firstAhead = today.findIndex((m) => minutesOf(m.time ?? "") >= NOW_MINUTES)
  return (
    <div className="flex flex-col gap-2">
      {allDay.map((m) => (
        <Link key={m.id} to={m.href} className="text-xs text-good-ink hover:underline">
          Hele dag: {m.title}
        </Link>
      ))}
      <ol className="flex flex-col">
        {today.map((m, i) => (
          <li key={m.id} className="flex flex-col">
            {i === firstAhead && (
              <span className="flex items-center gap-2 py-1" aria-label="Nu">
                <span className="figure text-2xs font-semibold text-accent-ink">14:30</span>
                <span aria-hidden="true" className="h-px flex-1 bg-accent" />
              </span>
            )}
            <Link
              to={m.queueId === undefined ? m.href : `${paths.home}?rij=${m.queueId}`}
              className={cx(
                "-mx-2 grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-2 rounded-md px-2 py-1 transition-colors hover:bg-hover",
                i < firstAhead || firstAhead === -1 ? "text-ink-3" : "text-ink"
              )}
            >
              <span className="figure text-xs">{m.time}</span>
              <span
                className={cx("truncate text-sm", m.tone === "bad" && i >= firstAhead && "font-medium text-bad-ink")}
              >
                {m.title}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  )
}

function LiveOrders() {
  const [paused, setPaused] = useState(false)
  const [events, setEvents] = useState<ReadonlyArray<LiveEvent>>(() =>
    EVENTS.filter((e) => e.kind === "sale" || e.kind === "cart")
  )
  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    let turn = 0
    const id = window.setInterval(() => {
      const next = INCOMING.filter((e) => e.kind === "sale" || e.kind === "cart")[turn % 4]
      turn += 1
      if (next === undefined) return
      setEvents((list) => [{ ...next, id: `w-${Date.now()}`, at: "nu" }, ...list].slice(0, 6))
    }, 8000)
    return () => window.clearInterval(id)
  }, [paused])
  return (
    <div className="flex flex-col gap-2">
      <ol className="flex flex-col gap-1.5">
        {events.slice(0, 5).map((e, i) => (
          <li
            key={e.id}
            className={cx(
              "grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2 text-sm",
              e.kind === "sale" ? "text-ink" : "text-ink-2",
              i === 0 && "animate-rise motion-reduce:animate-none"
            )}
          >
            <span className="figure pt-px text-xs text-ink-3">{e.at}</span>
            <span className="min-w-0 truncate">
              <Rich text={e.text} />
            </span>
          </li>
        ))}
      </ol>
      <Button
        size="sm"
        variant="ghost"
        className="-ml-2.5 self-start"
        icon={paused ? <Play /> : <Pause />}
        aria-pressed={paused}
        onClick={() => setPaused(!paused)}
      >
        {paused ? "Hervatten" : "Pauzeren"}
      </Button>
    </div>
  )
}

function Mentions() {
  const notes = NOTIFICATIONS.filter((n) => n.kind === "vermelding" || n.kind === "toewijzing").slice(0, 4)
  return (
    <ul className="-mx-2 flex flex-col gap-px">
      {notes.map((n) => (
        <li key={n.id}>
          <Link
            to={n.href ?? paths.notifications}
            className="flex flex-col rounded-md px-2 py-1.5 transition-colors hover:bg-hover"
          >
            <span className={cx("line-clamp-2 text-sm text-pretty", n.unread ? "text-ink" : "text-ink-2")}>
              <Rich text={n.text} />
            </span>
            <span className="text-xs text-ink-3">
              {n.kind === "vermelding" ? "Noemde je" : "Aan jou toegewezen"} · {n.at}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function Recent() {
  return (
    <List label="Recent geopend" className="-mx-2">
      {RECENT.map((r) => (
        <ListRow
          key={r.href}
          href={r.href}
          title={r.label}
          meta={r.kind}
          trail={<span className="figure">{r.at}</span>}
        />
      ))}
    </List>
  )
}

function WhatMagnusDid() {
  const demo = useDemo()
  const runs = AGENTS.reduce((sum, a) => sum + a.runsToday, 0)
  const minutes = AGENTS.reduce((sum, a) => sum + a.runsToday * a.minutesPerRun, 0)
  const week = AGENTS.reduce((sum, a) => sum + hoursSaved(a), 0)
  return (
    <div className="flex flex-col gap-3">
      <Lead value={`${Math.round(minutes / 60)} uur`} label="werk bespaard vandaag" />
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div className="flex flex-col">
          <dt className="text-2xs text-ink-3">Zelf gedaan</dt>
          <dd className="figure text-md font-medium text-ink">{runs}</dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-2xs text-ink-3">Wacht op je ja</dt>
          <dd className="figure text-md font-medium text-ink">{openProposals(demo)}</dd>
        </div>
      </dl>
      <Foot>
        <span className="figure">{formatValue(week, "count")}</span> uur bespaard sinds de agents aan staan.
      </Foot>
    </div>
  )
}

function CustomerAgent() {
  const { chats, settled, handedOver, minutesSaved } = CUSTOMER_AGENT_TODAY
  return (
    <div className="flex flex-col gap-3">
      <Lead value={`${settled} van ${chats}`} label="zelf afgehandeld" />
      <ul className="flex flex-col gap-1">
        <ShareRow label="Afgehandeld door de agent" value={settled} of={chats} shown={String(settled)} strong />
        <ShareRow label="Doorgegeven aan het team" value={handedOver} of={chats} shown={String(handedOver)} />
      </ul>
      <Foot>Scheelde het team ongeveer {minutesSaved} minuten.</Foot>
    </div>
  )
}

function ReturnsCard() {
  const state = useReturnsState()
  const review = toReview(state).toSorted((a, b) => deadlineOf(a) - deadlineOf(b))
  const ready = readyToResolve(state).length
  const all = returnsOf(state).length
  const first = review[0]
  return (
    <div className="flex flex-col gap-3">
      <Lead value={`${review.length} te beoordelen`} label={`van ${all} retouren`} />
      {first !== undefined && (
        <Link
          to={paths.return(first.id)}
          className="-mx-2 flex flex-col rounded-md px-2 py-1.5 transition-colors hover:bg-hover"
        >
          <span className="text-sm text-ink">
            {first.number} · {product(first.productId)?.name ?? "Product"}
          </span>
          <span className="text-xs text-ink-3">Eerstvolgende deadline voor je oordeel</span>
        </Link>
      )}
      <Foot>
        <span className="figure">{ready}</span> ontvangen en klaar om af te handelen.
      </Foot>
    </div>
  )
}

function Bestsellers() {
  const units = new Map<string, number>()
  for (const o of ORDERS) for (const l of o.lines) units.set(l.productId, (units.get(l.productId) ?? 0) + l.quantity)
  const top = [...units].toSorted((a, b) => b[1] - a[1]).slice(0, 5)
  return (
    <List label="Bestsellers deze week" className="-mx-2">
      {top.map(([id, n]) => {
        const p = product(id)
        return (
          <ListRow
            key={id}
            href={paths.product(id)}
            title={p?.name ?? id}
            meta={`${p?.stock ?? 0} op voorraad`}
            trail={<span className="figure">{n} verkocht</span>}
          />
        )
      })}
    </List>
  )
}

function Bookmarks() {
  return (
    <List label="Bladwijzers" className="-mx-2">
      {BOOKMARKS.map((b) => <ListRow key={b.href} href={b.href} title={b.label} meta={b.detail} />)}
    </List>
  )
}

function Countries() {
  return <RankChart data={{ items: ORDERS_BY_COUNTRY, format: "count", focus: 0 }} />
}

function UnreadChats() {
  const unread = CONVERSATIONS.filter((c) => c.unread > 0)
  if (unread.length === 0) return <Foot>Alles gelezen.</Foot>
  return (
    <List label="Ongelezen chats" className="-mx-2">
      {unread.map((c) => (
        <ListRow
          key={c.id}
          href={paths.teamChat}
          title={c.kind === "kanaal" ? `#${c.name}` : c.name}
          meta={c.topic}
          trail={<span className="figure font-medium text-ink">{c.unread}</span>}
        />
      ))}
    </List>
  )
}
