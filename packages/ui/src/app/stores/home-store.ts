import { create } from "zustand"
import { persist } from "zustand/middleware"
import { byScenario } from "../../data-source"
import { addDays, dayKey } from "../lib/home/dates"
import type { Currency } from "../lib/types/domain"

/*
 * The home board's own state: which widgets are on it, in what order, how wide, on which ground,
 * where they sit on the free grid, the operator's to-do list, and the setup tasks they ticked.
 *
 * Unlike the workspace store this one persists. The records are a demo and start fresh on every
 * load; how someone arranged their own board, and what they wrote on their own list, is theirs.
 *
 * Two engines read the same list. Masonry packs the widgets in their order at their natural
 * height; the grid places each one at an x/y/w/h the operator dragged and resized it to. Order,
 * width and tone are shared, so switching engines never loses a widget.
 */

export type WidgetId =
  | "queue"
  | "setup"
  | "todo"
  | "revenue"
  | "orders"
  | "chargebacks"
  | "suppliers"
  | "tickets"
  | "stock"
  | "automations"
  | "mytickets"
  | "team"
  | "today"
  | "live"
  | "mentions"
  | "recent"
  | "insyte"
  | "bestsellers"
  | "bookmarks"
  | "countries"
  | "chats"
  | "customeragent"
  | "returns"

/** Columns a widget spans in masonry: one, two, or the whole row. */
export type WidgetSize = 1 | 2 | 3
/** The ground a widget sits on. `mesh` is the brand's Abyss glow and belongs to the queue. */
export type WidgetTone = "paper" | "tint" | "mist" | "mesh"
export type PlacedWidget = { id: WidgetId; size: WidgetSize; tone: WidgetTone }
export type GridBox = { i: WidgetId; x: number; y: number; w: number; h: number }
export type BoardEngine = "masonry" | "grid"
/** `due` is a day, YYYY-MM-DD, when the operator gave one ("morgen", "vrijdag"); `doneAt` is when it was ticked. */
export type Todo = { id: string; text: string; done: boolean; due?: string; doneAt?: number }
/** The four ways of reading the day: the board, your own list, the clock, and what everyone did. */
export type HomeView = "overzicht" | "werk" | "agenda" | "activiteit"

/* The first screen is the queue and what the day holds beside it — the clock, the orders arriving,
   who asked for you, what you had open, and what Insyte already did — then the slower widgets. The
   business widgets of the earlier board are one click away in "Kaart toevoegen". */
export const DEFAULT_LAYOUT: PlacedWidget[] = [
  { id: "queue", size: 2, tone: "mesh" },
  { id: "today", size: 1, tone: "paper" },
  { id: "mentions", size: 1, tone: "paper" },
  { id: "live", size: 1, tone: "paper" },
  { id: "insyte", size: 1, tone: "tint" },
  { id: "recent", size: 1, tone: "paper" },
  { id: "bestsellers", size: 1, tone: "paper" },
  { id: "bookmarks", size: 1, tone: "paper" },
  { id: "team", size: 1, tone: "paper" },
  { id: "countries", size: 1, tone: "paper" },
  { id: "chats", size: 1, tone: "paper" },
  { id: "setup", size: 1, tone: "paper" }
]

/* The grid's 12 columns at 28px rows. Written out rather than derived so the first view of the grid
   engine is a composed board, not whatever a compactor makes of the masonry order. */
export const DEFAULT_GRID: GridBox[] = [
  { i: "queue", x: 0, y: 0, w: 8, h: 13 },
  { i: "today", x: 8, y: 0, w: 4, h: 13 },
  { i: "mentions", x: 0, y: 13, w: 4, h: 10 },
  { i: "live", x: 4, y: 13, w: 4, h: 10 },
  { i: "insyte", x: 8, y: 13, w: 4, h: 10 },
  { i: "recent", x: 0, y: 23, w: 4, h: 9 },
  { i: "bestsellers", x: 4, y: 23, w: 4, h: 9 },
  { i: "bookmarks", x: 8, y: 23, w: 4, h: 9 },
  { i: "team", x: 0, y: 32, w: 4, h: 9 },
  { i: "countries", x: 4, y: 32, w: 4, h: 9 },
  { i: "chats", x: 8, y: 32, w: 4, h: 9 },
  { i: "setup", x: 0, y: 41, w: 4, h: 12 }
]

/** The window the dated widgets read, in days, and the currency every money figure is said in. */
export type BoardRange = 7 | 30 | 90

