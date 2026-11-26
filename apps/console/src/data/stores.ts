import { Forbidden, NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { HealthView } from "@insyte/modules/stores/domain/Health"
import { StoreView } from "@insyte/modules/stores/domain/Stores"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"

/*
 * Instellingen → Winkels and onboarding's store and sync steps (M6.2, M6.3): the workspace's stores, primed by the
 * route's loader and carried in the document; connecting answers with Shopify's approval address; every change names
 * `STORES`, and a first import's progress `STORE_SYNC`.
 */

export const STORES = ["stores"] as const
/** Sync health (M17 step 6): read again when the check changed a connection (`records.changed connection`). */
export const HEALTH = ["stores.health"] as const
/** A store's first import: refetched on its progress frames (`job.progress`). */
export const STORE_SYNC = ["stores.sync"] as const

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

/** Where a store's first import is: each resource's phase and the mirror's counts. */
export const syncStatusAtom = Atom.family((id: string) =>
  ConsoleClient.query("Stores.syncStatus", { id }, { reactivityKeys: [...STORE_SYNC, `store-sync:${id}`] })
)

/**
 * Each store's sync health, for Winkels; a role without `data` or `integrations` reads none. Primed by the route's
 * loader beside the stores, so a row says its sync word on first paint instead of "Gekoppeld" and then the health.
 */
export const healthAtom = Atom.serializable(
  ConsoleClient.query("Connections.health", undefined, { reactivityKeys: [...HEALTH, ...STORES] }),
  {
    key: "stores-health",
    schema: AsyncResult.Schema({
      success: HealthView,
      error: Schema.Union([Forbidden, NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])
    }),
    skipInitialRun: true
  }
)

/** The top bar's line, read again on a connection's change; the frame's own until then. */
export const healthLineAtom = ConsoleClient.query("Shell.health", undefined, { reactivityKeys: [...HEALTH, ...STORES] })
