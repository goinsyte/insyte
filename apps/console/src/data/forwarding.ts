import { Forbidden, NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { LegList, LegRow } from "@insyte/modules/forwarding/domain/Forwarding"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"
import { ORDERS } from "./orders.ts"

/*
 * Doorsturen (M8.2): every open leg, primed by the orders route's loader on a forwarding view, and an order's legs for its
 * processing tracker. A forwarding command names `FORWARDING` and `ORDERS` (confirming can put an order at its supplier).
 */

export const FORWARDING = ["forwarding"] as const

const errors = Schema.Union([Forbidden, NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])

export const forwardingAtom = Atom.serializable(
  ConsoleClient.query("Forwarding.list", {}, { reactivityKeys: [...FORWARDING, ...ORDERS] }),
  { key: "forwarding", schema: AsyncResult.Schema({ success: LegList, error: errors }), skipInitialRun: true }
)

export const orderLegsAtom = Atom.family((orderId: string) =>
  Atom.serializable(
    ConsoleClient.query("Forwarding.forOrder", { orderId }, { reactivityKeys: [...FORWARDING, ...ORDERS] }),
    {
      key: `order-legs:${orderId}`,
      schema: AsyncResult.Schema({ success: Schema.Array(LegRow), error: errors }),
      skipInitialRun: true
    }
  )
)

export const forwardingWrites = {
  forward: ConsoleClient.mutation("Forwarding.forward"),
  markConfirmed: ConsoleClient.mutation("Forwarding.markConfirmed"),
  reroute: ConsoleClient.mutation("Forwarding.reroute"),
  cancel: ConsoleClient.mutation("Forwarding.cancel"),
  undo: ConsoleClient.mutation("Shared.undo")
} as const
