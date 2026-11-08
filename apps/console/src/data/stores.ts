import { Forbidden, NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { StoreView } from "@insyte/modules/stores/domain/Stores"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"

/*
 * Instellingen → Winkels (M6.2): the workspace's stores, primed by the route's loader and carried in the document;
 * connecting answers with Shopify's approval address, and every change names `STORES`.
 */

export const STORES = ["stores"] as const

export const storesAtom = Atom.serializable(
  ConsoleClient.query("Stores.list", undefined, { reactivityKeys: STORES }),
  {
    key: "stores",
    schema: AsyncResult.Schema({
      success: Schema.Array(StoreView),
      error: Schema.Union([Forbidden, NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])
    }),
    skipInitialRun: true
  }
)

export const storeWrites = {
  beginConnect: ConsoleClient.mutation("Stores.beginConnect"),
  disconnect: ConsoleClient.mutation("Stores.disconnect")
} as const
