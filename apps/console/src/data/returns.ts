import { Forbidden, NotFound, NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { ReturnDetail, ReturnList, ReturnSettingsDoc } from "@insyte/modules/returns/domain/Returns"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"
import { ORDERS } from "./orders.ts"

/*
 * Retouren (M9.1): the queue, primed by the route's loader; one return when it opens; the returns policy; an order's
 * returns and what it can still send back; a customer's returns. A returns command names `RETURNS`; settling with a
 * refund names `ORDERS` too, since the order's refunds and balance change with it.
 */

export const RETURNS = ["returns"] as const
export const RETURN_SETTINGS = ["return-settings"] as const

const errors = Schema.Union([Forbidden, NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])

export const returnsAtom = Atom.serializable(
  ConsoleClient.query("Returns.list", {}, { reactivityKeys: RETURNS }),
  { key: "returns", schema: AsyncResult.Schema({ success: ReturnList, error: errors }), skipInitialRun: true }
)

export const returnAtom = Atom.family((id: string) =>
  Atom.serializable(
    ConsoleClient.query("Returns.get", { id }, { reactivityKeys: [...RETURNS, ...RETURN_SETTINGS] }),
    {
      key: `return:${id}`,
      schema: AsyncResult.Schema({ success: ReturnDetail, error: Schema.Union([NotFound, errors]) }),
      skipInitialRun: true
    }
  )
)

export const returnSettingsAtom = Atom.serializable(
  ConsoleClient.query("Returns.settings", undefined, { reactivityKeys: RETURN_SETTINGS }),
  {
    key: "return-settings",
    schema: AsyncResult.Schema({ success: ReturnSettingsDoc, error: errors }),
    skipInitialRun: true
  }
)

/** An order's returns, in its sidebar. */
export const orderReturnsAtom = Atom.family((orderId: string) =>
  ConsoleClient.query("Returns.list", { orderId }, { reactivityKeys: RETURNS })
)

/** A customer's returns, in their sidebar. */
export const customerReturnsAtom = Atom.family((customerId: string) =>
  ConsoleClient.query("Returns.list", { customerId }, { reactivityKeys: RETURNS })
)

/** "Retour starten": the order's lines and what is still free to send back. */
export const returnableAtom = Atom.family((orderId: string) =>
  ConsoleClient.query("Returns.returnable", { orderId }, {
    reactivityKeys: [...RETURNS, ...RETURN_SETTINGS, ...ORDERS]
  })
)

export const returnWrites = {
  start: ConsoleClient.mutation("Returns.start"),
  approve: ConsoleClient.mutation("Returns.approve"),
  reject: ConsoleClient.mutation("Returns.reject"),
  reopen: ConsoleClient.mutation("Returns.reopen"),
  assign: ConsoleClient.mutation("Returns.assign"),
  markReceived: ConsoleClient.mutation("Returns.markReceived"),
  sendLabel: ConsoleClient.mutation("Returns.sendLabel"),
  addTracking: ConsoleClient.mutation("Returns.addTracking"),
  inspect: ConsoleClient.mutation("Returns.inspect"),
  resolve: ConsoleClient.mutation("Returns.resolve"),
  setSettings: ConsoleClient.mutation("Returns.setSettings"),
  undo: ConsoleClient.mutation("Shared.undo")
} as const
