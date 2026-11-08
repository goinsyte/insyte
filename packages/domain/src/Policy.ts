import { Effect } from "effect"
import { Forbidden } from "./Errors.ts"
import { type AreaId, canRole, type Level } from "./Permissions.ts"
import { CurrentPrincipal } from "./Principal.ts"

/*
 * The server's half of the permission catalogue (04 §5, ADR-0010): a use case asks for the level it needs before it
 * reads or writes, and the console greys out the same control from the same `canRole`. The owner may do everything.
 */

/** The principal's role reaches `level` in `area`, or `Forbidden` naming what it misses. */
export const require = Effect.fn("Policy.require")(function*(area: AreaId, level: Level) {
  const { role } = yield* CurrentPrincipal
  if (canRole({ ...role, stores: role.stores === "all" ? "all" : [...role.stores] }, area, level)) return
  return yield* new Forbidden({ permission: area, level, roleLabel: role.label })
})
