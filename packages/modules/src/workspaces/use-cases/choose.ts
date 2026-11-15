import { Db } from "@insyte/database/Db"
import { NotFound } from "@insyte/domain/Errors"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentUser, Switched } from "@insyte/domain/Session"
import { Effect } from "effect"
import { activate } from "../../shared/use-cases/ActiveWorkspace.ts"
import { landingOf, memberships } from "./memberships.ts"

/*
 * "Openen" in the switcher (`Workspaces.switch`), and `Session.switchPrincipal` for a membership (M3.1): the session
 * acts in that workspace from its next request on, with that membership's role and store fence, everywhere the active
 * principal is read. Only a workspace the person is an active member of: any other id reads as no such workspace. The
 * console loads the whole page afresh after it, so nothing read in the other workspace stays on screen.
 */

export type Target = { readonly workspaceId: WorkspaceId } | { readonly memberId: string }

export const switchTo = Effect.fn("Workspaces.switch")(function*(sessionId: string, target: Target) {
  const user = yield* CurrentUser
  const db = yield* Db
  const mine = yield* memberships()
  const chosen = mine.find((m) =>
    "workspaceId" in target ? m.workspaceId === target.workspaceId : m.memberId === target.memberId
  )
  if (chosen === undefined) {
    return yield* new NotFound({
      entity: "workspaceId" in target ? "workspace" : "principal",
      id: "workspaceId" in target ? target.workspaceId : target.memberId
    })
  }
  yield* db.routing((sql) => activate(sql, { id: sessionId, userId: user.id }, chosen.workspaceId))
  return new Switched({ workspaceId: chosen.workspaceId, landing: landingOf(chosen) })
})
