import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { abandon, send } from "@insyte/modules/forwarding/use-cases/send"
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep, type WorkflowStepConfig } from "cloudflare:workers"
import { Cause, Effect, Exit } from "effect"
import { syncRuntime as runtime } from "../platform/Ingest.ts"
import { Telemetry } from "../platform/Observability.ts"
import { withRequestDb } from "../platform/RequestDb.ts"
import { roomOf } from "../platform/Room.ts"

/*
 * A forward's delivery (M8.2), once its undo window has passed: one durable step, retried while a supplier's endpoint
 * (or the mail) cannot be reached; a leg that went is not sent again. When it gives up, what is still waiting is marked
 * `send_failed`. The workspace's open tabs hear the legs changed.
 */

export interface ForwardSendParams {
  readonly workspaceId: string
  readonly legIds: ReadonlyArray<string>
}

const RETRY: WorkflowStepConfig = {
  retries: { limit: 6, delay: "10 seconds", backoff: "exponential" },
  timeout: "2 minutes"
}

export class ForwardSendWorkflow extends WorkflowEntrypoint<Cloudflare.Env, ForwardSendParams> {
  override async run(event: Readonly<WorkflowEvent<ForwardSendParams>>, step: WorkflowStep) {
    const { workspaceId, legIds } = event.payload
    let outcome: "sent" | "failed" = "sent"
    let legs: ReadonlyArray<{ id: string; outcome: string }> = []
    try {
      legs = await step.do("send", RETRY, () => run(workspaceId, send(legIds)))
    } catch {
      await step.do("abandon", RETRY, () => run(workspaceId, abandon(legIds)))
      outcome = "failed"
    }
    await roomOf(workspaceId).broadcast({ v: 1, type: "records.changed", kind: "forwarding_item", ids: [...legIds] })
    return { outcome, legs }
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
