import type { Db } from "@insyte/database/Db"
import { NoWorkspace, WorkspaceMismatch } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import type { CurrentUser } from "@insyte/domain/Session"
import { Schema } from "effect"
import { RpcMiddleware } from "effect/rpc"

/** The header a console tab names its workspace in: what its frame shows (M3.1). */
export const WORKSPACE_HEADER = "x-insyte-workspace"

/**
 * The signed-in person → their principal in the active workspace (M3.1 `principalFrom`, 04 §8.1): the membership the
 * session names, with its role as of this request. A group that works inside a workspace lists it before
 * `Authenticated` and `WithDb`, which it needs and which run around it. `NoWorkspace` when the person belongs to none;
 * `WorkspaceMismatch` when the tab names another workspace (`WORKSPACE_HEADER`) than the session now acts in.
 */
export class Member extends RpcMiddleware.Service<Member, {
  provides: CurrentPrincipal
  requires: CurrentUser | Db
}>()("api/Member", { error: Schema.Union([NoWorkspace, WorkspaceMismatch]) }) {}
