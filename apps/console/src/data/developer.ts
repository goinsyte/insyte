import { Endpoints } from "@insyte/api/rpc/DeveloperRpcs"
import { Forbidden, NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { ApiKeyView } from "@insyte/modules/developer/domain/ApiKey"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"

/*
 * Instellingen → API-sleutels (M19.1): the keys, primed by the route's loader and carried in the document; a key's
 * activity when its detail opens; every change names `KEYS`.
 */

export const KEYS = ["api-keys"] as const

export const keysAtom = Atom.serializable(
  ConsoleClient.query("ApiKeys.list", undefined, { reactivityKeys: KEYS }),
  {
    key: "api-keys",
    schema: AsyncResult.Schema({
      success: Schema.Array(ApiKeyView),
      error: Schema.Union([Forbidden, NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])
    }),
    skipInitialRun: true
  }
)

export const keyActivityAtom = Atom.family((id: string) =>
  ConsoleClient.query("ApiKeys.activity", { id }, { reactivityKeys: [...KEYS, `api-key:${id}`] })
)

export const keyWrites = {
  create: ConsoleClient.mutation("ApiKeys.create"),
  update: ConsoleClient.mutation("ApiKeys.update"),
  rotate: ConsoleClient.mutation("ApiKeys.rotate"),
  endGrace: ConsoleClient.mutation("ApiKeys.endGrace"),
  revoke: ConsoleClient.mutation("ApiKeys.revoke"),
  restore: ConsoleClient.mutation("ApiKeys.restore")
} as const

/** Where a key is used: the public API's base and the MCP server's address, from the API's own config. */
export const endpointsAtom = Atom.serializable(
  ConsoleClient.query("ApiKeys.endpoints", undefined),
  {
    key: "api-endpoints",
    schema: AsyncResult.Schema({
      success: Endpoints,
      error: Schema.Union([NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])
    }),
    skipInitialRun: true
  }
)
