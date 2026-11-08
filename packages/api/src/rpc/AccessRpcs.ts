import { Conflict, Forbidden, NotFound } from "@insyte/domain/Errors"
import { AccessRef, AccessRequest, AlreadyAllowed, RequestAccess } from "@insyte/modules/access/domain/Access"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

/**
 * Access requests (M3.5): asking from a denied state and taking it back, for any member, each answering their own
 * requests; Rollen's list and its answers, for whoever may manage the team, each answering the list.
 */
export class AccessRpcs extends RpcGroup.make(
  Rpc.make("Access.mine", { success: Schema.Array(AccessRequest) }),
  Rpc.make("Access.request", { payload: RequestAccess, success: Schema.Array(AccessRequest), error: AlreadyAllowed }),
  Rpc.make("Access.withdraw", { payload: AccessRef, success: Schema.Array(AccessRequest) }),
  Rpc.make("Access.list", { success: Schema.Array(AccessRequest), error: Forbidden }),
  Rpc.make("Access.grant", {
    payload: AccessRef,
    success: Schema.Array(AccessRequest),
    error: Schema.Union([Forbidden, NotFound, Conflict])
  }),
  Rpc.make("Access.decline", {
    payload: AccessRef,
    success: Schema.Array(AccessRequest),
    error: Schema.Union([Forbidden, NotFound, Conflict])
  })
)
  // Innermost first: `Member` needs the person (`Authenticated`) and the connection (`WithDb`) around it.
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
