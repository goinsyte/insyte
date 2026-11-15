import { Forbidden, NotFound, NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { ProductDetail, type ProductListInput, ProductPage } from "@insyte/modules/products/domain/Products"
import { CursorInvalid, FilterFieldUnknown } from "@insyte/modules/shared/domain/Filter"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"
import { storeKey, withStore } from "./in-view.ts"
import { QUALITY } from "./quality.ts"
import { RETURNS } from "./returns.ts"
import { inView } from "./store-view.ts"

/*
 * Producten (M6.4): the catalogue's pages, the first primed by the route's loader and carried in the document, each
 * next one read as the design's table pages, filters (the panel's Aandacht cuts too, `Products.list`'s flags), searches
 * and sorts on the server. A change (a webhook, or a command, M7.3) names `PRODUCTS`; a return or a quality check
 * moves the Aandacht flags, so those name the list too.
 */

export const PRODUCTS = ["products"] as const

const PAGE = AsyncResult.Schema({
  success: ProductPage,
  error: Schema.Union([
    Forbidden,
    FilterFieldUnknown,
    CursorInvalid,
    NoWorkspace,
    Unauthenticated,
    RpcClientError.RpcClientError
  ])
})

/** Up to 200 by title, for the screens that pick from them (Retouren, a product's header); the list pages. */
export const productsAtom = inView((storeId) =>
  Atom.serializable(
    ConsoleClient.query("Products.list", withStore({ limit: 200 }, storeId), { reactivityKeys: PRODUCTS }),
    { key: `products@${storeKey(storeId)}`, schema: PAGE, skipInitialRun: true }
  )
)

/** One page of Producten as its table asks for it (`products-source.ts`), keyed by `Products.list`'s input as JSON. */
export const productsPageAtom = Atom.family((input: string) =>
  inView((storeId) =>
    Atom.serializable(
      ConsoleClient.query("Products.list", withStore(JSON.parse(input) as ProductListInput, storeId), {
        reactivityKeys: [...PRODUCTS, ...RETURNS, ...QUALITY]
      }),
      { key: `products@${storeKey(storeId)}:${input}`, schema: PAGE, skipInitialRun: true }
    )
  )
)

/**
 * One product: primed by the record's loader on a server render, read in the browser when a row opens it (the list's
 * row draws the header meanwhile). A change to any product refreshes it.
 */
export const productAtom = Atom.family((id: string) =>
  Atom.serializable(
    ConsoleClient.query("Products.get", { id }, { reactivityKeys: PRODUCTS }),
    {
      key: `product:${id}`,
      schema: AsyncResult.Schema({
        success: ProductDetail,
        error: Schema.Union([Forbidden, NotFound, NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])
      }),
      skipInitialRun: true
    }
  )
)

/** What runs low (M7 9.3), for the list's low-stock advice: read in the browser once the list is in. */
export const lowStockAtom = inView((storeId) =>
  ConsoleClient.query("Products.lowStock", withStore({}, storeId), { reactivityKeys: PRODUCTS })
)

/** The product commands (M7.3), each refreshing what names `PRODUCTS`; their undo is `orderWrites.undo`'s `Shared.undo`. */
export const productWrites = {
  edit: ConsoleClient.mutation("Products.edit"),
  setStatus: ConsoleClient.mutation("Products.setStatus"),
  reprice: ConsoleClient.mutation("Products.reprice"),
  sync: ConsoleClient.mutation("Products.sync"),
  undo: ConsoleClient.mutation("Shared.undo")
} as const
