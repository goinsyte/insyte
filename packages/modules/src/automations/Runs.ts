import type { Db } from "@insyte/database/Db"
import type { Conflict, Forbidden, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import { AutomationRuns } from "./domain/Ports.ts"
import type {
  RunChange,
  RunDecideInput,
  RunDetail,
  RunList,
  RunListInput,
  RunRecord,
  RunRecordsInput,
  RunStartInput,
  RunStats,
  RunStatsInput
} from "./domain/Runs.ts"
import * as Runs from "./use-cases/runs.ts"

type R = Db | CurrentPrincipal

/**
 * A flow's runs (M12 step 5): the Runs tab, Geschiedenis and Overzicht read them; "Opnieuw", stopping a run, the
 * answer to "Goedkeuring vragen" and a run started by hand (`/v1`, MCP) reach the run's Workflow through
 * `AutomationRuns`, taken once here.
 *
 * @effect-expect-leaking Db CurrentPrincipal
 */
export class RunsService extends Context.Service<RunsService, {
  readonly list: (input: typeof RunListInput.Type) => Effect.Effect<RunList, Forbidden, R>
  readonly get: (id: string) => Effect.Effect<RunDetail, Forbidden | NotFound, R>
  readonly stats: (input: typeof RunStatsInput.Type) => Effect.Effect<RunStats, Forbidden | NotFound, R>
  readonly records: (
    input: typeof RunRecordsInput.Type
  ) => Effect.Effect<ReadonlyArray<RunRecord>, Forbidden | NotFound, R>
  readonly rerun: (id: string) => Effect.Effect<RunChange, Forbidden | NotFound | Conflict, R>
  readonly cancel: (id: string) => Effect.Effect<RunChange, Forbidden | NotFound | Conflict, R>
  readonly approve: (input: typeof RunDecideInput.Type) => Effect.Effect<RunChange, Forbidden | NotFound | Conflict, R>
  readonly decline: (input: typeof RunDecideInput.Type) => Effect.Effect<RunChange, Forbidden | NotFound | Conflict, R>
  readonly start: (input: typeof RunStartInput.Type) => Effect.Effect<RunDetail, Forbidden | NotFound | Conflict, R>
}>()("modules/RunsService") {
  // A database that does not answer is a defect, as everywhere.
  static readonly layer = Layer.effect(
    RunsService,
    Effect.map(Effect.service(AutomationRuns), (starter) => {
      const run = <A, E, Req>(effect: Effect.Effect<A, E | SqlError.SqlError, Req>) =>
        effect.pipe(Effect.provideService(AutomationRuns, starter), Effect.catchIf(SqlError.isSqlError, Effect.die))
      return {
        list: (input) => run(Runs.list(input)),
        get: (id) => run(Runs.get(id)),
        stats: (input) => run(Runs.stats(input)),
        records: (input) => run(Runs.records(input)),
        rerun: (id) => run(Runs.rerun(id)),
        cancel: (id) => run(Runs.cancel(id)),
        approve: (input) => run(Runs.approve(input)),
        decline: (input) => run(Runs.decline(input)),
        start: (input) => run(Runs.start(input))
      }
    })
  )
}
