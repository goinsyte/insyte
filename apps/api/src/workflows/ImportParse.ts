import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { parse, type ParseOutcome } from "@insyte/modules/data/Data"
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep, type WorkflowStepConfig } from "cloudflare:workers"
import { Cause, Effect, Exit } from "effect"
import { syncRuntime as runtime } from "../platform/Ingest.ts"
import { Telemetry } from "../platform/Observability.ts"
import { withRequestDb } from "../platform/RequestDb.ts"
import { roomOf } from "../platform/Room.ts"

/*
 * An uploaded CSV read into rows (M14 step 5), one run per import: one durable step that reads the file and writes its
 * rows in batches, the workspace's tabs told how far it got (`job.progress{ import_parse }`) and, once it is over,
 * that the import changed. A step that fails (the bucket away, the database busy) is tried again from the start of
 * the rows.
 */

export interface ImportParseParams {
  readonly workspaceId: string
  readonly importId: string
}

const RETRY: WorkflowStepConfig = {
  retries: { limit: 4, delay: "10 seconds", backoff: "exponential" },
  timeout: "5 minutes"
}

export class ImportParseWorkflow extends WorkflowEntrypoint<Cloudflare.Env, ImportParseParams> {
  override async run(event: Readonly<WorkflowEvent<ImportParseParams>>, step: WorkflowStep) {
    const { workspaceId, importId } = event.payload
    const room = roomOf(workspaceId)
    const told = (done: number, total: number) =>
      Effect.promise(() => room.broadcast({ v: 1, type: "job.progress", kind: "import_parse", importId, done, total }))
    const outcome: ParseOutcome = await step.do("parse", RETRY, () => run(workspaceId, parse(importId, told)))
    if (outcome.state !== "skipped") {
      const rows = outcome.state === "parsed" ? outcome.rows : 0
      await room.broadcast({
        v: 1,
        type: "job.progress",
        kind: "import_parse",
        importId,
        done: rows,
        total: rows,
        state: outcome.state
      })
      await room.broadcast({ v: 1, type: "records.changed", kind: "import", ids: [importId] })
    }
    return { outcome: outcome.state }
  }
}

/** One step's effect in the workspace, over a connection of its own. */
const run = async <A>(workspaceId: string, effect: Effect.Effect<A, unknown, unknown>): Promise<A> => {
  const program = withRequestDb(effect).pipe(
    Effect.provideService(CurrentWorkspace, { id: workspaceId as WorkspaceId }),
    Effect.tapCause((cause) => Effect.logWarning("an import parse step failed", { workspaceId, cause }))
  ) as Effect.Effect<A, unknown, never>
  const exit = await runtime.runPromiseExit(program).finally(() => Telemetry.flush())
  if (Exit.isSuccess(exit)) return exit.value
  throw Cause.squash(exit.cause)
}
