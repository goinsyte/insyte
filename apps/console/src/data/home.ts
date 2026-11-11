import { NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { type BoardRange, HomeBrief, HomeWidgets, type WidgetId } from "@insyte/modules/home/domain/Home"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"
import { QUEUE } from "./queue.ts"

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
