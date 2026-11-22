import type { JobProgress } from "@insyte/api/Frames"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Relay } from "@insyte/modules/shared/domain/Outbox"
import { refusalMessage, ShopifyRefused } from "@insyte/modules/stores/domain/Ports"
import {
  type BackfillContext,
  finish,
  giveUp,
  type MirrorCounts,
  prepare,
  readPages,
  type Resource,
  RESOURCES
} from "@insyte/modules/stores/use-cases/backfill"
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep, type WorkflowStepConfig } from "cloudflare:workers"
import { NonRetryableError } from "cloudflare:workflows"
import { Cause, Effect, Exit } from "effect"
import { syncRuntime as runtime } from "../platform/Ingest.ts"
import { Telemetry } from "../platform/Observability.ts"
import { roomOf } from "../platform/Room.ts"
import { withStepDb } from "../platform/StepDb.ts"

/*
 * A store's first import (M6.3; integrations.md §2 "Backfill"), as a Workflow: every step is durable, so a restart, a
 * deploy or a throttle resumes at the page it was on instead of starting over. Per resource, steps of pages: each
 * reads Shopify's pages from the checkpointed cursor for up to thirty seconds (`readPages`), so 20,000 orders at two a
 * page are a few hundred steps, far inside a Workflow's 10,000. A throttle too long to wait out in a step is slept on
 * here (a sleep is not a step, and spends no retries). After every step the workspace's tabs get the counts
 * (`job.progress`). A refused token stops at once (the operator must reconnect); anything else retries with backoff,
 * and when the retries are spent the store asks for the operator (`giveUp`).
 */

export interface BackfillParams {
  readonly workspaceId: string
  readonly storeId: string
}

const RETRY: WorkflowStepConfig = {
  retries: { limit: 8, delay: "15 seconds", backoff: "exponential" },
  timeout: "5 minutes"
}

/**
 * Steps of pages for the whole import, at most: past it the import gives up rather than run into the Workflow's own
 * limit (10,000 steps, where `give up` could no longer run).
 */
const MAX_STEPS = 9_000

export class ShopifyBackfillWorkflow extends WorkflowEntrypoint<Cloudflare.Env, BackfillParams> {
  /** Steps of pages so far in this run of `run` (a replay counts them again, from the start). */
  #steps = 0

  override async run(event: Readonly<WorkflowEvent<BackfillParams>>, step: WorkflowStep) {
    const { workspaceId, storeId } = event.payload
    this.#steps = 0
    const exec = <A>(effect: Effect.Effect<A, unknown, unknown>) => run(workspaceId, effect)
    const progress = (label: JobProgress["label"], counts: MirrorCounts) =>
      roomOf(workspaceId).broadcast({ v: 1, type: "job.progress", kind: "store_backfill", storeId, label, counts })

    const ctx: BackfillContext | null = await step.do("prepare", RETRY, () => exec(prepare(storeId)))
    // Disconnected before the import began: nothing to read.
    if (ctx === null) return null
    try {
      for (const resource of RESOURCES) await this.#resource(step, exec, progress, ctx, resource)
      const done = await step.do("finish", RETRY, () => exec(finish(ctx)))
      await exec(Effect.flatMap(Effect.service(Relay), (relay) => relay.kick(done.outboxIds)))
      await progress("done", done.counts)
      return done.counts
    } catch (error) {
      await step.do("give up", RETRY, () => exec(giveUp(ctx, String(error))))
      throw error
    }
  }

  async #resource(
    step: WorkflowStep,
    exec: <A>(effect: Effect.Effect<A, unknown, unknown>) => Promise<A>,
    progress: (label: JobProgress["label"], counts: MirrorCounts) => Promise<void>,
    ctx: BackfillContext,
    resource: Resource
  ) {
    // The stock is part of the products to whoever watches the import.
    const label = resource === "stock" ? "products" : resource
    for (let n = 0;; n++) {
      if (++this.#steps > MAX_STEPS) throw new Error(`the import took more than ${MAX_STEPS} steps`)
      const read = await step.do(`page ${resource} ${n}`, RETRY, () => exec(readPages(ctx, resource)))
      await progress(label, read.counts)
      if (read.done) return
      if (read.waitMs > 0) await step.sleep(`wait ${resource} ${n}`, read.waitMs)
    }
  }
}

/**
 * One step's effect in the store's workspace, over a connection of its own; a refused token is not retried. Shopify's
 * refusal is logged and thrown with its status and reason, so the step's error says why, not only `ShopifyRefused`.
 */
const run = async <A>(workspaceId: string, effect: Effect.Effect<A, unknown, unknown>): Promise<A> => {
  const program = withStepDb(effect).pipe(
    Effect.tapError((error) =>
      error instanceof ShopifyRefused
        ? Effect.logWarning("backfill: Shopify refused a step", { status: error.status, reason: error.reason })
        : Effect.void
    ),
    Effect.provideService(CurrentWorkspace, { id: workspaceId as WorkspaceId })
  ) as Effect.Effect<A, unknown, never>
  const exit = await Telemetry.runExit(runtime, program)
  if (Exit.isSuccess(exit)) return exit.value
  const failure = Cause.findErrorOption(exit.cause)
  if (failure._tag === "Some" && (failure.value as { _tag?: string })._tag === "TokenRefused") {
    throw new NonRetryableError("the store's token was refused: the operator must connect it again")
  }
  if (failure._tag === "Some" && failure.value instanceof ShopifyRefused) throw stepError(failure.value)
  throw Cause.squash(exit.cause)
}

/** A plain error with its message as its own property: what a Workflow step records survives being passed on. */
const stepError = (refused: ShopifyRefused): Error => {
  const error = new Error(refusalMessage(refused))
  error.name = "ShopifyRefused"
  return error
}
