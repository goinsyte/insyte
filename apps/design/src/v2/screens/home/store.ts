import { useSyncExternalStore } from "react"
import { ARRIVALS, TODO_SEEDS } from "../../fixtures/home.ts"
import { dayAfter } from "./dates.ts"

/*
 * Start's own state for the visit: the board the operator arranged (kept in this browser), their
 * list, what they ticked or moved on Mijn werk, what they settled on the queue, which version of a
 * proposal is drawn, and the board's clock. A proposal's yes or no is the demo store's (`demo.ts`),
 * because the agent's page and the counts read it too.
 */

/** Every card the board can hold, in the order "Kaart toevoegen" offers them. */
export const WIDGET_IDS = [
  "queue",
  "gedaan",
  "elders",
  "agents",
  "team",
  "setup",
  "todo",
  "revenue",
  "orders",
  "chargebacks",
  "suppliers",
  "tickets",
  "stock",
  "automations",
  "mytickets",
  "today",
  "live",
  "mentions",
  "recent",
  "magnus",
  "customeragent",
  "returns",
  "bestsellers",
  "bookmarks",
  "countries",
  "chats"
] as const

export type WidgetId = (typeof WIDGET_IDS)[number]

/** How many columns a card takes: one, two, or the whole row however many the board has. */
export type WidgetSize = 1 | 2 | 3

export type Placed = { readonly id: WidgetId; readonly size: WidgetSize }

/** The board a new operator gets, and what "Standaardindeling" puts back. */
export const DEFAULT_BOARD: ReadonlyArray<Placed> = [
  { id: "queue", size: 2 },
  { id: "gedaan", size: 1 },
  { id: "elders", size: 1 },
  { id: "revenue", size: 1 },
  { id: "today", size: 1 },
  { id: "agents", size: 1 },
  { id: "team", size: 1 }
]

type Todo = { readonly id: string; readonly text: string; readonly due?: string; readonly done: boolean }

/** A queue task you settled: done, or moved to tomorrow. */
export type Settled = "afgehandeld" | "morgen"

type HomeState = {
  readonly board: ReadonlyArray<Placed>
  readonly todos: ReadonlyArray<Todo>
  /** Mijn werk items ticked this visit, with the demo clock they were ticked at. */
  readonly done: Readonly<Record<string, string>>
  /** Mijn werk items moved to another day, by item id. */
  readonly snoozed: Readonly<Record<string, string>>
  /** Queue tasks settled this visit. */
  readonly settled: Readonly<Record<string, Settled>>
  /** How many times a proposal was drawn again, by proposal id. */
  readonly versions: Readonly<Record<string, number>>
  /** Setup steps the operator ticked. */
  readonly ticked: ReadonlyArray<string>
  /** The board's clock: when it last read the workspace (ms), and whether it does so by itself. */
  readonly refreshedAt: number
  readonly refreshing: boolean
  readonly auto: boolean
  /** How many of `ARRIVALS` the refreshes brought in. */
  readonly arrived: number
}

const KEY = "insyte.v2.start.board"
const isId = (v: unknown): v is WidgetId => WIDGET_IDS.some((id) => id === v)

function readBoard(): ReadonlyArray<Placed> {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw === null) return DEFAULT_BOARD
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return DEFAULT_BOARD
    return parsed.flatMap((p: { id?: unknown; size?: unknown }) =>
      isId(p.id) && (p.size === 1 || p.size === 2 || p.size === 3) ? [{ id: p.id, size: p.size }] : []
    )
  } catch {
    return DEFAULT_BOARD
  }
}

function writeBoard(board: ReadonlyArray<Placed>) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(board))
  } catch {
    // A private window or blocked storage: the board lasts for the visit.
  }
}

let state: HomeState = {
  board: readBoard(),
  todos: TODO_SEEDS.map((t) => ({
    id: t.id,
    text: t.text,
    done: false,
    ...(t.day === undefined ? {} : { due: dayAfter(t.day) })
  })),
  done: {},
  snoozed: {},
  settled: {},
  versions: {},
  ticked: [],
  refreshedAt: Date.now(),
  refreshing: false,
  auto: false,
  arrived: 0
}
const listeners = new Set<() => void>()

