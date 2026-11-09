import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { refundFailed, writeBack } from "@insyte/modules/orders/use-cases/write-back"
import { productWriteBack } from "@insyte/modules/products/use-cases/write-back"
import type { ShopifyWrite, WriteOutcome } from "@insyte/modules/shared/domain/ShopifyWrites"
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep, type WorkflowStepConfig } from "cloudflare:workers"
import { Cause, Effect, Exit } from "effect"
import { syncRuntime as runtime } from "../platform/Ingest.ts"
import { Telemetry } from "../platform/Observability.ts"
import { withRequestDb } from "../platform/RequestDb.ts"
import { roomOf } from "../platform/Room.ts"

/*
 * A change made in Insyte to Shopify (M7), once the undo window has passed: a durable step per order or product, so a
 * bulk change of fifty that Shopify throttles halfway resumes where it stopped and sends none twice. A step that keeps
 * failing (Shopify unreachable) gives up after its retries; the others still go, and a refund that never got there is
 * failed. Where Shopify refused, the record was read again, and the workspace's tabs hear it; a refund always.
 */

export interface ShopifyWriteParams {
  readonly workspaceId: string
  readonly write: ShopifyWrite
}

const RETRY: WorkflowStepConfig = {
  retries: { limit: 6, delay: "5 seconds", backoff: "exponential" },
  timeout: "1 minute"
}

export class ShopifyWriteWorkflow extends WorkflowEntrypoint<Cloudflare.Env, ShopifyWriteParams> {
  override async run(event: Readonly<WorkflowEvent<ShopifyWriteParams>>, step: WorkflowStep) {
    const { workspaceId, write } = event.payload
    const product = write.type === "product.updated"
    const ids = write.type === "product.updated" ? write.productIds : write.orderIds
    const outcomes: Array<WriteOutcome> = []
    for (const id of ids) {
      try {
        const effect = write.type === "product.updated" ? productWriteBack(write, id) : writeBack(write, id)
        outcomes.push(await step.do(`${product ? "product" : "order"} ${id}`, RETRY, () => run(workspaceId, effect)))
      } catch {
        if (write.type === "refund.requested") {
          await step.do(
            `refund failed ${id}`,
            RETRY,
            () => run(workspaceId, refundFailed(write.refundId, id, "unreachable"))
          )
        }
        outcomes.push({ id, outcome: "skipped", reason: "unreachable" })
      }
    }
    // A refund changes the order whatever became of it; another change only where Shopify refused it.
    const changed = outcomes.filter((o) => write.type === "refund.requested" || o.outcome === "refused")
    if (changed.length > 0) {
      await roomOf(workspaceId).broadcast({
        v: 1,
        type: "records.changed",
        kind: product ? "product" : "order",
        ids: changed.map((o) => o.id)
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
