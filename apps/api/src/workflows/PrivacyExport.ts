import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { type ZipRecord } from "@insyte/modules/privacy/domain/Archive"
import {
  type Cursor,
  exportPage,
  failExport,
  finishExport,
  type Paged,
  planExport,
  type Stream
} from "@insyte/modules/privacy/Privacy"
import type { UploadedPart } from "@insyte/modules/shared/domain/Documents"
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep, type WorkflowStepConfig } from "cloudflare:workers"
import { Cause, Effect, Exit } from "effect"
import { syncRuntime as runtime } from "../platform/Ingest.ts"
import { Telemetry } from "../platform/Observability.ts"
import { withRequestDb } from "../platform/RequestDb.ts"
import { roomOf } from "../platform/Room.ts"

/*
 * A workspace export or a shopper's access package (M17 step 5), one run per request and attempt: plan the parts and
 * begin the file, then each part a page at a time on a durable step of its own (its rows deflated into the ZIP, which
 * goes to the bucket in parts as it grows), then the ZIP's directory and the file the request owns. A step that fails
 * is tried again and reads what its first try read; when the run gives up, the request is marked failed, what it had
 * written goes, and it can be asked for again. When it ends, the workspace's tabs read the requests again.
 *
 * This is the slice's own run until the data hub's `ExportWorkflow` (M14) is in; then the workspace export becomes
 * one of its sources, and this class goes.
 */

export interface PrivacyExportParams {
  readonly workspaceId: string
  readonly requestId: string
  readonly attempt: number
}

const RETRY: WorkflowStepConfig = {
  retries: { limit: 5, delay: "10 seconds", backoff: "exponential" },
  timeout: "5 minutes"
}

export class PrivacyExportWorkflow extends WorkflowEntrypoint<Cloudflare.Env, PrivacyExportParams> {
  override async run(event: Readonly<WorkflowEvent<PrivacyExportParams>>, step: WorkflowStep) {
    const { workspaceId, requestId, attempt } = event.payload
    const room = roomOf(workspaceId)
    let stream: Stream | null = null
    try {
      const plan = await step.do("plan", RETRY, () => run(workspaceId, planExport(requestId, attempt)))
      if (plan === null) return { outcome: "skipped" as const }
      stream = plan.stream
      const counts: Record<string, number> = {}
      const pages: Record<string, number> = {}
      const records: Array<ZipRecord> = []
      const uploaded: Array<UploadedPart> = []
      for (const part of plan.parts) {
        let cursor: Cursor = null
        let page = 1
        counts[part] = 0
        do {
          const at: { readonly part: string; readonly page: number; readonly cursor: Cursor; readonly stream: Stream } =
            { part, page, cursor, stream }
          const paged: Paged = await step.do(
            `${part}:${page}`,
            RETRY,
            () => run(workspaceId, exportPage(requestId, at))
          )
          counts[part] += paged.rows
          pages[part] = page
          records.push(...paged.records)
          uploaded.push(...paged.uploaded)
          stream = paged.stream
          cursor = paged.cursor
          page++
        } while (cursor !== null)
      }
      const done = { counts, pages, stream, records, uploaded }
      await step.do("finish", RETRY, () => run(workspaceId, finishExport(requestId, done)))
    } catch (error) {
      const left = stream
      await step.do("fail", RETRY, () => run(workspaceId, failExport(requestId, attempt, String(error), left)))
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
