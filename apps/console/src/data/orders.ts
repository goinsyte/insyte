import { Forbidden, NotFound, NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { TagCount } from "@insyte/modules/orders/domain/Commands"
import { OrderDetail, OrderPage } from "@insyte/modules/orders/domain/Orders"
import { CursorInvalid, FilterFieldUnknown, type ListInput } from "@insyte/modules/shared/domain/Filter"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"

/*
 * Bestellingen (M6.4): the list's pages, the first primed by the route's loader and carried in the document, each next
 * one read as the design's table pages, filters, searches and sorts on the server. A change to an order (a webhook,
 * M6.3, or a command, M7.1) names `ORDERS`; the commands' undo is `Shared.undo`.
 */

export const ORDERS = ["orders"] as const

/** As many orders as the pickers hold. */
const LIMIT = 200

const PAGE = AsyncResult.Schema({
  success: OrderPage,
  error: Schema.Union([
    Forbidden,
    FilterFieldUnknown,
    CursorInvalid,
    NoWorkspace,
    Unauthenticated,
    RpcClientError.RpcClientError
  ])
})

/** The newest orders, for the screens that pick from them (Retouren, Data); the list itself pages on the server. */
export const ordersAtom = Atom.serializable(
  ConsoleClient.query("Orders.list", { limit: LIMIT }, { reactivityKeys: ORDERS }),
  { key: "orders", schema: PAGE, skipInitialRun: true }
)

/**
 * One page of Bestellingen as its table asks for it (`orders-source.ts`), keyed by `Orders.list`'s input as JSON: the
 * route reads the first ahead, and the table reads each page, filter, search and order it is asked for after that.
 */
export const ordersPageAtom = Atom.family((input: string) =>
  Atom.serializable(
    ConsoleClient.query("Orders.list", JSON.parse(input) as ListInput, { reactivityKeys: ORDERS }),
    { key: `orders:${input}`, schema: PAGE, skipInitialRun: true }
  )
)

/**
 * One order with its lines, parcels and refunds: primed by the record's loader on a server render, read in the browser
 * when a row opens it (the list's row draws the header meanwhile). A change to any order refreshes it.
 */
export const orderAtom = Atom.family((id: string) =>
  Atom.serializable(
    ConsoleClient.query("Orders.get", { id }, { reactivityKeys: ORDERS }),
    {
      key: `order:${id}`,
      schema: AsyncResult.Schema({
        success: OrderDetail,
        error: Schema.Union([Forbidden, NotFound, NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])
      }),
      skipInitialRun: true
    }
  )
)

/** The operator's tags in the role's stores, the most used first: offered while typing a tag. */
export const orderTagsAtom = Atom.serializable(
  ConsoleClient.query("Orders.tags", undefined, { reactivityKeys: ORDERS }),
  {
    key: "order-tags",
    schema: AsyncResult.Schema({
      success: Schema.Array(TagCount),
      error: Schema.Union([Forbidden, NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])
    }),
    skipInitialRun: true
  }
)

/** The order commands (M7.1), each refreshing what names `ORDERS`, and the undo every reversible one offers. */
export const orderWrites = {
  tag: ConsoleClient.mutation("Orders.tag"),
  markFulfilled: ConsoleClient.mutation("Orders.markFulfilled"),
  updateShipping: ConsoleClient.mutation("Orders.updateShipping"),
  cancel: ConsoleClient.mutation("Orders.cancel"),
  flagDelayed: ConsoleClient.mutation("Orders.flagDelayed"),
  clearDelay: ConsoleClient.mutation("Orders.clearDelay"),
  setNote: ConsoleClient.mutation("Orders.setNote"),
  refund: ConsoleClient.mutation("Orders.refund"),
  emailCustomer: ConsoleClient.mutation("Orders.emailCustomer"),
  sendTrackingUpdate: ConsoleClient.mutation("Orders.sendTrackingUpdate"),
  undo: ConsoleClient.mutation("Shared.undo")
} as const
