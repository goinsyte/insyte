import { CurrentWorkspace } from "@insyte/domain/Principal"
import { importSource, ordersSource, purgeImports } from "@insyte/modules/data/Data"
import { ImportParses } from "@insyte/modules/data/domain/Ports"
import { ExportRuns, type ExportSource, ExportSources } from "@insyte/modules/shared/domain/Exports"
import { dueWorkspaces, expireIn } from "@insyte/modules/shared/use-cases/Exports"
import { env } from "cloudflare:workers"
import { Effect, Layer } from "effect"

/*
 * The Data hub's jobs (M14 step 5): the export sources the `ExportWorkflow` writes from, and starting its runs and an
 * uploaded CSV's `ImportParseWorkflow`, each named by its row, so a relay that delivers the request twice starts one.
 *
 * A slice that offers an export adds its `ExportSource` to `SOURCES`, one line, and asks with `Exports.request`
 * (`@insyte/modules/shared/use-cases/Exports`).
 */

const SOURCES: ReadonlyArray<ExportSource> = [ordersSource, importSource]

export const ExportSourcesLive = Layer.succeed(ExportSources)(new Map(SOURCES.map((s) => [s.name, s])))

/** A Workflow instance by name; one already started under it is that run. */
const started = (create: () => Promise<unknown>, existing: () => Promise<unknown>) =>
  Effect.tryPromise(create).pipe(
    Effect.catch(() => Effect.flatMap(Effect.tryPromise(existing), () => Effect.void)),
    Effect.asVoid,
    Effect.orDie
  )

export const ExportRunsLive = Layer.succeed(ExportRuns)(ExportRuns.of({
  start: Effect.fn("ExportRuns.start")(function*(input) {
    yield* started(
      () => env.EXPORT.create({ id: input.exportId, params: input }),
      () => env.EXPORT.get(input.exportId)
    )
  })
}))

export const ImportParsesLive = Layer.succeed(ImportParses)(ImportParses.of({
  start: Effect.fn("ImportParses.start")(function*(input) {
    yield* started(
      () => env.IMPORT_PARSE.create({ id: input.importId, params: input }),
      () => env.IMPORT_PARSE.get(input.importId)
    )
  })
}))

/**
 * The Data hub's nightly sweep (M14 step 5), at 03:00 UTC, in each workspace with something for it: exports past their
 * seven days emptied and expired, exports stuck for a day failed, folders a refused delete left behind emptied
 * (`Exports.expireIn`); removed imports and files never imported purged (`Data.purgeImports`). One workspace that fails
 * is logged and left for the next night; the others go on.
 */
export const exportSweep = Effect.fn("Exports.sweep")(
  function*() {
    for (const workspaceId of yield* dueWorkspaces) {
      yield* Effect.all([expireIn(), purgeImports()], { discard: true }).pipe(
        Effect.provideService(CurrentWorkspace, { id: workspaceId }),
        Effect.catchCause((cause) => Effect.logWarning("the data sweep failed in a workspace", { workspaceId, cause }))
      )
    }
  },
  Effect.orDie
)
