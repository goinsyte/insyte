import { PortalNotFound, PortalStore } from "@insyte/modules/returns/domain/Portal"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"

/*
 * The public returns portal (M9.3): the store's page, read on the server by the route's loader and carried in the
 * document, keyed by the handle. Finding an order and the request are mutations; the photos go up over plain HTTP
 * (`portal/portal-source.tsx`).
 */

export const portalStoreAtom = Atom.family((handle: string) =>
  Atom.serializable(ConsoleClient.query("Portal.store", { handle }, { reactivityKeys: [`portal:${handle}`] }), {
    key: `portal:${handle}`,
    schema: AsyncResult.Schema({
      success: PortalStore,
      error: Schema.Union([PortalNotFound, RpcClientError.RpcClientError])
    }),
    skipInitialRun: true
  })
)

export const portalWrites = {
  lookup: ConsoleClient.mutation("Portal.lookup"),
  start: ConsoleClient.mutation("Portal.start")
} as const
