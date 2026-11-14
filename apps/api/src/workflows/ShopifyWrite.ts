import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { customerWriteBack } from "@insyte/modules/customers/use-cases/write-back"
import { refundFailed, writeBack } from "@insyte/modules/orders/use-cases/write-back"
import { productWriteBack } from "@insyte/modules/products/use-cases/write-back"
import { decisionWriteBack, resolutionFailed, resolutionWriteBack } from "@insyte/modules/returns/use-cases/shopify"
import { idsOf, type ShopifyWrite, type WriteOutcome } from "@insyte/modules/shared/domain/ShopifyWrites"
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep, type WorkflowStepConfig } from "cloudflare:workers"
import { Cause, Effect, Exit } from "effect"
import { syncRuntime as runtime } from "../platform/Ingest.ts"
import { Telemetry } from "../platform/Observability.ts"
import { withRequestDb } from "../platform/RequestDb.ts"
import { roomOf } from "../platform/Room.ts"

/*
 * A change made in Insyte to Shopify (M7), once the undo window has passed: a durable step per record, so a
 * bulk change of fifty that Shopify throttles halfway resumes where it stopped and sends none twice. A step that keeps
 * failing (Shopify unreachable) gives up after its retries; the others still go, and a refund that never got there is
 * failed. Where Shopify refused, the record was read again, and the workspace's tabs hear it; a refund always. A
 * return's (M9.3): its resolution made there, or a return from Shopify approved or declined there; a resolution that
 * never got there is failed, so the team can ask again, and the tabs hear every one.
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
    const kind = write.type === "product.updated"
      ? "product"
      : write.type === "customer.updated" || write.type === "customer.created"
      ? "customer"
      : write.type === "return.approved" || write.type === "return.rejected" ||
          write.type === "return.resolution_requested"
      ? "return"
      : "order"
    const outcomes: Array<WriteOutcome> = []
    for (const id of idsOf(write)) {
      try {
        const effect = write.type === "product.updated"
          ? productWriteBack(write, id)
          : write.type === "customer.updated" || write.type === "customer.created"
          ? customerWriteBack(write, id)
          : write.type === "return.resolution_requested"
          ? resolutionWriteBack(id)
          : write.type === "return.approved" || write.type === "return.rejected"
          ? decisionWriteBack(write.type === "return.approved" ? "approve" : "decline", id)
          : writeBack(write, id)
        outcomes.push(await step.do(`${kind} ${id}`, RETRY, () => run(workspaceId, effect)))
      } catch {
        if (write.type === "refund.requested") {
          await step.do(
            `refund failed ${id}`,
            RETRY,
            () => run(workspaceId, refundFailed(write.refundId, id, "unreachable"))
          )
        }
        if (write.type === "return.resolution_requested") {
          await step.do(
            `resolution failed ${id}`,
            RETRY,
            () => run(workspaceId, resolutionFailed(id, "Shopify was niet bereikbaar"))
          )
        }
        outcomes.push({ id, outcome: "skipped", reason: "unreachable" })
      }
    }
    // A refund changes the order whatever became of it; another change only where Shopify refused it.
    const changed = outcomes.filter((o) =>
      write.type === "refund.requested" || kind === "return" || o.outcome === "refused"
    )
    if (changed.length > 0) {
      await roomOf(workspaceId).broadcast({
        v: 1,
        type: "records.changed",
        kind,
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
  const exit = await Telemetry.runExit(runtime, program)
  if (Exit.isSuccess(exit)) return exit.value
  throw Cause.squash(exit.cause)
}