/** Where a widget lands on the grid when it is added, sized from its masonry width. */
export function gridBoxFor(id: WidgetId, size: WidgetSize, grid: GridBox[]): GridBox {
  const bottom = grid.reduce((m, b) => Math.max(m, b.y + b.h), 0)
  return { i: id, x: 0, y: bottom, w: size * 4, h: 9 }
}

/* Dated from today, so the list always reads as a real week: one slipped, one today, one for later. */
const seedTodos = (): Todo[] => [
  { id: "t1", text: "Linyi Logistics om de nieuwe overdrachtsdatum vragen", done: false, due: addDays(Date.now(), -1) },
  { id: "t2", text: "Het Klarna-bewijspakket controleren voordat het verstuurd wordt", done: false, due: dayKey() },
  { id: "t4", text: "Winterprijzen van de Cascade pufferjas herzien", done: false, due: addDays(Date.now(), 3) },
  { id: "t5", text: "Nieuwe productfoto's bij DPC Apparel opvragen", done: false },
  { id: "t3", text: "De terugbetalingen van vorige week nakijken", done: true, doneAt: Date.now() - 50 * 60_000 }
]

/** A board's arrangement: what is on it, in order, and where each sits on the grid. */
export type BoardLayout = { widgets: PlacedWidget[]; grid: GridBox[] }
type Snapshot = BoardLayout

export type HomeState = {
  /** The tab last read, for an address without `?view=`. */
  view: HomeView
  setView: (v: HomeView) => void
  /** Whether the board refreshes itself and the live orders keep arriving. */
  autoRefresh: boolean
  setAutoRefresh: (on: boolean) => void
  /** On the first day the home is a first-run page; the operator can ask for the board anyway. */
  boardOnFirstDay: boolean
  setBoardOnFirstDay: (on: boolean) => void
  agendaSpan: "day" | "week"
  setAgendaSpan: (s: "day" | "week") => void
  /** My work: items moved to another day, by item id, to the day (YYYY-MM-DD). */
  snoozed: Record<string, string>
  /** My work: items ticked that are not the operator's own to-dos, by id, with when. */
  doneWork: Record<string, number>
  snoozeWork: (id: string, day: string) => void
  unsnoozeWork: (id: string) => void
  setWorkDone: (id: string, done: boolean) => void
  engine: BoardEngine
  range: BoardRange
  currency: Currency
  setRange: (r: BoardRange) => void
  setCurrency: (c: Currency) => void
  widgets: PlacedWidget[]
  grid: GridBox[]
  todos: Todo[]
  /** Setup tasks the operator ticked themselves; the rest are read from the workspace. */
  ticked: string[]
  setEngine: (engine: BoardEngine) => void
  move: (from: number, to: number) => void
  setSize: (id: WidgetId, size: WidgetSize) => void
  setTone: (id: WidgetId, tone: WidgetTone) => void
  setGrid: (grid: GridBox[]) => void
  remove: (id: WidgetId) => void
  add: (id: WidgetId, size: WidgetSize, tone: WidgetTone) => void
  snapshot: () => Snapshot
  restore: (s: Snapshot) => void
  reset: () => void
  addTodo: (text: string, due?: string) => void
  toggleTodo: (id: string) => void
  removeTodo: (id: string) => Todo | undefined
  restoreTodo: (todo: Todo) => void
  toggleTask: (id: string) => void
}

