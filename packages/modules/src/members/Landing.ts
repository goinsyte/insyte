import type { Db } from "@insyte/database/Db"
import type { CurrentUser, CurrentViewer } from "@insyte/domain/Session"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import { Relay } from "../shared/domain/Outbox.ts"
import type { Accepted, Landing as LandingView, LandingRef, NotAcceptable } from "./domain/Landing.ts"
import { accept, decline } from "./use-cases/invitations/accept.ts"
import { requestNew, requestSeat, resolve } from "./use-cases/invitations/resolve.ts"

/**
 * The invitation landing (M3.4): public reads and asks for whoever opened the link, and accepting or declining as the
 * signed-in invitee. Every read and write happens in the invitation's own workspace, found through the routing
 * functions.
 *
 * @effect-expect-leaking Db CurrentViewer CurrentUser
 */
export class Landing extends Context.Service<Landing, {
  readonly resolve: (ref: LandingRef) => Effect.Effect<LandingView, never, Db | CurrentViewer>
  readonly requestNew: (ref: LandingRef) => Effect.Effect<LandingView, never, Db | CurrentViewer>
  readonly requestSeat: (ref: LandingRef) => Effect.Effect<LandingView, never, Db | CurrentViewer>
  readonly accept: (ref: LandingRef) => Effect.Effect<Accepted, NotAcceptable, Db | CurrentUser>
  readonly decline: (ref: LandingRef) => Effect.Effect<LandingView, NotAcceptable, Db | CurrentUser>
}>()("modules/Landing") {
  static readonly layer = Layer.effect(
    Landing,
    Effect.map(Effect.service(Relay), (relay) => {
      // A database that does not answer is a defect, as everywhere.
      const run = <A, E, R>(effect: Effect.Effect<A, E | SqlError.SqlError, R>) =>
        effect.pipe(Effect.provideService(Relay, relay), Effect.catchIf(SqlError.isSqlError, Effect.die))
      return {
        resolve: (ref) => run(resolve(ref)),
        requestNew: (ref) => run(requestNew(ref)),
        requestSeat: (ref) => run(requestSeat(ref)),
        accept: (ref) => run(accept(ref)),
        decline: (ref) => run(decline(ref))
      }
    })
  )
}
