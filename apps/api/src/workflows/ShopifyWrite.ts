import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import type { OrderWrite, WriteOutcome } from "@insyte/modules/orders/domain/WriteBack"
import { refundFailed, writeBack } from "@insyte/modules/orders/use-cases/write-back"
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep, type WorkflowStepConfig } from "cloudflare:workers"
import { Cause, Effect, Exit } from "effect"
import { syncRuntime as runtime } from "../platform/Ingest.ts"
import { Telemetry } from "../platform/Observability.ts"
import { withRequestDb } from "../platform/RequestDb.ts"
import { roomOf } from "../platform/Room.ts"

/*
 * An order change to Shopify (M7.1), once the undo window has passed: a durable step per order, so a bulk change of
 * fifty orders that Shopify throttles halfway resumes where it stopped and sends none twice. A step that keeps
 * failing (Shopify unreachable) gives up after its retries; the others still go, and a refund that never got there is
 * failed. Where Shopify refused, the order was read again, and the workspace's tabs hear it; a refund always.
 */

export interface ShopifyWriteParams {
  readonly workspaceId: string
  readonly write: OrderWrite
}

const RETRY: WorkflowStepConfig = {
  retries: { limit: 6, delay: "5 seconds", backoff: "exponential" },
  timeout: "1 minute"
}

export class ShopifyWriteWorkflow extends WorkflowEntrypoint<Cloudflare.Env, ShopifyWriteParams> {
  override async run(event: Readonly<WorkflowEvent<ShopifyWriteParams>>, step: WorkflowStep) {
    const { workspaceId, write } = event.payload
    const outcomes: Array<WriteOutcome> = []
    for (const orderId of write.orderIds) {
      try {
        outcomes.push(await step.do(`order ${orderId}`, RETRY, () => run(workspaceId, writeBack(write, orderId))))
      } catch {
        if (write.type === "refund.requested") {
          await step.do(
            `refund failed ${orderId}`,
            RETRY,
            () => run(workspaceId, refundFailed(write.refundId, orderId, "unreachable"))
          )
        }
        outcomes.push({ orderId, outcome: "skipped", reason: "unreachable" })
      }
    }
    // A refund changes the order whatever became of it; another change only where Shopify refused it.
    const changed = outcomes.filter((o) => write.type === "refund.requested" || o.outcome === "refused")
    if (changed.length > 0) {
      await roomOf(workspaceId).broadcast({
        v: 1,
        type: "records.changed",
        kind: "order",
        ids: changed.map((o) => o.orderId)
      })
    }
    return outcomes
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
