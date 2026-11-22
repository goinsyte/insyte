import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import type * as AffiliateClose from "@insyte/modules/affiliates/use-cases/close"
import { closeWorkspace, statementWorkspaces } from "@insyte/modules/suppliers/use-cases/statements"
import {
  env,
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
  type WorkflowStepConfig
} from "cloudflare:workers"
import { Cause, Effect, Exit } from "effect"
import { syncRuntime as runtime } from "../platform/Ingest.ts"
import { Telemetry } from "../platform/Observability.ts"
import { roomOf } from "../platform/Room.ts"
import { withStepDb } from "../platform/StepDb.ts"

/*
 * The supplier statements' monthly close (M13 step 6): started by the cron on the 1st at 03:00 UTC (`0 3 1 * *`, inside
 * the minute cron), one instance per month, so a second start is the same close. One durable step per workspace with a
 * supplier: last month's statement per supplier, once, then its PDF (`closeWorkspace`). A workspace west of UTC, where the
 * month has not ended yet, is tried again twelve hours later. The workspace's open tabs hear the statements changed;
 * the members who pay them hear they are ready (the relay's notifications sink, `statements.closed`). Then the
 * affiliates' (M16 step 5): per workspace with a programme, last month's payouts from the ledger, and the tiers.
 */

/** The affiliates' close loads with its step, not with the Worker (ADR-0041 §3). */
let closing: Promise<typeof AffiliateClose> | undefined
const lazyClose = <A, E, R>(
  f: (m: typeof AffiliateClose) => Effect.Effect<A, E, R>
) =>
  Effect.flatMap(
    Effect.promise(() =>
      closing ??= import("@insyte/modules/affiliates/use-cases/close").catch((error: unknown) => {
        closing = undefined
        throw error
      })
    ),
    f
  )

export interface MonthlyCloseParams {
  /** `YYYY-MM`: the month to close, last month in UTC. */
  readonly month: string
}

const RETRY: WorkflowStepConfig = {
  retries: { limit: 5, delay: "30 seconds", backoff: "exponential" },
  timeout: "5 minutes"
}

export class MonthlyCloseWorkflow extends WorkflowEntrypoint<Cloudflare.Env, MonthlyCloseParams> {
  override async run(event: Readonly<WorkflowEvent<MonthlyCloseParams>>, step: WorkflowStep) {
    const { month } = event.payload
    const workspaces = await step.do("workspaces", RETRY, () => run(undefined, statementWorkspaces))
    const closeOne = async (workspaceId: string, label: string) => {
      const outcome = await step.do(label, RETRY, () => run(workspaceId, closeWorkspace(month)))
      if (outcome.written.length > 0 || outcome.documents.length > 0) {
        await roomOf(workspaceId).broadcast({
          v: 1,
          type: "records.changed",
          kind: "supplier_statement",
          ids: [...new Set([...outcome.written, ...outcome.documents])]
        })
      }
      return outcome
    }
    const waiting: Array<string> = []
    let written = 0
    for (const workspaceId of workspaces) {
      const outcome = await closeOne(workspaceId, `close ${workspaceId}`)
      if (!outcome.ended) waiting.push(workspaceId)
      written += outcome.written.length
    }
    // The affiliates' payouts (M16 step 5): one step per workspace with a programme, by the UTC month, so it never
    // waits for the west. The workspace's tabs hear the payouts changed.
    const programs = await step.do(
      "affiliate workspaces",
      RETRY,
      () => run(undefined, lazyClose((m) => m.programWorkspaces))
    )
    let payouts = 0
    for (const workspaceId of programs) {
      const outcome = await step.do(
        `affiliates ${workspaceId}`,
        RETRY,
        () => run(workspaceId, lazyClose((m) => m.closeWorkspace(month)))
      )
      payouts += outcome.payouts.length
      if (outcome.payouts.length > 0 || outcome.promoted.length > 0) {
        await roomOf(workspaceId).broadcast({
          v: 1,
          type: "records.changed",
          kind: "affiliate_payout",
          ids: [...outcome.payouts]
        })
      }
    }
    if (waiting.length > 0) {
      await step.sleep("the month ends further west", "12 hours")
      for (const workspaceId of waiting) {
        written += (await closeOne(workspaceId, `close ${workspaceId} later`)).written.length
      }
    }
    return { month, workspaces: workspaces.length, written, payouts }
  }
}

/** One step's effect, in a workspace where it names one, over a connection of its own. */
const run = async <A>(workspaceId: string | undefined, effect: Effect.Effect<A, unknown, unknown>): Promise<A> => {
  const scoped = workspaceId === undefined
    ? effect
    : effect.pipe(Effect.provideService(CurrentWorkspace, { id: workspaceId as WorkspaceId }))
  const program = withStepDb(scoped).pipe(
    // Said in the logs: a step the Workflow retries is otherwise silent.
    Effect.tapCause((cause) => Effect.logWarning("a monthly close step failed", { workspaceId, cause }))
  ) as Effect.Effect<A, unknown, never>
  const exit = await Telemetry.runExit(runtime, program)
  if (Exit.isSuccess(exit)) return exit.value
  throw Cause.squash(exit.cause)
}

/** The month before `at`'s, in UTC, as `YYYY-MM`. */
const monthBefore = (at: Date) => {
  const last = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() - 1, 1))
  return `${last.getUTCFullYear()}-${String(last.getUTCMonth() + 1).padStart(2, "0")}`
}

/** The cron's start of last month's close; one instance per month, so a second start (a retried cron) is a no-op. */
export const startMonthlyClose = async (at: Date) => {
  const month = monthBefore(at)
  await env.MONTHLY_CLOSE.create({ id: `close-${month}`, params: { month } }).catch(() => undefined)
}
