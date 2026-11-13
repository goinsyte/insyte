import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import type { ExportPlan } from "@insyte/modules/shared/domain/Exports"
import { begin, type Begun, fail, finish, writePage } from "@insyte/modules/shared/use-cases/Exports"
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep, type WorkflowStepConfig } from "cloudflare:workers"
import { Cause, Effect, Exit } from "effect"
import { ExportSourcesLive } from "../platform/Exports.ts"
import { syncRuntime as runtime } from "../platform/Ingest.ts"
import { Telemetry } from "../platform/Observability.ts"
import { withRequestDb } from "../platform/RequestDb.ts"
import { roomOf } from "../platform/Room.ts"

/*
 * One export written (M14 step 5; api.md §3.2 `job.progress{ export }`), one run per `exports` row, whatever its source
 * (the registry in `platform/Exports.ts`): `begin` asks the source for its plan, then each page is a durable step of
 * its own, written to the bucket as a part, so an export of any size holds one page at a time and a page the Workflow
 * retries is written again in place; `finish` joins the parts into the file, keeps it for seven days and tells the
 * requester (a notification, `export.finished`). When a step gives up, the export is failed, its parts removed, the
 * requester told. After every page the workspace's tabs hear how far it got.
 */

export interface ExportParams {
  readonly workspaceId: string
  readonly exportId: string
}

const RETRY: WorkflowStepConfig = {
  retries: { limit: 5, delay: "5 seconds", backoff: "exponential" },
  timeout: "2 minutes"
}

/** Pages one export may have: past it, it fails rather than run on (a source that never ends). */
const MAX_PAGES = 500

/** What a page step hands on: the next page's cursor and the rows written so far. */
interface Written {
  readonly next: string | null
  readonly rows: number
  readonly written: number
}

export class ExportWorkflow extends WorkflowEntrypoint<Cloudflare.Env, ExportParams> {
  override async run(event: Readonly<WorkflowEvent<ExportParams>>, step: WorkflowStep) {
    const { workspaceId, exportId } = event.payload
    const room = roomOf(workspaceId)
    const told = (done: number, total: number | null, state: "running" | "ready" | "failed") =>
      room.broadcast({ v: 1, type: "job.progress", kind: "export", exportId, done, total, state })
    let parts = 0
    try {
      const begun: Begun = await step.do("begin", RETRY, () => run(workspaceId, begin(exportId)))
      if (begun.skip) return { outcome: "skipped" as const }
      const plan: ExportPlan = begun.plan
      await told(0, plan.total, "running")
      let cursor: string | null = null
      let written = 0
      do {
        if (parts >= MAX_PAGES) throw new Error(`more than ${MAX_PAGES} pages`)
        const n = parts
        const before = written
        const from: string | null = cursor
        const page: Written = await step.do(
          `page:${n}`,
          RETRY,
          () => run(workspaceId, writePage({ exportId, cursor: from, n, writtenBefore: before }))
        )
        parts = n + 1
        cursor = page.next
        written = page.written
        await told(written, plan.total, "running")
      } while (cursor !== null)
      const pages = parts
      await step.do("finish", RETRY, () => run(workspaceId, finish({ exportId, parts: pages, plan })))
      await told(written, plan.total, "ready")
      return { outcome: "ready" as const, rows: written }
    } catch (error) {
      const pages = parts
      await step.do("fail", RETRY, () => run(workspaceId, fail({ exportId, parts: pages, reason: String(error) })))
      await told(0, null, "failed")
      return { outcome: "failed" as const }
    }
  }
}

/** One step's effect in the workspace, over a connection of its own, with every source registered. */
const run = async <A>(workspaceId: string, effect: Effect.Effect<A, unknown, unknown>): Promise<A> => {
  const program = withRequestDb(effect).pipe(
    Effect.provide(ExportSourcesLive),
    Effect.provideService(CurrentWorkspace, { id: workspaceId as WorkspaceId }),
    Effect.tapCause((cause) => Effect.logWarning("an export step failed", { workspaceId, cause }))
  ) as Effect.Effect<A, unknown, never>
  const exit = await runtime.runPromiseExit(program).finally(() => Telemetry.flush())
  if (Exit.isSuccess(exit)) return exit.value
  throw Cause.squash(exit.cause)
}
