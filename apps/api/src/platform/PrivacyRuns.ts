import { PrivacyRuns } from "@insyte/modules/privacy/domain/Ports"
import { env } from "cloudflare:workers"
import { Effect, Layer } from "effect"

/*
 * Je gegevens' runs (M17 step 5): an export's `PrivacyExportWorkflow` and a deletion's `WorkspaceLifecycleWorkflow`,
 * each named by its request and attempt, so a relay that delivers the request twice starts it once, and the request
 * asked for again (or restarted by the sweep) starts a run of its own.
 */
const started = (create: () => Promise<unknown>, get: () => Promise<unknown>) =>
  Effect.tryPromise(create).pipe(
    // Already started under this name: that instance is the run.
    Effect.catch(() => Effect.flatMap(Effect.tryPromise(get), () => Effect.void)),
    Effect.asVoid,
    Effect.orDie
  )

export const PrivacyRunsLive = Layer.succeed(PrivacyRuns)(PrivacyRuns.of({
  startExport: Effect.fn("PrivacyRuns.startExport")(function*(input) {
    yield* started(
      () => env.PRIVACY_EXPORT.create({ id: `${input.requestId}-${input.attempt}`, params: input }),
      () => env.PRIVACY_EXPORT.get(`${input.requestId}-${input.attempt}`)
    )
  }),
  startDeletion: Effect.fn("PrivacyRuns.startDeletion")(function*(input) {
    yield* started(
      () => env.WORKSPACE_LIFECYCLE.create({ id: `${input.requestId}-${input.attempt}`, params: input }),
      () => env.WORKSPACE_LIFECYCLE.get(`${input.requestId}-${input.attempt}`)
    )
  })
}))
