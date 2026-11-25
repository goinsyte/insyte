import type { Db } from "@insyte/database/Db"
import type { NotFound } from "@insyte/domain/Errors"
import type { WorkspaceId } from "@insyte/domain/Ids"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import type { CurrentUser, Switched } from "@insyte/domain/Session"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import { WorkspaceFounder, WorkspaceSetup } from "../shared/domain/Workspaces.ts"
import type { WorkspaceSummary } from "./domain/Choice.ts"
import type { Notation } from "./domain/Settings.ts"
import { switchTo } from "./use-cases/choose.ts"
import { found } from "./use-cases/found.ts"
import { list } from "./use-cases/list.ts"
import { current, type Membership, memberships } from "./use-cases/memberships.ts"
import { notationOf } from "./use-cases/regional.ts"
import { completeOnboarding, startTrial } from "./use-cases/setup.ts"

export { landingOf } from "./use-cases/memberships.ts"

/**
 * The workspaces slice (M3.1): founding a workspace for onboarding (the `WorkspaceFounder` port), its trial and the end
 * of its onboarding (`WorkspaceSetup`), a person's memberships for the session (the session's chosen workspace first),
 * the switcher's list, and switching. Reads run as the request's person on the request's connection.
 *
 * @effect-expect-leaking Db CurrentUser CurrentPrincipal
 */
export class Workspaces extends Context.Service<Workspaces, {
  readonly memberships: Effect.Effect<ReadonlyArray<Membership>, never, Db | CurrentUser>
  /** `memberships`, the session pinned to the first when it named none or one it no longer holds. */
  readonly current: Effect.Effect<ReadonlyArray<Membership>, never, Db | CurrentUser>
  readonly list: Effect.Effect<ReadonlyArray<WorkspaceSummary>, never, Db | CurrentUser>
  /** The session `sessionId` (the request's own) acts in the target membership from now on. */
  readonly switchTo: (
    sessionId: string,
    workspaceId: WorkspaceId
  ) => Effect.Effect<Switched, NotFound, Db | CurrentUser>
  /** How the console writes dates and times in the workspace (Regio), for the frame of any member. */
  readonly notation: Effect.Effect<Notation, never, Db | CurrentPrincipal>
}>()("modules/Workspaces") {
  static readonly layer = Layer.succeed(Workspaces, {
    memberships: Effect.orDie(memberships()),
    current: Effect.orDie(current()),
    list: list().pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    switchTo: (sessionId, workspaceId) =>
      switchTo(sessionId, workspaceId).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    notation: notationOf().pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))
  })

  /** The port onboarding founds through. A database error other than a taken slug is a defect. */
  static readonly founder = Layer.succeed(WorkspaceFounder, {
    found: (id, workspace, owner) => found(id, workspace, owner).pipe(Effect.catchTag("SqlError", Effect.die))
  })

  /** The port onboarding's plan and ready steps go through. A database error is a defect. */
  static readonly setup = Layer.succeed(WorkspaceSetup, {
    startTrial: (id, plan, by) => startTrial(id, plan, by).pipe(Effect.catchTag("SqlError", Effect.die)),
    completeOnboarding: (id, by) => completeOnboarding(id, by).pipe(Effect.catchTag("SqlError", Effect.die))
  })
}
