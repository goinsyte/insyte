import { Conflict, Forbidden, NotFound } from "@insyte/domain/Errors"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

/**
 * Undo as a server window (ADR-0023): "Ongedaan maken" on any reversible command, by the token it answered. Only the
 * member who did it, inside the window, once; the compensation is itself a command, with that command's permission.
 */
export class SharedRpcs extends RpcGroup.make(
  Rpc.make("Shared.undo", {
    payload: Schema.Struct({ token: Schema.String }),
    error: Schema.Union([Forbidden, NotFound, Conflict])
  })
)
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
