import { NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { type BoardRange, HomeBrief, HomeWidgets, type WidgetId } from "@insyte/modules/home/domain/Home"
import type { ActivitySource, AgendaSpan } from "@insyte/modules/home/domain/Lists"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"
import { QUEUE } from "./queue.ts"
import { SUPPLIERS } from "./suppliers.ts"
import { TEAM } from "./team.ts"
import { TICKETS } from "./tickets.ts"

/*
 * Start's figures (M10.3): the hero's brief, and the board's widgets with the pulse in one batched read for the cards
 * on the person's board and their window, both primed by `/dashboard`'s loader. The revenue breakdown is read when it
 * is opened; the to-do card is the person's own list. Every change to an order, ticket, return, product or queue row names `HOME` (`realtime.ts`).
 */

export const HOME = ["home"] as const

const errors = Schema.Union([NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])

export const briefAtom = Atom.serializable(
  ConsoleClient.query("Home.brief", undefined, { reactivityKeys: [...HOME, ...QUEUE] }),
  { key: "home.brief", schema: AsyncResult.Schema({ success: HomeBrief, error: errors }), skipInitialRun: true }
)

/** One read's key: the window, and the cards asked for in a fixed order, so the same board is the same read. */
export const widgetsKey = (range: BoardRange, ids: ReadonlyArray<WidgetId>) => `${range}:${ids.toSorted().join(",")}`

export const widgetsAtom = Atom.family((key: string) => {
  const [range, list] = key.split(":")
  const ids = (list ?? "").split(",").filter((id) => id !== "") as Array<WidgetId>
  return Atom.serializable(
    ConsoleClient.query("Home.widgets", { range: Number(range) as BoardRange, ids }, { reactivityKeys: HOME }),
    {
      key: `home.widgets:${key}`,
      schema: AsyncResult.Schema({ success: HomeWidgets, error: errors }),
      skipInitialRun: true
    }
  )
})

export const breakdownAtom = Atom.family((range: BoardRange) =>
  ConsoleClient.query("Home.revenueBreakdown", { range }, { reactivityKeys: HOME })
)

/** The person's own to-do card (`Todos.*`, M4.2): each write answers the list and names `TODOS`. */
export const TODOS = ["todos"] as const

export const todosAtom = ConsoleClient.query("Todos.list", undefined, { reactivityKeys: TODOS })

export const todoWrites = {
  add: ConsoleClient.mutation("Todos.add"),
  toggle: ConsoleClient.mutation("Todos.toggle"),
  remove: ConsoleClient.mutation("Todos.remove"),
  restore: ConsoleClient.mutation("Todos.restore")
} as const

/*
 * Mijn werk, the agenda and the activity feed (M10.3b), read when their view or card is on screen. They list to-dos,
 * queue rows, tickets, suppliers and invitations, so a change to any of those reads them again.
 */
const LISTS = [...HOME, ...TODOS, ...QUEUE, ...TICKETS, ...SUPPLIERS, ...TEAM]

export const workAtom = ConsoleClient.query("Home.work", undefined, { reactivityKeys: LISTS })

/** One agenda read: its first day and its span, `2026-11-11:week`. */
export const agendaKey = (from: string, span: AgendaSpan) => `${from}:${span}`

export const agendaAtom = Atom.family((key: string) => {
  const [from = "", span] = key.split(":")
  return ConsoleClient.query("Home.agenda", { from, span: span === "week" ? "week" : "day" }, {
    reactivityKeys: LISTS
  })
})

/** The feed under its filters, as many rows as asked for (at most 200, `ActivityInput`). */
export interface ActivityQuery {
  readonly who: string | undefined
  readonly source: ActivitySource | undefined
  readonly limit: number
}

/** One read of the feed: `who|source|limit`, empty where a filter is unset. */
export const activityKey = (q: ActivityQuery) => `${q.who ?? ""}|${q.source ?? ""}|${q.limit}`

export const activityAtom = Atom.family((key: string) => {
  const [who = "", source = "", limit = "60"] = key.split("|")
  return ConsoleClient.query("Home.activity", {
    ...(who === "" ? {} : { who }),
    ...(source === "" ? {} : { source: source as ActivitySource }),
    limit: Number(limit)
  }, { reactivityKeys: LISTS })
})
