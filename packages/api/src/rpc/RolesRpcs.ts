import { Conflict, Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import {
  Created,
  CreateRole,
  RemoveRole,
  RenameRole,
  RoleRef,
  Roles,
  UpdateRole
} from "@insyte/modules/roles/domain/Roles"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

/**
 * Instellingen → Rollen (M3.2): the roles with who holds each, for anyone who may see the team, and every change to a
 * role, for whoever may manage it; each change answers the roles as they now stand. Not reachable by an API key
 * (`roles` is `api: false`, 15 step 5).
 */
export class RolesRpcs extends RpcGroup.make(
  Rpc.make("Roles.list", { success: Roles, error: Forbidden }),
  Rpc.make("Roles.create", {
    payload: CreateRole,
    success: Created,
    error: Schema.Union([Forbidden, Invalid, NotFound])
  }),
  Rpc.make("Roles.update", {
    payload: UpdateRole,
    success: Roles,
    error: Schema.Union([Forbidden, Invalid, NotFound, Conflict])
  }),
  Rpc.make("Roles.rename", {
    payload: RenameRole,
    success: Roles,
    error: Schema.Union([Forbidden, Invalid, NotFound, Conflict])
  }),
  Rpc.make("Roles.reset", {
    payload: RoleRef,
    success: Roles,
    error: Schema.Union([Forbidden, Invalid, NotFound, Conflict])
  }),
  Rpc.make("Roles.remove", {
    payload: RemoveRole,
    success: Roles,
    error: Schema.Union([Forbidden, Invalid, NotFound, Conflict])
  }),
  Rpc.make("Roles.restore", { payload: RoleRef, success: Roles, error: Schema.Union([Forbidden, Invalid, NotFound]) })
)
  // Innermost first: `Member` needs the person (`Authenticated`) and the connection (`WithDb`) around it.
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
