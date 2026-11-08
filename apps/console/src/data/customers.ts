import { Forbidden, NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { CustomerPage } from "@insyte/modules/customers/domain/Customers"
import { CursorInvalid, FilterFieldUnknown } from "@insyte/modules/shared/domain/Filter"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"

/*
 * Klanten (M6.4): the customers, primed by the route's loader and carried in the document. As with the orders, the
 * design's table works in the browser, so it gets its rows at once: up to 200, by name. A change names `CUSTOMERS`.
 */

export const CUSTOMERS = ["customers"] as const

export const customersAtom = Atom.serializable(
  ConsoleClient.query("Customers.list", { limit: 200 }, { reactivityKeys: CUSTOMERS }),
  {
    key: "customers",
    schema: AsyncResult.Schema({
      success: CustomerPage,
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
