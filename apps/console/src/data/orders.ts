import { Forbidden, NotFound, NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { OrderDetail, OrderPage } from "@insyte/modules/orders/domain/Orders"
import { CursorInvalid, FilterFieldUnknown } from "@insyte/modules/shared/domain/Filter"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"

/*
 * Bestellingen (M6.4): the newest orders, primed by the route's loader and carried in the document. The design's table
 * filters, searches and pages in the browser, so it gets the rows it shows at once: up to `LIMIT`, the newest first.
 * A change to an order (a webhook, M6.3) names `ORDERS`.
 */

export const ORDERS = ["orders"] as const

/** As many orders as the list holds in the browser until it pages on the server. */
const LIMIT = 200

export const ordersAtom = Atom.serializable(
  ConsoleClient.query("Orders.list", { limit: LIMIT }, { reactivityKeys: ORDERS }),
  {
    key: "orders",
    schema: AsyncResult.Schema({
      success: OrderPage,
      error: Schema.Union([
        Forbidden,
        FilterFieldUnknown,
        CursorInvalid,
        NoWorkspace,
        Unauthenticated,
        RpcClientError.RpcClientError
      ])
    }),
    skipInitialRun: true
  }
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
