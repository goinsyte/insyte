import { Forbidden, Invalid, NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { CostsList } from "@insyte/modules/costs/domain/Costs"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"

/*
 * Kosten (M13 step 5): the lines and the months' figures, the five months up to the current one, primed by the route's
 * loader and carried in the document. Every cost command names `COSTS`; an order or a store changing names it too,
 * since revenue and orders are what the shares and the per-order amounts are worked out from.
 */

export const COSTS = ["costs"] as const

export const costsAtom = Atom.serializable(
  ConsoleClient.query("Costs.list", {}, { reactivityKeys: COSTS }),
  {
    key: "costs",
    schema: AsyncResult.Schema({
      success: CostsList,
      error: Schema.Union([Forbidden, Invalid, NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])
    }),
    skipInitialRun: true
  }
)

export const costWrites = {
  create: ConsoleClient.mutation("Costs.create"),
  update: ConsoleClient.mutation("Costs.update"),
  setAmount: ConsoleClient.mutation("Costs.setAmount"),
  readFromSource: ConsoleClient.mutation("Costs.readFromSource"),
  remove: ConsoleClient.mutation("Costs.remove"),
  undo: ConsoleClient.mutation("Shared.undo")
} as const
