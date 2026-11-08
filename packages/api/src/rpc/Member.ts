import type { Db } from "@insyte/database/Db"
import { NoWorkspace } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import type { CurrentUser } from "@insyte/domain/Session"
import { RpcMiddleware } from "effect/rpc"

/**
 * The signed-in person → their principal in the active workspace (M3.1 `principalFrom`, 04 §8.1): the membership the
 * session names, with its role as of this request. A group that works inside a workspace lists it before
 * `Authenticated` and `WithDb`, which it needs and which run around it. `NoWorkspace` when the person belongs to none.
 */
export class Member extends RpcMiddleware.Service<Member, {
  provides: CurrentPrincipal
  requires: CurrentUser | Db
}>()("api/Member", { error: NoWorkspace }) {}
