import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { failExport, finishExport, planExport, writePart } from "@insyte/modules/privacy/Privacy"
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep, type WorkflowStepConfig } from "cloudflare:workers"
import { Cause, Effect, Exit } from "effect"
import { syncRuntime as runtime } from "../platform/Ingest.ts"
import { Telemetry } from "../platform/Observability.ts"
import { withRequestDb } from "../platform/RequestDb.ts"
import { roomOf } from "../platform/Room.ts"

/*
 * A workspace export or a shopper's access package (M17 step 5), one run per request: which parts the file is made
 * of, then each part on a durable step of its own (its rows, as JSON and CSV in the bucket), then the parts zipped
 * into one file the request owns. A step that fails is tried again; when the run gives up, the request is marked
 * failed and can be asked for again. When it ends, the workspace's tabs read the requests again.
 *
 * This is the slice's own run until the data hub's `ExportWorkflow` (M14) is in; then the workspace export becomes
 * one of its sources, and this class goes.
 */

export interface PrivacyExportParams {
  readonly workspaceId: string
  readonly requestId: string
}

const RETRY: WorkflowStepConfig = {
  retries: { limit: 5, delay: "10 seconds", backoff: "exponential" },
  timeout: "5 minutes"
}

export class PrivacyExportWorkflow extends WorkflowEntrypoint<Cloudflare.Env, PrivacyExportParams> {
  override async run(event: Readonly<WorkflowEvent<PrivacyExportParams>>, step: WorkflowStep) {
    const { workspaceId, requestId } = event.payload
    const room = roomOf(workspaceId)
    try {
      const parts: ReadonlyArray<string> = await step.do("plan", RETRY, () => run(workspaceId, planExport(requestId)))
      if (parts.length === 0) return { outcome: "skipped" as const }
      const counts: Record<string, number> = {}
      for (const part of parts) {
        counts[part] = await step.do(`part:${part}`, RETRY, () => run(workspaceId, writePart(requestId, part)))
      }
      await step.do("finish", RETRY, () => run(workspaceId, finishExport(requestId, counts)))
    } catch (error) {
      await step.do("fail", RETRY, () => run(workspaceId, failExport(requestId, String(error))))
      await room.broadcast({ v: 1, type: "records.changed", kind: "gdpr_request", ids: [requestId] })
      return { outcome: "failed" as const }
    }
    await room.broadcast({ v: 1, type: "records.changed", kind: "gdpr_request", ids: [requestId] })
    return { outcome: "ready" as const }
  }
}

/** One step's effect in the workspace, over a connection of its own. */
const run = async <A>(workspaceId: string, effect: Effect.Effect<A, unknown, unknown>): Promise<A> => {
  const program = withRequestDb(effect).pipe(
    Effect.provideService(CurrentWorkspace, { id: workspaceId as WorkspaceId }),
    Effect.tapCause((cause) => Effect.logWarning("a privacy export step failed", { workspaceId, cause }))
  ) as Effect.Effect<A, unknown, never>
  const exit = await runtime.runPromiseExit(program).finally(() => Telemetry.flush())
  if (Exit.isSuccess(exit)) return exit.value
  throw Cause.squash(exit.cause)
}
