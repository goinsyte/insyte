import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { deletionDue, purgeWorkspace } from "@insyte/modules/privacy/Privacy"
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep, type WorkflowStepConfig } from "cloudflare:workers"
import { Cause, Effect, Exit } from "effect"
import { syncRuntime as runtime } from "../platform/Ingest.ts"
import { Telemetry } from "../platform/Observability.ts"
import { withRequestDb } from "../platform/RequestDb.ts"

/*
 * A workspace's deletion (M17 step 5; security.md §6): one run per request. It sleeps until the waiting period is
 * over, reads the request again (the owner may have stopped it), and only if it still waits purges the workspace:
 * tokens dropped, files removed, every row deleted. A purge step that fails is tried again; it finds less each time.
 */

export interface WorkspaceLifecycleParams {
  readonly workspaceId: string
  readonly requestId: string
}

const RETRY: WorkflowStepConfig = {
  retries: { limit: 10, delay: "1 minute", backoff: "exponential" },
  timeout: "10 minutes"
}

export class WorkspaceLifecycleWorkflow extends WorkflowEntrypoint<Cloudflare.Env, WorkspaceLifecycleParams> {
  override async run(event: Readonly<WorkflowEvent<WorkspaceLifecycleParams>>, step: WorkflowStep) {
    const { workspaceId, requestId } = event.payload
    const due = await step.do("due", RETRY, () => run(workspaceId, deletionDue(requestId)))
    if (due === null) return { outcome: "stopped" as const }
    // Already over when the run gets here (it started late, or was replayed after the wait): nothing to sleep out.
    if (due > Date.now()) await step.sleepUntil("waiting period", new Date(due))
    const purged = await step.do("purge", RETRY, () => run(workspaceId, purgeWorkspace(requestId)))
    return { outcome: purged ? "purged" as const : "stopped" as const }
  }
}

/** One step's effect in the workspace, over a connection of its own. */
const run = async <A>(workspaceId: string, effect: Effect.Effect<A, unknown, unknown>): Promise<A> => {
  const program = withRequestDb(effect).pipe(
    Effect.provideService(CurrentWorkspace, { id: workspaceId as WorkspaceId }),
    Effect.tapCause((cause) => Effect.logWarning("a workspace deletion step failed", { workspaceId, cause }))
  ) as Effect.Effect<A, unknown, never>
  const exit = await runtime.runPromiseExit(program).finally(() => Telemetry.flush())
  if (Exit.isSuccess(exit)) return exit.value
  throw Cause.squash(exit.cause)
}
