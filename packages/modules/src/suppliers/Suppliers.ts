import type { Db } from "@insyte/database/Db"
import type { Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import type { AssignInput, CreateInput, SetPausedInput, SupplierChange, UpdateInput } from "./domain/Commands.ts"
import type { ListInput, SupplierDetail, SupplierList } from "./domain/Suppliers.ts"
import * as Commands from "./use-cases/commands.ts"
import * as Suppliers from "./use-cases/suppliers.ts"

type R = Db | CurrentPrincipal

/**
 * The suppliers slice (M8.1): the workspace's suppliers with their standing, and the commands on them.
 *
 * @effect-expect-leaking Db CurrentPrincipal
 */
export class SuppliersService extends Context.Service<SuppliersService, {
  readonly list: (input: typeof ListInput.Type) => Effect.Effect<SupplierList, Forbidden, R>
  readonly get: (id: string) => Effect.Effect<SupplierDetail, Forbidden | NotFound, R>
  readonly create: (input: typeof CreateInput.Type) => Effect.Effect<SupplierChange, Forbidden | Invalid, R>
  readonly update: (input: typeof UpdateInput.Type) => Effect.Effect<SupplierChange, Forbidden | NotFound | Invalid, R>
  readonly setPaused: (input: typeof SetPausedInput.Type) => Effect.Effect<SupplierChange, Forbidden | NotFound, R>
  readonly assignProducts: (input: typeof AssignInput.Type) => Effect.Effect<SupplierChange, Forbidden | NotFound, R>
  readonly remove: (id: string) => Effect.Effect<SupplierChange, Forbidden | NotFound, R>
}>()("modules/SuppliersService") {
  static readonly layer = Layer.succeed(SuppliersService, {
    list: (input) => Suppliers.list(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    get: (id) => Suppliers.get(id).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    create: (input) => Commands.create(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    update: (input) => Commands.update(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    setPaused: (input) => Commands.setPaused(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    assignProducts: (input) => Commands.assignProducts(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    remove: (id) => Commands.remove(id).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))
  })
}
