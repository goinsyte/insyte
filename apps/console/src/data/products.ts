import { Forbidden, NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { ProductPage } from "@insyte/modules/products/domain/Products"
import { CursorInvalid, FilterFieldUnknown } from "@insyte/modules/shared/domain/Filter"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"

/*
 * Producten (M6.4): the catalogue, primed by the route's loader and carried in the document; up to 200 by title, as
 * the design's table works in the browser. A change names `PRODUCTS`.
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
