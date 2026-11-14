import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { failPack, finishPack, gatherDocument, planPack } from "@insyte/modules/chargebacks/Chargebacks"
import type { DocumentKind } from "@insyte/modules/chargebacks/domain/Pack"
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep, type WorkflowStepConfig } from "cloudflare:workers"
import { Cause, Effect, Exit } from "effect"
import { withAi } from "../platform/Ai.ts"
import { syncRuntime as runtime } from "../platform/Ingest.ts"
import { Telemetry } from "../platform/Observability.ts"
import { withRequestDb } from "../platform/RequestDb.ts"
import { roomOf } from "../platform/Room.ts"

/*
 * A case's evidence pack (M13 step 4), one run per ask: which documents the case's facts can carry, its account (Insyte
 * AI's where a model is set up, M15 step 2), then each document on a durable step of its own (read, rendered by Browser
 * Rendering, kept in R2, put in the pack), then the pack ready. A step that fails (the browser busy, the bucket away) is
 * tried again; when it gives up, the pack is marked failed and can be asked for again. After every step the
 * workspace's tabs hear how far it got (`job.progress`) and refetch the case.
 */

export interface EvidencePackParams {
  readonly workspaceId: string
  readonly chargebackId: string
  readonly runId: string
}

const RETRY: WorkflowStepConfig = {
  retries: { limit: 5, delay: "10 seconds", backoff: "exponential" },
  timeout: "2 minutes"
}

export class EvidencePackWorkflow extends WorkflowEntrypoint<Cloudflare.Env, EvidencePackParams> {
  override async run(event: Readonly<WorkflowEvent<EvidencePackParams>>, step: WorkflowStep) {
    const { workspaceId, chargebackId, runId } = event.payload
    const room = roomOf(workspaceId)
    const told = async (done: number, total: number) => {
      await room.broadcast({ v: 1, type: "job.progress", kind: "evidence_pack", chargebackId, done, total })
      await room.broadcast({ v: 1, type: "records.changed", kind: "chargeback", ids: [chargebackId] })
    }
    try {
      const kinds: ReadonlyArray<DocumentKind> = await step.do(
        "plan",
        RETRY,
        () => run(workspaceId, planPack(chargebackId, runId).pipe(Effect.map((k) => [...k])))
      )
      if (kinds.length === 0) return { outcome: "skipped" as const }
      await told(0, kinds.length)
      // The account by Insyte AI where a model is set up (M15 step 2); the facts' sentences stand otherwise, and when
      // the model fails or writes a figure the facts do not have. Tried once: the pack never waits on a model.
      await step.do(
        "narrative",
        { retries: { limit: 0, delay: "1 second" }, timeout: "2 minutes" },
        () => run(workspaceId, withAi((ai) => ai.writeNarrative(chargebackId, runId))).catch(() => "kept" as const)
      )
      for (const [i, kind] of kinds.entries()) {
        await step.do(`document:${kind}`, RETRY, () => run(workspaceId, gatherDocument(chargebackId, runId, kind)))
        await told(i + 1, kinds.length)
      }
      await step.do("finish", RETRY, () => run(workspaceId, finishPack(chargebackId, runId)))
    } catch (error) {
      await step.do("fail", RETRY, () => run(workspaceId, failPack(chargebackId, runId, String(error))))
      await room.broadcast({ v: 1, type: "records.changed", kind: "chargeback", ids: [chargebackId] })
      return { outcome: "failed" as const }
    }
    await room.broadcast({ v: 1, type: "records.changed", kind: "chargeback", ids: [chargebackId] })
    return { outcome: "ready" as const }
  }
}

/** One step's effect in the workspace, over a connection of its own. */
const run = async <A>(workspaceId: string, effect: Effect.Effect<A, unknown, unknown>): Promise<A> => {
  const program = withRequestDb(effect).pipe(
    Effect.provideService(CurrentWorkspace, { id: workspaceId as WorkspaceId }),
    // Said in the logs: a step the Workflow retries is otherwise silent.
    Effect.tapCause((cause) => Effect.logWarning("an evidence pack step failed", { workspaceId, cause }))
  ) as Effect.Effect<A, unknown, never>
  const exit = await Telemetry.runExit(runtime, program)
  if (Exit.isSuccess(exit)) return exit.value
  throw Cause.squash(exit.cause)
}
