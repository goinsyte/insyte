import type { Db } from "@insyte/database/Db"
import type { Conflict, Forbidden, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import { Relay } from "../shared/domain/Outbox.ts"
import type { AccessRequest, AlreadyAllowed, RequestAccess } from "./domain/Access.ts"
import * as Requests from "./use-cases/requests.ts"

/**
 * The access slice (M3.5): a member's requests from the denied states, and Rollen's answers to them, as the request's
 * principal. The relay's kick is a port, taken when the layer is built.
 *
 * @effect-expect-leaking Db CurrentPrincipal
 */
export class Access extends Context.Service<Access, {
  readonly mine: Effect.Effect<ReadonlyArray<AccessRequest>, never, Db | CurrentPrincipal>
  readonly request: (
    input: RequestAccess
  ) => Effect.Effect<ReadonlyArray<AccessRequest>, AlreadyAllowed, Db | CurrentPrincipal>
  readonly withdraw: (id: string) => Effect.Effect<ReadonlyArray<AccessRequest>, never, Db | CurrentPrincipal>
  readonly list: Effect.Effect<ReadonlyArray<AccessRequest>, Forbidden, Db | CurrentPrincipal>
  readonly grant: (
    id: string
  ) => Effect.Effect<ReadonlyArray<AccessRequest>, Forbidden | NotFound | Conflict, Db | CurrentPrincipal>
  readonly decline: (
    id: string
  ) => Effect.Effect<ReadonlyArray<AccessRequest>, Forbidden | NotFound | Conflict, Db | CurrentPrincipal>
}>()("modules/Access") {
  // A database that does not answer is a defect, as everywhere.
  static readonly layer = Layer.effect(
    Access,
    Effect.map(Effect.service(Relay), (relay) => {
      const run = <A, E, R>(effect: Effect.Effect<A, E | SqlError.SqlError, R>) =>
        effect.pipe(Effect.provideService(Relay, relay), Effect.catchIf(SqlError.isSqlError, Effect.die))
      return {
        mine: run(Requests.mine()),
        request: (input) => run(Requests.request(input)),
        withdraw: (id) => run(Requests.withdraw(id)),
        list: run(Requests.list()),
        grant: (id) => run(Requests.grant(id)),
        decline: (id) => run(Requests.decline(id))
      }
    })
  )
}
