import { Forbidden, NotFound, NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { CustomerDetail, CustomerPage } from "@insyte/modules/customers/domain/Customers"
import { DuplicateGroup } from "@insyte/modules/customers/domain/Duplicates"
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

/**
 * One customer: primed by the record's loader on a server render, read in the browser when a row opens it (the list's
 * row draws the header meanwhile). A change to any customer refreshes it.
 */
export const customerAtom = Atom.family((id: string) =>
  Atom.serializable(
    ConsoleClient.query("Customers.get", { id }, { reactivityKeys: CUSTOMERS }),
    {
      key: `customer:${id}`,
      schema: AsyncResult.Schema({
        success: CustomerDetail,
        error: Schema.Union([Forbidden, NotFound, NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])
      }),
      skipInitialRun: true
    }
  )
)

/** The profiles that look like the same person (M7.4), for the list's review; a change to a customer refreshes it. */
export const duplicatesAtom = Atom.serializable(
  ConsoleClient.query("Customers.duplicates", undefined, { reactivityKeys: CUSTOMERS }),
  {
    key: "customer-duplicates",
    schema: AsyncResult.Schema({
      success: Schema.Array(DuplicateGroup),
      error: Schema.Union([Forbidden, NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])
    }),
    skipInitialRun: true
  }
)

/** The customer commands (M7.4), each refreshing what names `CUSTOMERS`, and the undo they offer. */
export const customerWrites = {
  tag: ConsoleClient.mutation("Customers.tag"),
  create: ConsoleClient.mutation("Customers.create"),
  merge: ConsoleClient.mutation("Customers.merge"),
  markNotDuplicate: ConsoleClient.mutation("Customers.markNotDuplicate"),
  undo: ConsoleClient.mutation("Shared.undo")
} as const
