import { NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { AccessRequest } from "@insyte/modules/access/domain/Access"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"

/*
 * The signed-in member's access requests (M3.5): what every denied state reads to say "Gevraagd …" or that an earlier
 * request was declined, primed by the route's loader and carried in the document; asking and taking it back name
 * `ACCESS`, so the states read again.
 */

export const ACCESS = ["access.mine"] as const

export const myAccessAtom = Atom.serializable(
  ConsoleClient.query("Access.mine", undefined, { reactivityKeys: ACCESS }),
  {
    key: "access.mine",
    schema: AsyncResult.Schema({
      success: Schema.Array(AccessRequest),
      error: Schema.Union([NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])
    }),
    skipInitialRun: true
  }
)

export const accessWrites = {
  request: ConsoleClient.mutation("Access.request"),
  withdraw: ConsoleClient.mutation("Access.withdraw")
} as const
