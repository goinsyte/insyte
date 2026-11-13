import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { type ExportPlan, maxPagesOf } from "@insyte/modules/shared/domain/Exports"
import { begin, type Begun, clearParts, fail, finish, writePage } from "@insyte/modules/shared/use-cases/Exports"
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep, type WorkflowStepConfig } from "cloudflare:workers"
import { Cause, Effect, Exit } from "effect"
import { ExportSourcesLive } from "../platform/Exports.ts"
import { syncRuntime as runtime } from "../platform/Ingest.ts"
import { Telemetry } from "../platform/Observability.ts"
import { withRequestDb } from "../platform/RequestDb.ts"
import { roomOf } from "../platform/Room.ts"

/*
 * One export written (M14 step 5; api.md §3.2 `job.progress{ export }`), one run per `exports` row, whatever its source
 * (the registry in `platform/Exports.ts`): `begin` asks the source for its plan (and refuses one over
 * `EXPORT_MAX_ROWS`), then each page is a durable step of its own, written to the bucket as a part, so an export of any
 * size holds one page at a time and a page the Workflow retries is written again in place; `finish` joins the parts
 * into the file, keeps it for seven days and tells the requester (a notification, `export.finished`), and `clear`
 * then takes the parts away. When a step gives up, the export is failed, its folder emptied, the requester told.
 * After every page the workspace's tabs hear how far it got; that is best effort, and never fails the export.
 */

export interface ExportParams {
  readonly workspaceId: string
  readonly exportId: string
}

const RETRY: WorkflowStepConfig = {
  retries: { limit: 5, delay: "5 seconds", backoff: "exponential" },
  timeout: "2 minutes"
}

/** What a page step hands on: the next page's cursor, the rows written so far and the part's size. */
interface Written {
  readonly next: string | null
  readonly rows: number
  readonly written: number
  readonly size: number
}

export class ExportWorkflow extends WorkflowEntrypoint<Cloudflare.Env, ExportParams> {
  override async run(event: Readonly<WorkflowEvent<ExportParams>>, step: WorkflowStep) {
    const { workspaceId, exportId } = event.payload
    const room = roomOf(workspaceId)
    const told = (done: number, total: number | null, state: "running" | "ready" | "failed") =>
      room.broadcast({ v: 1, type: "job.progress", kind: "export", exportId, done, total, state }).catch(() =>
        undefined
      )
    const failed = async (reason: string) => {
      await step.do("fail", RETRY, () => run(workspaceId, fail({ exportId, reason })))
      await told(0, null, "failed")
      return { outcome: "failed" as const }
    }
    let ready = false
    try {
      const begun: Begun = await step.do("begin", RETRY, () => run(workspaceId, begin(exportId)))
      if (begun.skip) return { outcome: "skipped" as const }
      if (begun.refused !== undefined) return await failed(begun.refused)
      const plan: ExportPlan = begun.plan
      const maxPages = maxPagesOf(plan)
      await told(0, plan.total, "running")
      let cursor: string | null = null
      let written = 0
      const sizes: Array<number> = []
      do {
        // A source that never ends: no plan holds more pages than this.
        if (sizes.length >= maxPages) throw new Error(`more than ${maxPages} pages`)
        const n = sizes.length
        const before = written
        const from: string | null = cursor
        const page: Written = await step.do(
          `page:${n}`,
          RETRY,
          () => run(workspaceId, writePage({ exportId, cursor: from, n, writtenBefore: before }))
        )
        sizes.push(page.size)
        cursor = page.next
        written = page.written
        await told(written, plan.total, "running")
      } while (cursor !== null)
      await step.do("finish", RETRY, () => run(workspaceId, finish({ exportId, sizes, plan })))
      ready = true
      await told(written, plan.total, "ready")
      // The file is the export's now; the parts go after. If this gives up, the nightly sweep takes them.
      await step.do("clear", RETRY, () => run(workspaceId, clearParts(exportId))).catch(() => undefined)
      return { outcome: "ready" as const, rows: written }
    } catch (error) {
      if (ready) return { outcome: "ready" as const }
      return await failed(String(error))
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
