import type { Db } from "@insyte/database/Db"
import type { Conflict, Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import type { Created, Roles, UpdateRole } from "./domain/Roles.ts"
import * as Use from "./use-cases/roles.ts"

type R = Db | CurrentPrincipal

const run = <A, E, Req>(effect: Effect.Effect<A, E | SqlError.SqlError, Req>) =>
  effect.pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))

/**
 * The roles slice (M3.2): Rollen's list and every change to a role, as the request's principal.
 *
 * @effect-expect-leaking Db CurrentPrincipal
 */
export class RolesService extends Context.Service<RolesService, {
  readonly list: Effect.Effect<Roles, Forbidden, R>
  readonly create: (
    input: { label: string; from: string | null }
  ) => Effect.Effect<Created, Forbidden | Invalid | NotFound, R>
  readonly update: (input: UpdateRole) => Effect.Effect<Roles, Forbidden | Invalid | NotFound | Conflict, R>
  readonly rename: (id: string, label: string) => Effect.Effect<Roles, Forbidden | Invalid | NotFound | Conflict, R>
  readonly reset: (id: string) => Effect.Effect<Roles, Forbidden | Invalid | NotFound | Conflict, R>
  readonly remove: (id: string, to: string) => Effect.Effect<Roles, Forbidden | Invalid | NotFound | Conflict, R>
  readonly restore: (id: string) => Effect.Effect<Roles, Forbidden | Invalid | NotFound, R>
}>()("modules/Roles") {
  // A database that does not answer is a defect, as everywhere.
  static readonly layer = Layer.sync(RolesService, () => {
    return {
      list: run(Use.list()),
      create: (input) => run(Use.create(input)),
      update: (input) => run(Use.update(input)),
      rename: (id, label) => run(Use.rename(id, label)),
      reset: (id) => run(Use.reset(id)),
      remove: (id, to) => run(Use.remove(id, to)),
      restore: (id) => run(Use.restore(id))
    }
  })
}
