import { SessionMe } from "@insyte/domain/Session"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { WithDb } from "./WithDb.ts"

export class SessionRpcs extends RpcGroup.make(
  Rpc.make("Session.me", { success: SessionMe })
).middleware(Authenticated).middleware(WithDb) {}
