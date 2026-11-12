import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { attempt, type Attempted } from "@insyte/modules/developer/use-cases/deliveries"
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep, type WorkflowStepConfig } from "cloudflare:workers"
import { Cause, Effect, Exit } from "effect"
import { syncRuntime as runtime } from "../platform/Ingest.ts"
import { Telemetry } from "../platform/Observability.ts"
import { withRequestDb } from "../platform/RequestDb.ts"
import { roomOf } from "../platform/Room.ts"

/*
 * A webhook delivery's attempts (M19.4): one durable step per attempt, then a sleep until the next one the retry
 * schedule allows (1 m, 10 m, 1 h, … 72 h), until it is delivered, out of attempts, or cancelled. A step is retried only
 * when it could not run (the database, the resolver not answering, a delivery not found); what the endpoint answered is
 * the attempt's result, never a throw. A run that gives up or dies leaves its delivery open, and the minute sweep
 * re-arms it with a run of the next number (`run`); this one, if it ever wakes, finds itself stale and sends nothing.
 * The workspace's open tabs hear the endpoint changed after each attempt, as a step of its own that never fails.
 */

export interface WebhookDeliveryParams {
  readonly workspaceId: string
  readonly deliveryId: string
  /** The delivery's run number (`webhook_deliveries.runs`); 0 for the first. */
  readonly run?: number
}

const ATTEMPT: WorkflowStepConfig = {
  retries: { limit: 6, delay: "2 seconds", backoff: "exponential" },
  timeout: "1 minute"
}

/** Eight attempts at most (the longest policy); a bound so the loop's step names are fixed. */
const MAX_STEPS = 8

export class WebhookDeliveryWorkflow extends WorkflowEntrypoint<Cloudflare.Env, WebhookDeliveryParams> {
  override async run(event: Readonly<WorkflowEvent<WebhookDeliveryParams>>, step: WorkflowStep) {
    const { workspaceId, deliveryId } = event.payload
    const number = event.payload.run ?? 0
    let last: Attempted = { next: null }
    for (let n = 1; n <= MAX_STEPS; n++) {
      last = await step.do(`attempt ${n}`, ATTEMPT, async () => {
        const result = await run(workspaceId, attempt(deliveryId, number))
        // Not found (its transaction not visible yet, or gone): try the step again shortly.
        if (result.missing === true) throw new Error(`delivery ${deliveryId} not found`)
        return result
      })
      const endpointId = last.endpointId
      if (endpointId !== undefined && last.stale !== true) {
        await step.do(`tell ${n}`, async () => {
          await roomOf(workspaceId).broadcast({
            v: 1,
            type: "records.changed",
            kind: "webhook_endpoint",
            ids: [endpointId]
          })
            .catch(() => undefined)
          return true
        })
      }
      if (last.next === null) break
      await step.sleep(`wait ${n}`, Math.max(1000, last.next - Date.now()))
    }
    return { deliveryId, outcome: last.outcome ?? null, status: last.status ?? null }
  }
}

/** One step's effect in the workspace, over a connection of its own. */
const run = async <A>(workspaceId: string, effect: Effect.Effect<A, unknown, unknown>): Promise<A> => {
  const program = withRequestDb(effect).pipe(
    Effect.provideService(CurrentWorkspace, { id: workspaceId as WorkspaceId })
  ) as Effect.Effect<A, unknown, never>
  const exit = await runtime.runPromiseExit(program).finally(() => Telemetry.flush())
  if (Exit.isSuccess(exit)) return exit.value
  throw Cause.squash(exit.cause)
}
