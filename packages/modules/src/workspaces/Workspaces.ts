import type { Db } from "@insyte/database/Db"
import type { NotFound } from "@insyte/domain/Errors"
import type { CurrentUser, Switched } from "@insyte/domain/Session"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import { WorkspaceFounder, WorkspaceSetup } from "../shared/domain/Workspaces.ts"
import type { WorkspaceSummary } from "./domain/Choice.ts"
import { switchTo, type Target } from "./use-cases/choose.ts"
import { found } from "./use-cases/found.ts"
import { list } from "./use-cases/list.ts"
import { type Membership, memberships } from "./use-cases/memberships.ts"
import { completeOnboarding, startTrial } from "./use-cases/setup.ts"

export type { Target } from "./use-cases/choose.ts"
export { landingOf } from "./use-cases/memberships.ts"

/**
 * The workspaces slice (M3.1): founding a workspace for onboarding (the `WorkspaceFounder` port), its trial and the end
 * of its onboarding (`WorkspaceSetup`), a person's memberships for the session (the session's chosen workspace first),
 * the switcher's list, and switching. Reads run as the request's person on the request's connection.
 *
 * @effect-expect-leaking Db CurrentUser
 */
export class Workspaces extends Context.Service<Workspaces, {
  readonly memberships: Effect.Effect<ReadonlyArray<Membership>, never, Db | CurrentUser>
  readonly list: Effect.Effect<ReadonlyArray<WorkspaceSummary>, never, Db | CurrentUser>
  /** The session `sessionId` (the request's own) acts in the target membership from now on. */
  readonly switchTo: (sessionId: string, target: Target) => Effect.Effect<Switched, NotFound, Db | CurrentUser>
}>()("modules/Workspaces") {
  static readonly layer = Layer.succeed(Workspaces, {
    memberships: Effect.orDie(memberships()),
    list: list().pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    switchTo: (sessionId, target) => switchTo(sessionId, target).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))
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
