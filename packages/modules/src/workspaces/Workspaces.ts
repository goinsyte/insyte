import type { Db } from "@insyte/database/Db"
import type { CurrentUser } from "@insyte/domain/Session"
import { Context, Effect, Layer } from "effect"
import { WorkspaceFounder, WorkspaceSetup } from "../shared/domain/Workspaces.ts"
import { found } from "./use-cases/found.ts"
import { type Membership, memberships } from "./use-cases/memberships.ts"
import { completeOnboarding, startTrial } from "./use-cases/setup.ts"

/**
 * The workspaces slice (M3.1): founding a workspace for onboarding (the `WorkspaceFounder` port), its trial and the end
 * of its onboarding (`WorkspaceSetup`), and a person's memberships for the session. Reads run as the request's person on the request's connection.
 *
 * @effect-expect-leaking Db CurrentUser
 */
export class Workspaces extends Context.Service<Workspaces, {
  readonly memberships: Effect.Effect<ReadonlyArray<Membership>, never, Db | CurrentUser>
}>()("modules/Workspaces") {
  static readonly layer = Layer.succeed(Workspaces, { memberships: Effect.orDie(memberships()) })

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
