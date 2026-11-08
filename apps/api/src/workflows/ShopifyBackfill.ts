import type { JobProgress } from "@insyte/api/Frames"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Relay } from "@insyte/modules/shared/domain/Outbox"
import {
  applyPage,
  type BackfillContext,
  finish,
  giveUp,
  type MirrorCounts,
  pollBulk,
  prepare,
  type Resource,
  RESOURCES,
  startBulk
} from "@insyte/modules/stores/use-cases/backfill"
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep, type WorkflowStepConfig } from "cloudflare:workers"
import { NonRetryableError } from "cloudflare:workflows"
import { Cause, Effect, Exit, ManagedRuntime } from "effect"
import { SyncLayer } from "../platform/AppLayer.ts"
import { Telemetry } from "../platform/Observability.ts"
import { withRequestDb } from "../platform/RequestDb.ts"
import { roomOf } from "../platform/Room.ts"

/*
 * A store's first import (M6.3; integrations.md §2 "Backfill"), as a Workflow: every step is durable, so a restart, a
 * deploy or a throttle resumes at the page it was on instead of starting over. Per resource: start the bulk query,
 * poll it every ten seconds until Shopify has the file, then read it a page at a time from the byte offset the last
 * page ended at. After every page the workspace's tabs get the counts (`job.progress`). A refused token stops at once
 * (the operator must reconnect); anything else retries with backoff, and when the retries are spent the store asks
 * for the operator (`giveUp`).
 */

export interface BackfillParams {
  readonly workspaceId: string
  readonly storeId: string
}

const runtime = ManagedRuntime.make(SyncLayer)

const RETRY: WorkflowStepConfig = {
  retries: { limit: 8, delay: "15 seconds", backoff: "exponential" },
  timeout: "5 minutes"
}

/** How often a bulk operation is asked where it is, and how many times before the resource starts over. */
const POLL_EVERY = "10 seconds"
const MAX_POLLS = 360

export class ShopifyBackfillWorkflow extends WorkflowEntrypoint<Cloudflare.Env, BackfillParams> {
  override async run(event: Readonly<WorkflowEvent<BackfillParams>>, step: WorkflowStep) {
    const { workspaceId, storeId } = event.payload
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
    progress: (label: Resource, counts: MirrorCounts) => Promise<void>,
    ctx: BackfillContext,
    resource: Resource
  ) {
    const bulkId = await step.do(`start ${resource}`, RETRY, () => exec(startBulk(ctx, resource)))
    let url: string | null = null
    for (let poll = 0;; poll++) {
      if (poll >= MAX_POLLS) throw new Error(`bulk ${resource} did not finish`)
      const status = await step.do(`poll ${resource} ${poll}`, RETRY, () => exec(pollBulk(ctx, resource, bulkId)))
      if (status.status === "COMPLETED") {
        url = status.url
        break
      }
      await step.sleep(`wait ${resource} ${poll}`, POLL_EVERY)
    }
    let offset = 0
    for (let page = 0;; page++) {
      const read = await step.do(`page ${resource} ${page}`, RETRY, () => exec(applyPage(ctx, resource, url, offset)))
      await progress(resource, read.counts)
      if (read.done) return
      offset = read.next
    }
  }
}

/** One step's effect in the store's workspace, over a connection of its own; a refused token is not retried. */
const run = async <A>(workspaceId: string, effect: Effect.Effect<A, unknown, unknown>): Promise<A> => {
  const program = withRequestDb(effect).pipe(
    Effect.provideService(CurrentWorkspace, { id: workspaceId as WorkspaceId })
  ) as Effect.Effect<A, unknown, never>
  const exit = await runtime.runPromiseExit(program).finally(() => Telemetry.flush())
  if (Exit.isSuccess(exit)) return exit.value
  const failure = Cause.findErrorOption(exit.cause)
  if (failure._tag === "Some" && (failure.value as { _tag?: string })._tag === "TokenRefused") {
    throw new NonRetryableError("the store's token was refused: the operator must connect it again")
  }
  throw Cause.squash(exit.cause)
}
