import { Forbidden } from "@insyte/domain/Errors"
import { SetSupportAccess, SupportAccess } from "@insyte/modules/support/domain/Support"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

/*
 * Insyte-support looking along (M18): whether support may look along and whether it does now, read by every member
 * (the switch under Gegevens en privacy, the frame's banner); the switch itself, the owner's. Not reachable by an API
 * key: a person's consent, for people only.
 */
export class SupportRpcs extends RpcGroup.make(
  Rpc.make("Support.status", { success: SupportAccess }),
  Rpc.make("Support.setAccess", { payload: SetSupportAccess, success: SupportAccess, error: Forbidden })
)
  // Innermost first: `Member` needs the person (`Authenticated`) and the connection (`WithDb`) around it.
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
