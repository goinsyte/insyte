import { Forbidden, NotFound, NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { ProductDetail, ProductPage } from "@insyte/modules/products/domain/Products"
import { CursorInvalid, FilterFieldUnknown } from "@insyte/modules/shared/domain/Filter"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"

/*
 * Producten (M6.4): the catalogue, primed by the route's loader and carried in the document; up to 200 by title, as
 * the design's table works in the browser. A change (a webhook, or a command, M7.3) names `PRODUCTS`.
 */

export const PRODUCTS = ["products"] as const

export const productsAtom = Atom.serializable(
  ConsoleClient.query("Products.list", { limit: 200 }, { reactivityKeys: PRODUCTS }),
  {
    key: "products",
    schema: AsyncResult.Schema({
      success: ProductPage,
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
export const lowStockAtom = ConsoleClient.query("Products.lowStock", {}, { reactivityKeys: PRODUCTS })

/** The product commands (M7.3), each refreshing what names `PRODUCTS`; their undo is `orderWrites.undo`'s `Shared.undo`. */
export const productWrites = {
  edit: ConsoleClient.mutation("Products.edit"),
  setStatus: ConsoleClient.mutation("Products.setStatus"),
  reprice: ConsoleClient.mutation("Products.reprice"),
  sync: ConsoleClient.mutation("Products.sync"),
  undo: ConsoleClient.mutation("Shared.undo")
} as const
