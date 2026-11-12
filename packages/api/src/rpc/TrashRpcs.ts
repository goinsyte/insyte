import { Forbidden, NotFound } from "@insyte/domain/Errors"
import { TrashIds, TrashList, TrashPurged, TrashRestored } from "@insyte/modules/trash/domain/Trash"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

const Refused = Schema.Union([Forbidden, NotFound])

/**
 * The Prullenbak (M17 step 20.1a): what was deleted in the last 30 days, put back through its own slice (with that
 * slice's undo), or purged for good, which asks first and has no undo. Every one takes Instellingen · Bewerken, and
 * the item's own area: Bewerken to put back (or what its slice asks), Beheren to purge. Not reachable by an API key.
 */
export class TrashRpcs extends RpcGroup.make(
  Rpc.make("Trash.list", { success: TrashList, error: Forbidden }),
  Rpc.make("Trash.restore", { payload: TrashIds, success: TrashRestored, error: Refused }),
  Rpc.make("Trash.purge", { payload: TrashIds, success: TrashPurged, error: Refused }),
  Rpc.make("Trash.empty", { success: TrashPurged, error: Forbidden })
)
  // Innermost first: `Member` needs the person (`Authenticated`) and the connection (`WithDb`) around it.
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
