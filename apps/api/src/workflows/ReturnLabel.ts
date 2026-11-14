import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { abandonLabels, issueLabels } from "@insyte/modules/returns/use-cases/labels"
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep, type WorkflowStepConfig } from "cloudflare:workers"
import { Cause, Effect, Exit } from "effect"
import { syncRuntime as runtime } from "../platform/Ingest.ts"
import { Telemetry } from "../platform/Observability.ts"
import { withRequestDb } from "../platform/RequestDb.ts"
import { roomOf } from "../platform/Room.ts"

/*
 * Return labels (M9.2), once a request's undo window has passed: one durable step, retried while the carrier cannot be
 * reached; a label made is not made again. When it gives up, what is still asked for is marked failed. The workspace's
 * open tabs hear the returns changed.
 */

export interface ReturnLabelParams {
  readonly workspaceId: string
  readonly returnIds: ReadonlyArray<string>
}

const RETRY: WorkflowStepConfig = {
  retries: { limit: 6, delay: "10 seconds", backoff: "exponential" },
  timeout: "2 minutes"
}

export class ReturnLabelWorkflow extends WorkflowEntrypoint<Cloudflare.Env, ReturnLabelParams> {
  override async run(event: Readonly<WorkflowEvent<ReturnLabelParams>>, step: WorkflowStep) {
    const { workspaceId, returnIds } = event.payload
    let outcome: "issued" | "failed" = "issued"
    let labels: ReadonlyArray<{ id: string; outcome: string }> = []
    try {
      labels = await step.do("issue", RETRY, () => run(workspaceId, issueLabels(returnIds)))
    } catch {
      await step.do("abandon", RETRY, () => run(workspaceId, abandonLabels(returnIds)))
      outcome = "failed"
    }
    await roomOf(workspaceId).broadcast({ v: 1, type: "records.changed", kind: "return", ids: [...returnIds] })
    return { outcome, labels }
  }
}

/** One step's effect in the workspace, over a connection of its own. */
const run = async <A>(workspaceId: string, effect: Effect.Effect<A, unknown, unknown>): Promise<A> => {
  const program = withRequestDb(effect).pipe(
    Effect.provideService(CurrentWorkspace, { id: workspaceId as WorkspaceId }),
    // Said in the logs: a step the Workflow retries is otherwise silent.
    Effect.tapCause((cause) => Effect.logWarning("a return label step failed", { workspaceId, cause }))
  ) as Effect.Effect<A, unknown, never>
  const exit = await Telemetry.runExit(runtime, program)
  if (Exit.isSuccess(exit)) return exit.value
  throw Cause.squash(exit.cause)
}
