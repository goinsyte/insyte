import type { Db } from "@insyte/database/Db"
import type { Conflict, NotFound } from "@insyte/domain/Errors"
import type { WorkspaceId } from "@insyte/domain/Ids"
import type { CurrentUser } from "@insyte/domain/Session"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import { Relay } from "../shared/domain/Outbox.ts"
import type { WorkspaceInvite } from "./domain/Choice.ts"
import type { Accepted, NotAcceptable } from "./domain/Landing.ts"
import { acceptMine, declineMine, invitesToMe, leave, restoreMine } from "./use-cases/choice.ts"

type R = Db | CurrentUser

/**
 * The person's own memberships from the switcher (M3.1, M3.4): the invitations to other workspaces and what they do
 * with one, and leaving a workspace. As the person, not as a principal: these are about which workspaces they are in.
 *
 * @effect-expect-leaking Db CurrentUser
 */
export class Memberships extends Context.Service<Memberships, {
  readonly invites: Effect.Effect<ReadonlyArray<WorkspaceInvite>, never, R>
  readonly accept: (id: string) => Effect.Effect<Accepted, NotAcceptable, R>
  readonly decline: (id: string) => Effect.Effect<void, NotAcceptable, R>
  readonly restore: (id: string) => Effect.Effect<void, NotFound | Conflict, R>
  /** Leaves the workspace; `sessionId` (the request's own) stops acting in it. */
  readonly leave: (sessionId: string, workspaceId: WorkspaceId) => Effect.Effect<void, NotFound | Conflict, R>
}>()("modules/Memberships") {
  // A database that does not answer is a defect, as everywhere; accepting kicks the relay for `member.joined`.
  static readonly layer = Layer.effect(
    Memberships,
    Effect.map(Effect.service(Relay), (relay) => {
      const run = <A, E, Req>(effect: Effect.Effect<A, E | SqlError.SqlError, Req>) =>
        effect.pipe(Effect.provideService(Relay, relay), Effect.catchIf(SqlError.isSqlError, Effect.die))
      return {
        invites: run(invitesToMe()),
        accept: (id) => run(acceptMine(id)),
        decline: (id) => run(declineMine(id)),
        restore: (id) => run(restoreMine(id)),
        leave: (sessionId, workspaceId) => run(leave(sessionId, workspaceId))
      }
    })
  )
}