export const useHome = create<HomeState>()(
  persist(
    (set, get) => ({
      view: "overzicht",
      setView: (view) => set({ view }),
      autoRefresh: true,
      setAutoRefresh: (autoRefresh) => set({ autoRefresh }),
      boardOnFirstDay: false,
      setBoardOnFirstDay: (boardOnFirstDay) => set({ boardOnFirstDay }),
      agendaSpan: "day",
      setAgendaSpan: (agendaSpan) => set({ agendaSpan }),
      snoozed: {},
      doneWork: {},
      snoozeWork: (id, day) => set((s) => ({ snoozed: { ...s.snoozed, [id]: day } })),
      unsnoozeWork: (id) =>
        set((s) => {
          const { [id]: _gone, ...rest } = s.snoozed
          return { snoozed: rest }
        }),
      setWorkDone: (id, done) =>
        set((s) => {
          const { [id]: _was, ...rest } = s.doneWork
          return { doneWork: done ? { ...rest, [id]: Date.now() } : rest }
        }),
      engine: "masonry",
      range: 30,
      currency: "EUR",
      setRange: (range) => set({ range }),
      setCurrency: (currency) => set({ currency }),
      widgets: DEFAULT_LAYOUT,
      grid: DEFAULT_GRID,
      // The console installs no data source (ADR-0034) and keeps its to-dos in `Todos.*`: nothing to seed there.
      todos: typeof byScenario === "function" ? byScenario({ empty: [], settled: seedTodos() }) : [],
      ticked: [],
      setEngine: (engine) => set({ engine }),
      move: (from, to) =>
        set((s) => {
          const next = [...s.widgets]
          const [w] = next.splice(from, 1)
          if (w) next.splice(to, 0, w)
          return { widgets: next }
        }),
      setSize: (id, size) => set((s) => ({ widgets: s.widgets.map((w) => (w.id === id ? { ...w, size } : w)) })),
      setTone: (id, tone) => set((s) => ({ widgets: s.widgets.map((w) => (w.id === id ? { ...w, tone } : w)) })),
      setGrid: (grid) => set({ grid }),
      remove: (id) =>
        set((s) => ({ widgets: s.widgets.filter((w) => w.id !== id), grid: s.grid.filter((b) => b.i !== id) })),
      add: (id, size, tone) =>
        set((s) =>
          s.widgets.some((w) => w.id === id)
            ? s
            : { widgets: [...s.widgets, { id, size, tone }], grid: [...s.grid, gridBoxFor(id, size, s.grid)] }
        ),
      snapshot: () => ({ widgets: get().widgets, grid: get().grid }),
      restore: ({ widgets, grid }) => set({ widgets, grid }),
      reset: () => set({ widgets: DEFAULT_LAYOUT, grid: DEFAULT_GRID }),
      addTodo: (text, due) => set((s) => ({ todos: [{ id: `t${Date.now()}`, text, done: false, due }, ...s.todos] })),
      toggleTodo: (id) =>
        set((s) => ({
          todos: s.todos.map((
            t
          ) => (t.id === id ? { ...t, done: !t.done, doneAt: t.done ? undefined : Date.now() } : t))
        })),
      removeTodo: (id) => {
        const todo = get().todos.find((t) => t.id === id)
        set((s) => ({ todos: s.todos.filter((t) => t.id !== id) }))
        return todo
      },
      restoreTodo: (todo) => set((s) => ({ todos: [todo, ...s.todos.filter((t) => t.id !== todo.id)] })),
      toggleTask: (id) =>
        set((s) => ({ ticked: s.ticked.includes(id) ? s.ticked.filter((t) => t !== id) : [...s.ticked, id] }))
    }),
    {
      name: "insyte:home:v1",
      version: 6,
      // Each step brings a board up one version, and they run in order, so any old board arrives current.
      migrate: (old, version) => {
        let s = old as Partial<HomeState> & { widgets?: Array<{ id: WidgetId; size: WidgetSize; tone?: WidgetTone }> }
        const tone = (id: WidgetId) => DEFAULT_LAYOUT.find((d) => d.id === id)?.tone ?? "paper"
        if (version < 2) {
          // Version 1 had no queue widget, no tones and no grid; the queue goes back at the head.
          const kept = (s.widgets ?? []).filter((w) => w.id !== "queue")
          s = {
            ...s,
            engine: "masonry",
            widgets: [{ id: "queue", size: 2, tone: "mesh" }, ...kept.map((w) => ({ ...w, tone: tone(w.id) }))],
            grid: DEFAULT_GRID
          }
        }
        if (version < 3) {
          // Version 2 shipped four grounds at once, which read as busy: back to white and one light blue.
          s = { ...s, widgets: (s.widgets ?? []).map((w) => ({ ...w, tone: tone(w.id) })) }
        }
        if (version < 4) {
          // Version 4 added My tickets and Team online; an existing board gets them at its foot.
          const have = new Set((s.widgets ?? []).map((w) => w.id))
          const added = DEFAULT_LAYOUT.filter((d) => (d.id === "mytickets" || d.id === "team") && !have.has(d.id))
          const boxes = DEFAULT_GRID.filter((g) => added.some((x) => x.id === g.i))
          s = { ...s, widgets: [...(s.widgets ?? []), ...added], grid: [...(s.grid ?? []), ...boxes] }
        }
        // Version 5 is the console in Dutch: the seeded to-dos were written in English.
        if (version < 5) s = { ...s, todos: seedTodos() }
        // Version 6 is the home with views: a new first screen, so every board starts from it once.
        if (version < 6) {
          const seeded = (s.todos ?? []).every((t) => t.id === "t1" || t.id === "t2" || t.id === "t3")
          s = {
            ...s,
            widgets: DEFAULT_LAYOUT,
            grid: DEFAULT_GRID,
            view: "overzicht",
            autoRefresh: true,
            todos: seeded ? seedTodos() : s.todos
          }
        }
        return s as HomeState
      }
    }
  )
)
