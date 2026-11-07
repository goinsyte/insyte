import type { Db } from "@insyte/database/Db"
import type { CurrentUser } from "@insyte/domain/Session"
import { Context, Effect, Layer } from "effect"
import { WorkspaceFounder } from "../shared/domain/Workspaces.ts"
import { found } from "./use-cases/found.ts"
import { type Membership, memberships } from "./use-cases/memberships.ts"

/**
 * The workspaces slice (M3.1): founding a workspace for onboarding (the `WorkspaceFounder` port) and a person's
 * memberships for the session. Reads run as the request's person on the request's connection.
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
}
