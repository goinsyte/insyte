import type { Db } from "@insyte/database/Db"
import type { Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import type {
  CostChange,
  CostsFigures,
  CostsList,
  CreateInput,
  FiguresInput,
  KindChangeNotAllowed,
  ListInput,
  MonthOutOfRange,
  NotEditable,
  SetAmountInput,
  UpdateInput
} from "./domain/Costs.ts"
import type { AdSpend } from "./domain/Ports.ts"
import * as AdSpendSync from "./use-cases/ad-spend.ts"
import * as Commands from "./use-cases/commands.ts"
import * as Costs from "./use-cases/costs.ts"

type R = Db | CurrentPrincipal

/**
 * Kosten (M13 step 5): the cost lines with what each costs per month, the months' figures (revenue to net profit), and
 * every change the screen makes, each with an undo token. Reading needs Analyse · Bekijken; changing, `costs.write`.
 *
 * @effect-expect-leaking Db CurrentPrincipal
 */
export class CostsService extends Context.Service<CostsService, {
  readonly list: (input: typeof ListInput.Type) => Effect.Effect<CostsList, Forbidden | Invalid, R>
  readonly figures: (input: typeof FiguresInput.Type) => Effect.Effect<CostsFigures, Forbidden, R>
  readonly create: (
    input: typeof CreateInput.Type
  ) => Effect.Effect<CostChange, Forbidden | Invalid | MonthOutOfRange, R>
  readonly update: (
    input: typeof UpdateInput.Type
  ) => Effect.Effect<CostChange, Forbidden | Invalid | NotFound | KindChangeNotAllowed, R>
  readonly setAmount: (
    input: typeof SetAmountInput.Type
  ) => Effect.Effect<CostChange, Forbidden | Invalid | NotFound | NotEditable | MonthOutOfRange, R>
  readonly readFromSource: (id: string) => Effect.Effect<CostChange, Forbidden | NotFound | NotEditable, R>
  readonly remove: (id: string) => Effect.Effect<CostChange, Forbidden | NotFound, R>
}>()("modules/CostsService") {
  // A database that does not answer is a defect, as everywhere.
  static readonly layer = Layer.succeed(CostsService, {
    list: (input) => Costs.list(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    figures: (input) => Costs.figures(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    create: (input) => Commands.create(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    update: (input) => Commands.update(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    setAmount: (input) => Commands.setAmount(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    readFromSource: (id) => Commands.readFromSource(id).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    remove: (id) => Commands.remove(id).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))
  })
}

/** The daily sync's turn: every workspace with a connected ad account, one after another; how many day rows. */
export const syncAdSpend = (now?: Date): Effect.Effect<number, never, Db | AdSpend> =>
  Effect.gen(function*() {
    let written = 0
    for (const workspaceId of yield* AdSpendSync.syncWorkspaces) {
      written += yield* AdSpendSync.syncWorkspace(workspaceId, now)
    }
    return written
  }).pipe(Effect.orDie)
