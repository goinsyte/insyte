import { Link } from "@tanstack/react-router"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { type ReactNode, useMemo, useState } from "react"
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { AlertTriangle, Box, MessagesSquare, Plus, Truck, X } from "../../icons"
import { Glyph } from "../common/glyph"
import { formatCurrency, initials } from "../lib/format"
import { personStyle } from "../lib/person-color"
import type { Currency } from "../lib/types/domain"
import { cn } from "../lib/utils"
import type { Todo } from "../stores/home-store"
import { Struck, type Task, TickBox } from "./setup-checklist"

/*
 * The board's widgets over plain figures: the demo's wrappers (`widgets.tsx`) read its stores and hand them in, the
 * console hands in `Home.widgets`. Nothing here reads a store (ADR-0034).
 */

/** What onboarding left for later, ticked as it is done; `canOpen` says which tasks have their screen to go to. */
export function SetupView({
  tasks,
  onToggle: toggleTask,
  canOpen = () => true
}: {
  tasks: ReadonlyArray<Task>
  onToggle: (id: Task["id"]) => void
  canOpen?: (task: Task) => boolean
}) {
  const still = useReducedMotion()
  const done = tasks.filter((t) => t.done).length
  const pct = done / tasks.length

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-ink/8">
          <motion.span
            className="absolute inset-y-0 left-0 rounded-full bg-arc"
            initial={false}
            animate={{ width: `${pct * 100}%` }}
            transition={still ? { duration: 0 } : { type: "spring", stiffness: 200, damping: 28 }}
          />
        </div>
        <span className="font-medium text-sm text-ink-2 tabular-nums">
          {done} van {tasks.length}
        </span>
      </div>
      <ul className="flex flex-col">
        {tasks.map((t, i) => (
          <li
            key={t.id}
            className={cn("glyph-host flex h-9 items-center gap-2.5 rounded-md px-2", i % 2 === 0 && "bg-band")}
          >
            <TickBox
              done={t.done}
              disabled={t.auto}
              onToggle={() => toggleTask(t.id)}
              label={t.label}
              title={t.auto ? "Wordt automatisch afgevinkt zodra het in de werkruimte gebeurt" : undefined}
            />
            <Glyph
              draw={false}
              icon={t.icon}
              size={15}
              className={cn("shrink-0", t.done ? "text-ink-4" : "text-ink-3")}
            />
            {canOpen(t) ?
              (
                <Link
                  to={t.to}
                  className={cn(
                    "min-w-0 flex-1 truncate text-base transition-colors hover:text-arc-ink",
                    t.done ? "text-ink-3" : "text-ink"
                  )}
                >
                  <Struck on={t.done}>{t.label}</Struck>
                </Link>
              ) :
              (
                <span className={cn("min-w-0 flex-1 truncate text-base", t.done ? "text-ink-3" : "text-ink")}>
                  <Struck on={t.done}>{t.label}</Struck>
                </span>
              )}
            {t.auto && t.done ? <span className="text-xs text-ink-3">Klaar</span> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The person's own list: what is open first, then what is done; adding, ticking and taking one off. */
export function TodoView({
  todos,
  onAdd: addTodo,
  onToggle: toggleTodo,
  onRemove
}: {
  todos: ReadonlyArray<Todo>
  onAdd: (text: string) => void
  onToggle: (id: string) => void
  onRemove: (id: string) => void
}) {
  const still = useReducedMotion()
  const [draft, setDraft] = useState("")
  const open = todos.filter((t) => !t.done)
  const ordered = [...open, ...todos.filter((t) => t.done)]

  return (
    <div className="flex flex-col gap-2">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const text = draft.trim()
          if (!text) return
          addTodo(text)
          setDraft("")
        }}
        className="field flex h-9 items-center gap-2 rounded-lg pr-1 pl-2.5 focus-within:bg-paper hover:field-hover"
      >
        <Plus className="size-3.5 shrink-0 text-ink-3" strokeWidth={2} />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Iets toevoegen om te doen"
          aria-label="Taak toevoegen"
          className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-3"
        />
        {draft.trim() ?
          (
            <button
              type="submit"
              className="h-7 rounded-md bg-abyss px-2.5 font-medium text-sm text-mesh-ink hover:bg-abyss-2"
            >
              Toevoegen
            </button>
          ) :
          null}
      </form>
      <ul className="flex flex-col">
        <AnimatePresence initial={false}>
          {ordered.map((t) => (
            <motion.li
              key={t.id}
              layout={!still}
              initial={still ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 36 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 40 }}
              className="group/todo flex items-center gap-2.5 overflow-hidden rounded-md px-2 hover:bg-ink/4"
            >
              <TickBox done={t.done} round onToggle={() => toggleTodo(t.id)} label={t.text} />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-base transition-colors",
                  t.done ? "text-ink-3" : "text-ink"
                )}
              >
                <Struck on={t.done}>{t.text}</Struck>
              </span>
              <button
                type="button"
                aria-label={`"${t.text}" verwijderen`}
                onClick={() => onRemove(t.id)}
                className="flex size-6 cursor-pointer items-center justify-center rounded-md text-ink-3 opacity-0 transition-opacity hover:bg-ink/6 hover:text-ink group-hover/todo:opacity-100 focus-visible:opacity-100"
              >
                <X className="size-3.5" strokeWidth={2} />
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {todos.length === 0 ? <p className="px-2 text-sm text-ink-3">Er staat niets op je lijst.</p> : null}
      {open.length === 0 && todos.length > 0 ? <p className="px-2 text-sm text-ink-3">Alles is af voor nu.</p> : null}
    </div>
  )
}

export type RevenuePoint = { label: string; value: number; orders: number }

/** The revenue card over its figures: the total in the board's window, the change on the window before, the curve. */
export function RevenueView({
  total,
  change,
  points: series,
  range,
  currency,
  breakdown
}: {
  total: number
  change: number | null
  points: ReadonlyArray<RevenuePoint>
  range: number
  currency: Currency
  /** "Waar dit getal vandaan komt", drawn by whoever has the parts. */
  breakdown: (open: boolean, onOpenChange: (v: boolean) => void) => ReactNode
}) {
  const [explaining, setExplaining] = useState(false)
  const money = (n: number) => formatCurrency(n, currency)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-3">
        {/* The figure is a question you can ask: click it to see what it is made of. */}
        <button
          type="button"
          onClick={() => setExplaining(true)}
          title="Waar dit getal vandaan komt"
          className="-mx-1 cursor-pointer rounded-md px-1 font-medium text-2xl text-ink tabular-nums underline decoration-ink/20 decoration-dotted underline-offset-4 transition-colors hover:bg-ink/4 hover:decoration-arc"
        >
          {money(total)}
        </button>
        <span className="text-sm text-ink-2">laatste {range} dagen</span>
        <span
          className={cn(
            "ml-auto rounded-sm px-1.5 py-0.5 font-medium text-xs tabular-nums",
            change === null || change === 0
              ? "bg-band text-ink-2"
              : change > 0
              ? "bg-signal-green-bg text-signal-green"
              : "bg-signal-red-bg text-signal-red"
          )}
        >
          {change === null
            ? "Niets in de periode ervoor"
            : change === 0
            ? "Gelijk aan de periode ervoor"
            : `${change > 0 ? "+" : ""}${change}% t.o.v. de periode ervoor`}
        </span>
      </div>
      {breakdown(explaining, setExplaining)}
      <div className="h-[168px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={[...series]} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="home-rev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--arc)" stopOpacity={0.22} />
                <stop offset="100%" stopColor="var(--arc)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              tick={{ fill: "var(--ink-3)", fontSize: 12 }}
            />
            <YAxis hide domain={[0, "dataMax"]} />
            <Tooltip
              cursor={{ stroke: "var(--ink-4)", strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as (typeof series)[number] | undefined
                if (!active || !p) return null
                return (
                  <div className="rounded-lg bg-abyss px-2.5 py-1.5 text-mesh-ink shadow-primary">
                    <p className="text-xs text-mesh-ink-2">{range > 31 ? `Week van ${p.label}` : p.label}</p>
                    <p className="font-medium text-sm tabular-nums">
                      {money(p.value)} · {p.orders} {p.orders === 1 ? "bestelling" : "bestellingen"}
                    </p>
                  </div>
                )
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--arc)"
              strokeWidth={2}
              fill="url(#home-rev)"
              activeDot={{ r: 4, fill: "var(--arc)", stroke: "var(--paper)", strokeWidth: 2 }}
              animationDuration={700}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export const STAGES = [
  { id: "placed", label: "Geplaatst", tone: "var(--ink-4)" },
  { id: "paid", label: "Betaald", tone: "var(--sky)" },
  { id: "at_supplier", label: "Bij leverancier", tone: "var(--signal-amber)" },
  { id: "shipped", label: "Verzonden", tone: "var(--arc)" },
  { id: "delivered", label: "Bezorgd", tone: "var(--signal-green)" }
] as const

export type Stage = (typeof STAGES)[number]["id"]

/** Where the window's orders stand, by stage, and how many of them are delayed. */
export function OrdersView({ stages, delayed }: { stages: Record<Stage, number>; delayed: number }) {
  const still = useReducedMotion()
  const counts = STAGES.map((st) => ({ ...st, n: stages[st.id] }))
  const total = counts.reduce((s, c) => s + c.n, 0) || 1

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
        {counts.map((c) =>
          c.n > 0 ?
            (
              <motion.span
                key={c.id}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{ background: c.tone }}
                initial={false}
                animate={{ flexGrow: c.n }}
                transition={still ? { duration: 0 } : { type: "spring", stiffness: 180, damping: 26 }}
                title={`${c.label}: ${c.n}`}
              />
            ) :
            null
        )}
      </div>
      <ul className="flex flex-col">
        {counts.map((c, i) => (
          <li
            key={c.id}
            className={cn("flex h-8 items-center gap-2.5 rounded-md px-2 text-base", i % 2 === 0 && "bg-band")}
          >
            <span className="size-2 rounded-[3px]" style={{ background: c.tone }} />
            <span className="flex-1 text-ink-2">{c.label}</span>
            <span className="font-medium text-ink tabular-nums">{c.n}</span>
            <span className="w-10 text-right text-sm text-ink-3 tabular-nums">{Math.round((c.n / total) * 100)}%</span>
          </li>
        ))}
      </ul>
      {delayed > 0 ?
        (
          <Link
            to="/orders"
            className="glyph-host flex items-center gap-2 rounded-md bg-signal-red-bg px-2.5 py-2 font-medium text-sm text-signal-red transition-opacity hover:opacity-85"
          >
            <Glyph draw={false} icon={AlertTriangle} size={14} />
            {delayed} {delayed === 1 ? "bestelling is" : "bestellingen zijn"} vertraagd
          </Link>
        ) :
        null}
    </div>
  )
}

/** The suppliers holding the most delayed orders, then the most open ones. */
export function SuppliersView({ rows }: { rows: ReadonlyArray<{ name: string; open: number; delayed: number }> }) {
  const still = useReducedMotion()
  const max = Math.max(1, ...rows.map((r) => r.open))

  return (
    <ul className="flex flex-col gap-1">
      {rows.map((r) => (
        <li key={r.name} className="glyph-host flex flex-col gap-1 rounded-md px-2 py-1.5">
          <div className="flex items-center gap-2 text-base">
            <Glyph draw={false} icon={Truck} size={14} className={r.delayed > 0 ? "text-signal-red" : "text-ink-3"} />
            <span className="min-w-0 flex-1 truncate text-ink">{r.name}</span>
            {r.delayed > 0 ?
              <span className="font-medium text-sm text-signal-red tabular-nums">{r.delayed} vertraagd</span> :
              <span className="text-sm text-ink-3">Op tijd</span>}
            <span className="w-14 text-right text-sm text-ink-2 tabular-nums">{r.open} open</span>
          </div>
          <div className="flex h-1 overflow-hidden rounded-full bg-ink/6">
            <motion.span
              className="h-full bg-arc/35"
              initial={still ? false : { width: 0 }}
              animate={{ width: `${((r.open - r.delayed) / max) * 100}%` }}
              transition={{ type: "spring", stiffness: 160, damping: 26 }}
            />
            <motion.span
              className="h-full bg-signal-red"
              initial={still ? false : { width: 0 }}
              animate={{ width: `${(r.delayed / max) * 100}%` }}
              transition={{ type: "spring", stiffness: 160, damping: 26, delay: 0.08 }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

export const COLUMNS = [
  { id: "intake", label: "Nieuw" },
  { id: "in_progress", label: "Bezig" },
  { id: "awaiting_reply", label: "Wacht op antwoord" },
  { id: "done", label: "Klaar" }
] as const

export type Column = (typeof COLUMNS)[number]["id"]

/** The board's columns in one glance, and the open tickets of high priority. */
export function TicketsView({ columns, high }: { columns: Record<Column, number>; high: number }) {
  const still = useReducedMotion()
  const counts = COLUMNS.map((c) => ({ ...c, n: columns[c.id] }))
  const max = Math.max(1, ...counts.map((c) => c.n))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-[92px] items-end gap-2">
        {counts.map((c) => (
          <Link key={c.id} to="/tickets" className="group/col flex flex-1 flex-col items-center gap-1.5">
            <span className="font-medium text-sm text-ink tabular-nums">{c.n}</span>
            <motion.span
              className={cn(
                "w-full rounded-md transition-colors",
                c.id === "done" ? "bg-ink/10" : "bg-arc/80 group-hover/col:bg-arc"
              )}
              initial={still ? false : { height: 4 }}
              animate={{ height: Math.max(4, (c.n / max) * 56) }}
              transition={{ type: "spring", stiffness: 180, damping: 24 }}
            />
          </Link>
        ))}
      </div>
      <div className="flex gap-2">
        {counts.map((c) => (
          <span key={c.id} className="flex-1 truncate text-center text-xs text-ink-3">
            {c.label}
          </span>
        ))}
      </div>
      {high > 0 ?
        (
          <p className="glyph-host flex items-center gap-2 rounded-md bg-band px-2.5 py-2 text-sm text-ink-2">
            <Glyph draw={false} icon={AlertTriangle} size={14} className="text-signal-red" />
            {high} {high === 1 ? "ticket" : "tickets"} met hoge prioriteit nog open
          </p>
        ) :
        null}
    </div>
  )
}

export type LowStockRow = {
  id: string
  product: string
  productId: string
  variant: string
  sku: string | null
  left: number
}

/** The variants nearly gone, the emptiest first. */
export function StockView({ rows }: { rows: ReadonlyArray<LowStockRow> }) {
  if (rows.length === 0) return <p className="px-2 text-sm text-ink-3">Er is niets bijna op.</p>
  return (
    <ul className="flex flex-col">
      {rows.map((r, i) => (
        <li key={r.id}>
          <Link
            to="/products/$productId"
            params={{ productId: r.productId }}
            className={cn(
              "glyph-host flex h-10 items-center gap-2.5 rounded-md px-2 transition-colors hover:bg-ink/6",
              i % 2 === 0 && "bg-band"
            )}
          >
            <Glyph draw={false} icon={Box} size={15} className={r.left === 0 ? "text-signal-red" : "text-ink-3"} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-base text-ink">{r.product}</span>
              <span className="truncate text-xs text-ink-3">
                {r.sku === null ? r.variant : `${r.variant} · ${r.sku}`}
              </span>
            </span>
            <span
              className={cn(
                "rounded-sm px-1.5 py-0.5 font-medium text-xs tabular-nums",
                r.left === 0 ? "bg-signal-red-bg text-signal-red" : "bg-signal-amber-bg text-signal-amber"
              )}
            >
              {r.left === 0 ? "Uitverkocht" : `nog ${r.left}`}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const
export const PRIORITY_LABEL = { high: "Hoog", medium: "Gemiddeld", low: "Laag" } as const
export const PRIORITY_TONE = {
  high: "bg-signal-red-bg text-signal-red",
  medium: "bg-signal-amber-bg text-signal-amber",
  low: "bg-band text-ink-2"
} as const

export type MyTicketRow = { id: string; number: string; title: string; priority: keyof typeof PRIORITY_LABEL }

/** The open tickets assigned to the person, the most urgent first: five, and how many more. */
export function MyTicketsView({ rows, total }: { rows: ReadonlyArray<MyTicketRow>; total: number }) {
  if (total === 0) return <p className="px-2 text-sm text-ink-3">Er is niets aan jou toegewezen.</p>
  return (
    <ul className="flex flex-col">
      {rows.map((t, i) => (
        <li key={t.id}>
          <Link
            to="/tickets"
            search={{ ticket: t.id } as never}
            className={cn(
              "flex h-10 items-center gap-2.5 rounded-md px-2 transition-colors hover:bg-ink/6",
              i % 2 === 0 && "bg-band"
            )}
          >
            <span className="w-[68px] shrink-0 whitespace-nowrap text-sm text-ink-3 tabular-nums">{t.number}</span>
            <span className="min-w-0 flex-1 truncate text-base text-ink">{t.title}</span>
            <span className={cn("rounded-sm px-1.5 py-0.5 font-medium text-xs", PRIORITY_TONE[t.priority])}>
              {PRIORITY_LABEL[t.priority]}
            </span>
          </Link>
        </li>
      ))}
      {total > rows.length
        ? <li className="px-2 pt-1.5 text-sm text-ink-3">{total - rows.length} meer op het bord</li>
        : null}
    </ul>
  )
}

export const PRESENCE = {
  online: { dot: "bg-signal-green", label: "Online", rank: 0 },
  away: { dot: "bg-signal-amber", label: "Afwezig", rank: 1 },
  offline: { dot: "bg-ink-4", label: "Offline", rank: 2 }
} as const

export type TeamMate = { id: string; name: string; presence: keyof typeof PRESENCE; doing?: string | undefined }

/** Who is here and what they are on; `message` when the chats are there to reach them in. */
export function TeamView({ team: people, message }: { team: ReadonlyArray<TeamMate>; message: boolean }) {
  const team = useMemo(
    () =>
      people.map((m) => ({ ...m, presence: PRESENCE[m.presence] })).toSorted((a, b) =>
        a.presence.rank - b.presence.rank
      ),
    [people]
  )
  const online = team.filter((m) => m.presence.rank === 0).length
  return (
    <div className="flex flex-col gap-2">
      <p className="px-2 text-sm text-ink-3">
        {online} van {team.length} online
      </p>
      <ul className="flex flex-col">
        {team.slice(0, 6).map((m, i) => (
          <li
            key={m.id}
            className={cn("group/member flex h-11 items-center gap-2.5 rounded-md px-2", i % 2 === 0 && "bg-band")}
          >
            <span
              className="relative flex size-7 shrink-0 items-center justify-center rounded-full font-medium text-xs"
              style={personStyle(m.id)}
            >
              {initials(m.name)}
              <span
                className={cn("absolute right-0 bottom-0 size-2.5 rounded-full ring-2 ring-paper", m.presence.dot)}
              />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-base text-ink">{m.name}</span>
              <span className="truncate text-xs text-ink-3">{m.doing ?? m.presence.label}</span>
            </span>
            {message ?
              (
                <Link
                  to={"/chats" as string}
                  search={{ id: `conv_dm_${m.id}` } as never}
                  aria-label={`Bericht aan ${m.name}`}
                  title={`Bericht aan ${m.name}`}
                  className="flex size-7 items-center justify-center rounded-md text-ink-3 opacity-0 transition-opacity hover:bg-ink/6 hover:text-ink focus-visible:opacity-100 group-hover/member:opacity-100"
                >
                  <MessagesSquare className="size-3.5" strokeWidth={1.75} />
                </Link>
              ) :
              null}
          </li>
        ))}
      </ul>
      {team.length > 6 ?
        (
          <Link
            to="/settings/team"
            className="w-fit rounded-md px-2 py-1 text-sm text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink"
          >
            Nog {team.length - 6} in je team
          </Link>
        ) :
        null}
    </div>
  )
}
