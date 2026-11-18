import { Effect } from "effect"
import { Forbidden } from "./Errors.ts"
import { type AreaId, canRole, type Level, type SpecialId } from "./Permissions.ts"
import { CurrentPrincipal, type Principal } from "./Principal.ts"

/*
 * The server's half of the permission catalogue (04 §5, ADR-0010): a use case asks for the level it needs before it
 * reads or writes, and the console greys out the same control from the same `canRole`. The owner may do everything.
 *
 * A staff session looking along (`staff_viewer`, M18) reads and nothing else, whatever its role says: every level past
 * Bekijken and every special action is refused here, so no write use case runs for it on any transport (the RPC, `/v1`,
 * MCP). Its transaction is read-only besides (`Db`).
 */

/** Only reading: the most a staff session looking along may ever hold. */
const READ = 1

const readOnly = (principal: Principal) => principal.kind === "staff_viewer"

/** The principal's role reaches `level` in `area`, or `Forbidden` naming what it misses. */
export const require = Effect.fn("Policy.require")(function*(area: AreaId, level: Level) {
  const principal = yield* CurrentPrincipal
  const { role } = principal
  if (
    !(readOnly(principal) && level > READ) &&
    canRole({ ...role, stores: role.stores === "all" ? "all" : [...role.stores] }, area, level)
  ) return
  return yield* new Forbidden({ permission: area, level, roleLabel: role.label })
})

/** The principal's role holds a special action (`refunds.write`), or `Forbidden` naming it (level 0: no level). */
export const requireAction = Effect.fn("Policy.requireAction")(function*(action: SpecialId) {
  const principal = yield* CurrentPrincipal
  const { role } = principal
  if (!readOnly(principal) && canRole({ ...role, stores: role.stores === "all" ? "all" : [...role.stores] }, action)) {
    return
  }
  return yield* new Forbidden({ permission: action, level: 0, roleLabel: role.label })
})
