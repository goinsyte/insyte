import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { customerWriteBack } from "@insyte/modules/customers/use-cases/write-back"
import { draftAdopt, draftRemove, draftSend, draftTwins } from "@insyte/modules/orders/use-cases/drafts"
import { refundFailed, writeBack } from "@insyte/modules/orders/use-cases/write-back"
import { productCreateAdopt, productCreateSend, productWriteBack } from "@insyte/modules/products/use-cases/write-back"
import { decisionWriteBack, resolutionFailed, resolutionWriteBack } from "@insyte/modules/returns/use-cases/shopify"
import { idsOf, type ShopifyWrite, type WriteOutcome } from "@insyte/modules/shared/domain/ShopifyWrites"
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep, type WorkflowStepConfig } from "cloudflare:workers"
import { Cause, Effect, Exit } from "effect"
import { syncRuntime as runtime } from "../platform/Ingest.ts"
import { Telemetry } from "../platform/Observability.ts"
import { withRequestDb } from "../platform/RequestDb.ts"
import { roomOf } from "../platform/Room.ts"

/*
 * A change made in Insyte to Shopify (M7), once the undo window has passed: a durable step per record (two for a
 * record made in Insyte: sent, then its row takes Shopify's ids), so a bulk change of fifty that Shopify throttles
 * halfway resumes where it stopped and sends none twice. A draft gets a last look a few minutes later, once Shopify's
 * search has caught up, for a twin a lagging search let a retry make (`TWINS_AFTER`). A step that keeps
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

/** How long Shopify's search may lag behind a draft it made: the last look for twins waits this long. */
const TWINS_AFTER = "5 minutes"

export class ShopifyWriteWorkflow extends WorkflowEntrypoint<Cloudflare.Env, ShopifyWriteParams> {
  override async run(event: Readonly<WorkflowEvent<ShopifyWriteParams>>, step: WorkflowStep) {
    const { workspaceId, write } = event.payload
    const kind = write.type === "product.updated" || write.type === "product.created"
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
        // A record made in Insyte goes in two steps: sent, then its row takes Shopify's ids (`CreateSent`).
        if (write.type === "product.created") {
          const sent = await step.do(`${kind} ${id}`, RETRY, () => run(workspaceId, productCreateSend(write, id)))
          outcomes.push(
            "outcome" in sent
              ? sent.outcome
              : await step.do(
                `${kind} ${id} adopt`,
                RETRY,
                () => run(workspaceId, productCreateAdopt(write, id, sent.made))
              )
          )
          continue
        }
        if (write.type === "order.draft_created") {
          const sent = await step.do(`${kind} ${id}`, RETRY, () => run(workspaceId, draftSend(write, id)))
          if ("outcome" in sent) {
            outcomes.push(sent.outcome)
            continue
          }
          outcomes.push(
            await step.do(`${kind} ${id} adopt`, RETRY, () => run(workspaceId, draftAdopt(write, id, sent.made)))
          )
          // The last look changes nothing Insyte holds; it failing leaves the outcome as it is.
          await step.sleep(`${kind} ${id} settle`, TWINS_AFTER)
          await step.do(`${kind} ${id} twins`, RETRY, () => run(workspaceId, draftTwins(write, id, sent.made)))
            .catch(() => undefined)
          continue
        }
        const effect = write.type === "product.updated"
          ? productWriteBack(write, id)
          : write.type === "order.draft_removed"
          ? draftRemove(write, id)
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
