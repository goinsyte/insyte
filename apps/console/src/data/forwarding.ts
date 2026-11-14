import { Forbidden, NotFound, NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { LegList, LegRow } from "@insyte/modules/forwarding/domain/Forwarding"
import { OrderTracking } from "@insyte/modules/tracking/domain/Tracking"
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

/** An order's parcels and where they are (M8.4), for the tracker's Verzonden and Bezorgd. */
export const orderTrackingAtom = Atom.family((orderId: string) =>
  Atom.serializable(
    ConsoleClient.query("Orders.tracking", { orderId }, { reactivityKeys: [...FORWARDING, ...ORDERS] }),
    {
      key: `order-tracking:${orderId}`,
      schema: AsyncResult.Schema({ success: OrderTracking, error: Schema.Union([NotFound, errors]) }),
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

/** "Klant mailen" (M8 10.2a): Insyte's draft for one leg's shopper, read when its dialog opens. */
export const customerDraftAtom = Atom.family((legId: string) =>
  ConsoleClient.query("Forwarding.customerDraft", { id: legId }, { reactivityKeys: [...FORWARDING, ...ORDERS] })
)
