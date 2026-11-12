import { Invalid, NotFound } from "@insyte/domain/Errors"
import { ActiveSession, RevokeSession, SessionMe } from "@insyte/domain/Session"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { WithDb } from "./WithDb.ts"

/**
 * The signed-in person, before and beside any workspace: who they are, and their own sessions (Instellingen →
 * Beveiliging, M3.3). A person's own, so no role gates them.
 */
export class SessionRpcs extends RpcGroup.make(
  Rpc.make("Session.me", { success: SessionMe }),
  Rpc.make("Session.listSessions", { success: Schema.Array(ActiveSession) }),
  Rpc.make("Session.revoke", { payload: RevokeSession, error: Schema.Union([Invalid, NotFound]) })
).middleware(Authenticated).middleware(WithDb) {}
