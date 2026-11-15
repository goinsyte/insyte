import { Db } from "@insyte/database/Db"
import { NotFound } from "@insyte/domain/Errors"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentUser, Switched } from "@insyte/domain/Session"
import { Effect } from "effect"
import { activate } from "../../shared/use-cases/ActiveWorkspace.ts"
import { landingOf, memberships } from "./memberships.ts"

/*
 * "Openen" in the switcher (`Workspaces.switch`, M3.1): the session acts in that workspace from its next request on,
 * with that membership's role and store fence, everywhere the active principal is read. Only a workspace the person is an active member of: any other id reads as no such workspace. The
 * console loads the whole page afresh after it, so nothing read in the other workspace stays on screen.
 */

export const switchTo = Effect.fn("Workspaces.switch")(function*(sessionId: string, workspaceId: WorkspaceId) {
  const user = yield* CurrentUser
  const db = yield* Db
  const mine = yield* memberships()
  const chosen = mine.find((m) => m.workspaceId === workspaceId)
  if (chosen === undefined) return yield* new NotFound({ entity: "workspace", id: workspaceId })
  yield* db.routing((sql) => activate(sql, { id: sessionId, userId: user.id }, chosen.workspaceId))
  return new Switched({ workspaceId: chosen.workspaceId, landing: landingOf(chosen) })
})