function set(next: (s: HomeState) => HomeState) {
  const before = state
  state = next(state)
  if (state.board !== before.board) writeBoard(state.board)
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useHome = () => useSyncExternalStore(subscribe, () => state)

/* ── the board ─────────────────────────────────────────────────────────────────────────────────── */

export const setBoard = (board: ReadonlyArray<Placed>) => set((s) => ({ ...s, board }))
export const getBoard = () => state.board

export function addWidget(id: WidgetId, size: WidgetSize) {
  set((s) => (s.board.some((p) => p.id === id) ? s : { ...s, board: [...s.board, { id, size }] }))
}

export const removeWidget = (id: WidgetId) => set((s) => ({ ...s, board: s.board.filter((p) => p.id !== id) }))

export const resizeWidget = (id: WidgetId, size: WidgetSize) =>
  set((s) => ({ ...s, board: s.board.map((p) => (p.id === id ? { ...p, size } : p)) }))

/** Moves the card at `from` to `to` in the board's order. */
export function moveWidget(from: number, to: number) {
  set((s) => {
    const board = [...s.board]
    const [card] = board.splice(from, 1)
    if (card === undefined || to < 0 || to > board.length) return s
    board.splice(to, 0, card)
    return { ...s, board }
  })
}

/* ── your list and Mijn werk ───────────────────────────────────────────────────────────────────── */

let todoSeq = 0

export function addTodo(text: string, due?: string) {
  todoSeq += 1
  const todo: Todo = { id: `t-new-${todoSeq}`, text, done: false, ...(due === undefined ? {} : { due }) }
  set((s) => ({ ...s, todos: [todo, ...s.todos] }))
  return todo.id
}

export const toggleTodo = (id: string) =>
  set((s) => ({ ...s, todos: s.todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) }))

/** Takes a to-do off the list and gives back what it was and where, for the undo. */
export function removeTodo(id: string): { readonly todo: Todo; readonly at: number } | undefined {
  const at = state.todos.findIndex((t) => t.id === id)
  const todo = state.todos[at]
  if (todo === undefined) return undefined
  set((s) => ({ ...s, todos: s.todos.filter((t) => t.id !== id) }))
  return { todo, at }
}

export function restoreTodo({ todo, at }: { readonly todo: Todo; readonly at: number }) {
  set((s) => {
    const todos = [...s.todos]
    todos.splice(at, 0, todo)
    return { ...s, todos }
  })
}

export const setDone = (id: string, at: string | null) =>
  set((s) => {
    const done = Object.fromEntries(Object.entries(s.done).filter(([key]) => key !== id))
    return { ...s, done: at === null ? done : { ...done, [id]: at } }
  })

export const snooze = (id: string, day: string | null) =>
  set((s) => {
    const snoozed = Object.fromEntries(Object.entries(s.snoozed).filter(([key]) => key !== id))
    return { ...s, snoozed: day === null ? snoozed : { ...snoozed, [id]: day } }
  })

/* ── the queue ─────────────────────────────────────────────────────────────────────────────────── */

export const settle = (id: string, how: Settled | null) =>
  set((s) => {
    const settled = Object.fromEntries(Object.entries(s.settled).filter(([key]) => key !== id))
    return { ...s, settled: how === null ? settled : { ...settled, [id]: how } }
  })

export const redraw = (id: string, version: number) =>
  set((s) => ({ ...s, versions: { ...s.versions, [id]: version } }))

/* ── setup ─────────────────────────────────────────────────────────────────────────────────────── */

export const tickSetup = (id: string, on: boolean) =>
  set((s) => ({ ...s, ticked: on ? [...s.ticked.filter((t) => t !== id), id] : s.ticked.filter((t) => t !== id) }))

/* ── the clock ─────────────────────────────────────────────────────────────────────────────────── */

/** Reads the workspace again: a moment of "Bijwerken", then the next order that came in. */
export function refresh() {
  if (state.refreshing) return
  set((s) => ({ ...s, refreshing: true }))
  window.setTimeout(() => {
    set((s) => ({
      ...s,
      refreshing: false,
      refreshedAt: Date.now(),
      arrived: Math.min(ARRIVALS.length, s.arrived + 1)
    }))
  }, 650)
}

export const setAuto = (auto: boolean) => set((s) => ({ ...s, auto }))
