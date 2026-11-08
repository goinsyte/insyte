import { Forbidden, NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { AccessRequest } from "@insyte/modules/access/domain/Access"
import { Roles } from "@insyte/modules/roles/domain/Roles"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"

/*
 * Instellingen → Rollen (M3.2): the roles with who holds each, and the open access requests (for whoever may manage the
 * team; anyone else is answered `Forbidden`, and the page says so in the list's place). Both are primed by the route's
 * loader and carried in the document; every change names `ROLES`, a grant or decline also `ACCESS_LIST`.
 */

export const ROLES = ["roles"] as const
export const ACCESS_LIST = ["access.list"] as const

export const rolesAtom = Atom.serializable(
  ConsoleClient.query("Roles.list", undefined, { reactivityKeys: ROLES }),
  {
    key: "roles",
    schema: AsyncResult.Schema({
      success: Roles,
      error: Schema.Union([Forbidden, NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])
    }),
    skipInitialRun: true
  }
)

export const accessListAtom = Atom.serializable(
  ConsoleClient.query("Access.list", undefined, { reactivityKeys: ACCESS_LIST }),
  {
    key: "access.list",
    schema: AsyncResult.Schema({
      success: Schema.Array(AccessRequest),
      error: Schema.Union([Forbidden, NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])
    }),
    skipInitialRun: true
  }
)

export const rolesWrites = {
  create: ConsoleClient.mutation("Roles.create"),
  update: ConsoleClient.mutation("Roles.update"),
  rename: ConsoleClient.mutation("Roles.rename"),
  reset: ConsoleClient.mutation("Roles.reset"),
  remove: ConsoleClient.mutation("Roles.remove"),
  restore: ConsoleClient.mutation("Roles.restore"),
  grant: ConsoleClient.mutation("Access.grant"),
  decline: ConsoleClient.mutation("Access.decline")
} as const
