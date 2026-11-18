import { Effect } from "effect"
import { SqlError } from "effect/sql"
import type { SetSupportAccess } from "./domain/Support.ts"
import * as Consent from "./use-cases/consent.ts"
import * as Team from "./use-cases/staff.ts"

/*
 * Insyte-support looking along (M18): the workspace's side (`Support`: the consent and the banner, over the console's
 * RPC) and the team's (`Staff`: the staff admin at `/api/__admin`). Loaded on first use by both transports, never at
 * a Worker's startup (ADR-0041 §3).
 */

/** A database that is away is a defect of the call, as for every slice's RPC. */
export const Support = {
  status: () => Consent.status().pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
  setAccess: (input: SetSupportAccess) => Consent.setAccess(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))
} as const

export const Staff = {
  find: Team.find,
  health: Team.health,
  start: Team.start,
  session: Team.session,
  beginRead: Team.beginRead,
  refuseRead: Team.refuseRead,
  failedRead: Team.failedRead,
  end: Team.end,
  trail: Team.trail
} as const
