import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import {
  type AnalysisContext,
  begin,
  fail,
  finish,
  readOrders,
  readPolicies,
  readProducts
} from "@insyte/modules/first-analysis/use-cases/analysis"
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep, type WorkflowStepConfig } from "cloudflare:workers"
import { Cause, Effect, Exit } from "effect"
import { syncRuntime as runtime } from "../platform/Ingest.ts"
import { Telemetry } from "../platform/Observability.ts"
import { withRequestDb } from "../platform/RequestDb.ts"
import { roomOf } from "../platform/Room.ts"

/*
 * A store's first analysis (M6.5): read the mirror's orders, then its product pages, then Shopify's countries and
 * policies, then work out the early read. Every step is durable and ticks its read off; after each the workspace's
 * tabs hear `records.changed {first_analysis}` and the step reads the analysis again. When the retries are spent the
 * analysis says it failed rather than reading forever.
 */

export interface AnalysisParams {
  readonly workspaceId: string
  readonly analysisId: string
}

const RETRY: WorkflowStepConfig = {
  retries: { limit: 5, delay: "5 seconds", backoff: "exponential" },
  timeout: "2 minutes"
}

export class FirstAnalysisWorkflow extends WorkflowEntrypoint<Cloudflare.Env, AnalysisParams> {
  override async run(event: Readonly<WorkflowEvent<AnalysisParams>>, step: WorkflowStep) {
    const { workspaceId, analysisId } = event.payload
    const exec = <A>(effect: Effect.Effect<A, unknown, unknown>) => run(workspaceId, effect)
    const changed = () =>
      roomOf(workspaceId).broadcast({ v: 1, type: "records.changed", kind: "first_analysis", ids: [analysisId] })

    const ctx: AnalysisContext | null = await step.do("begin", RETRY, () => exec(begin(analysisId)))
    // The store went away before the reading began: nothing to read.
    if (ctx === null) return null
    try {
      await step.do("orders", RETRY, () => exec(readOrders(ctx)))
      await changed()
      await step.do("products", RETRY, () => exec(readProducts(ctx)))
      await changed()
      await step.do("policies", RETRY, () => exec(readPolicies(ctx)))
      await changed()
      await step.do("finish", RETRY, () => exec(finish(ctx)))
      await changed()
      return analysisId
    } catch (error) {
      await step.do("fail", RETRY, () => exec(fail(analysisId)))
      await changed()
      throw error
    }
  }
}

/** One step's effect in the store's workspace, over a connection of its own. */
const run = async <A>(workspaceId: string, effect: Effect.Effect<A, unknown, unknown>): Promise<A> => {
  const program = withRequestDb(effect).pipe(
    Effect.provideService(CurrentWorkspace, { id: workspaceId as WorkspaceId })
  ) as Effect.Effect<A, unknown, never>
  const exit = await Telemetry.runExit(runtime, program)
  if (Exit.isSuccess(exit)) return exit.value
  throw Cause.squash(exit.cause)
}
