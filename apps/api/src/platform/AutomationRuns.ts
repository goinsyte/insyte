import { AutomationRuns } from "@insyte/modules/automations/domain/Ports"
import { env } from "cloudflare:workers"
import { Effect, Layer } from "effect"

/*
 * A flow's runs on Cloudflare Workflows (M12 step 3): one `AutomationRunWorkflow` instance per run, named by the run, so
 * a relay that delivers the trigger twice starts it once; an answer to "Goedkeuring vragen" as the event the run's
 * approval step waits for; and a cancelled run's instance ended.
 */
export const AutomationRunsLive = Layer.succeed(AutomationRuns)(AutomationRuns.of({
  start: Effect.fn("AutomationRuns.start")(function*(input) {
    yield* Effect.tryPromise(() =>
      env.AUTOMATION_RUN.create({ id: input.runId, params: { workspaceId: input.workspaceId, runId: input.runId } })
    ).pipe(
      // Already started under this name: that instance is the run.
      Effect.catch(() =>
        Effect.flatMap(Effect.tryPromise(() => env.AUTOMATION_RUN.get(input.runId)), () => Effect.void)
      ),
      Effect.orDie
    )
  }),
  decide: Effect.fn("AutomationRuns.decide")(function*(input) {
    yield* Effect.tryPromise(async () => {
      const instance = await env.AUTOMATION_RUN.get(input.runId)
      await instance.sendEvent({
        type: `approval-${input.nodeId}`,
        payload: { approved: input.approved, by: input.by }
      })
    }).pipe(Effect.orDie)
  }),
  cancel: Effect.fn("AutomationRuns.cancel")(function*(input) {
    yield* Effect.tryPromise(async () => {
      const instance = await env.AUTOMATION_RUN.get(input.runId)
      await instance.terminate()
    }).pipe(
      // Already finished, or never started: the run's row says it stopped either way.
      Effect.ignore
    )
  })
}))
