import { Forbidden, NotFound, NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { CustomerDetail, CustomerPage } from "@insyte/modules/customers/domain/Customers"
import { DuplicateGroup } from "@insyte/modules/customers/domain/Duplicates"
import { CursorInvalid, FilterFieldUnknown, type ListInput } from "@insyte/modules/shared/domain/Filter"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"
import { storeKey, withStore } from "./in-view.ts"
import { inView } from "./store-view.ts"

/*
 * Klanten (M6.4): the profiles' pages, the first primed by the route's loader and carried in the document, each next
 * one read as the design's table pages, filters, searches and sorts on the server. A change names `CUSTOMERS`.
 */

export const CUSTOMERS = ["customers"] as const

const PAGE = AsyncResult.Schema({
  success: CustomerPage,
  error: Schema.Union([
    Forbidden,
    FilterFieldUnknown,
    CursorInvalid,
    NoWorkspace,
    Unauthenticated,
    RpcClientError.RpcClientError
  ])
})

/** Up to 200 by name, for a customer's header while the record loads; the list pages. */
export const customersAtom = inView((storeId) =>
  Atom.serializable(
    ConsoleClient.query("Customers.list", withStore({ limit: 200 }, storeId), { reactivityKeys: CUSTOMERS }),
    { key: `customers@${storeKey(storeId)}`, schema: PAGE, skipInitialRun: true }
  )
)

/**
 * One page of Klanten as its table asks for it (`customers-source.ts`), keyed by `Customers.list`'s input as JSON; the
 * duplicate review reads its profiles by id the same way.
 */
export const customersPageAtom = Atom.family((input: string) =>
  inView((storeId) =>
    Atom.serializable(
      ConsoleClient.query("Customers.list", withStore(JSON.parse(input) as ListInput, storeId), {
        reactivityKeys: CUSTOMERS
      }),
      { key: `customers@${storeKey(storeId)}:${input}`, schema: PAGE, skipInitialRun: true }
    )
  )
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
