import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { abandon, send } from "@insyte/modules/marketing/use-cases/klaviyo"
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep, type WorkflowStepConfig } from "cloudflare:workers"
import { Cause, Effect, Exit } from "effect"
import { syncRuntime as runtime } from "../platform/Ingest.ts"
import { Telemetry } from "../platform/Observability.ts"
import { withRequestDb } from "../platform/RequestDb.ts"
import { roomOf } from "../platform/Room.ts"

/*
 * A marketing sync's send (M7.5), once the undo window has passed: one durable step, retried while Klaviyo cannot be
 * reached. Klaviyo's own refusal is final and recorded on the sync. The customers sent hear it, so their profiles show
 * the list.
 */

export interface MarketingSyncParams {
  readonly workspaceId: string
  readonly syncId: string
}

const RETRY: WorkflowStepConfig = {
  retries: { limit: 6, delay: "10 seconds", backoff: "exponential" },
  timeout: "2 minutes"
}

export class MarketingSyncWorkflow extends WorkflowEntrypoint<Cloudflare.Env, MarketingSyncParams> {
  override async run(event: Readonly<WorkflowEvent<MarketingSyncParams>>, step: WorkflowStep) {
    const { workspaceId, syncId } = event.payload
    let outcome: Awaited<ReturnType<typeof runSend>>
    try {
      outcome = await step.do("send", RETRY, () => runSend(workspaceId, syncId))
    } catch {
      await step.do("abandon", RETRY, () => run(workspaceId, abandon(syncId)))
      return { syncId, outcome: "failed" as const, reason: "unreachable" }
    }
    if (outcome.outcome === "sent" && "customerIds" in outcome) {
      await roomOf(workspaceId).broadcast({ v: 1, type: "records.changed", kind: "customer", ids: outcome.customerIds })
    }
    return outcome
  }
}

const runSend = (workspaceId: string, syncId: string) => run(workspaceId, send(syncId))

/** One step's effect in the workspace, over a connection of its own. */
const run = async <A>(workspaceId: string, effect: Effect.Effect<A, unknown, unknown>): Promise<A> => {
  const program = withRequestDb(effect).pipe(
    Effect.provideService(CurrentWorkspace, { id: workspaceId as WorkspaceId })
  ) as Effect.Effect<A, unknown, never>
  const exit = await Telemetry.runExit(runtime, program)
  if (Exit.isSuccess(exit)) return exit.value
  throw Cause.squash(exit.cause)
}
