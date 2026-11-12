import type { Db } from "@insyte/database/Db"
import type { Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer, type Redacted } from "effect"
import { SqlError } from "effect/sql"
import type { SupplierApi } from "../forwarding/domain/Forwarding.ts"
import type { Sealer } from "../shared/domain/Sealer.ts"
import type { AssignInput, CreateInput, SetPausedInput, SupplierChange, UpdateInput } from "./domain/Commands.ts"
import type {
  MarkPaidInput,
  StatementChange,
  StatementDetail,
  StatementInput,
  StatementList,
  StatementsInput
} from "./domain/Statements.ts"
import type { ListInput, SupplierDetail, SupplierList } from "./domain/Suppliers.ts"
import * as Commands from "./use-cases/commands.ts"
import * as Integration from "./use-cases/integration.ts"
import * as Statements from "./use-cases/statements.ts"
import * as Suppliers from "./use-cases/suppliers.ts"

type R = Db | CurrentPrincipal
type A = R | Sealer | SupplierApi

/** "Verbinding testen": whether the supplier's API took a signed ping, and how fast. */
export interface PingOutcome {
  readonly ok: boolean
  readonly ms: number | null
  readonly reason: string | null
}

/**
 * The suppliers slice (M8.1): the workspace's suppliers with their standing, and the commands on them.
 *
 * @effect-expect-leaking Db CurrentPrincipal Sealer SupplierApi
 */
export class SuppliersService extends Context.Service<SuppliersService, {
  readonly list: (input: typeof ListInput.Type) => Effect.Effect<SupplierList, Forbidden, R>
  readonly get: (id: string) => Effect.Effect<SupplierDetail, Forbidden | NotFound, R>
  readonly create: (input: typeof CreateInput.Type) => Effect.Effect<SupplierChange, Forbidden | Invalid, R>
  readonly update: (input: typeof UpdateInput.Type) => Effect.Effect<SupplierChange, Forbidden | NotFound | Invalid, R>
  readonly setPaused: (input: typeof SetPausedInput.Type) => Effect.Effect<SupplierChange, Forbidden | NotFound, R>
  readonly assignProducts: (input: typeof AssignInput.Type) => Effect.Effect<SupplierChange, Forbidden | NotFound, R>
  readonly remove: (id: string) => Effect.Effect<SupplierChange, Forbidden | NotFound, R>
  readonly connectApi: (
    input: { readonly id: string; readonly url: string }
  ) => Effect.Effect<{ readonly secret: Redacted.Redacted<string> }, Forbidden | NotFound | Invalid, A>
  readonly disconnectApi: (id: string) => Effect.Effect<void, Forbidden | NotFound, R>
  readonly testConnection: (id: string) => Effect.Effect<PingOutcome, Forbidden | NotFound, A>
  /** A supplier's statements (M13 step 6), the running month first while it has lines. */
  readonly statements: (input: typeof StatementsInput.Type) => Effect.Effect<StatementList, Forbidden | NotFound, R>
  readonly statement: (input: typeof StatementInput.Type) => Effect.Effect<StatementDetail, Forbidden | NotFound, R>
  readonly markStatementPaid: (
    input: typeof MarkPaidInput.Type
  ) => Effect.Effect<StatementChange, Forbidden | NotFound, R>
}>()("modules/SuppliersService") {
  static readonly layer = Layer.succeed(SuppliersService, {
    list: (input) => Suppliers.list(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    get: (id) => Suppliers.get(id).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    create: (input) => Commands.create(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    update: (input) => Commands.update(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    setPaused: (input) => Commands.setPaused(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    assignProducts: (input) => Commands.assignProducts(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    remove: (id) => Commands.remove(id).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    connectApi: (input) => Integration.connectApi(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    disconnectApi: (id) => Integration.disconnectApi(id).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    testConnection: (id) => Integration.testConnection(id).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    statements: (input) => Statements.list(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    statement: (input) => Statements.get(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    markStatementPaid: (input) => Statements.markPaid(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))
  })
}
