import { handlingOf } from "@insyte/domain/automations/Engine"
import type { FlowNode, LaneNode } from "@insyte/domain/automations/Graph"
import { STEPS_BY_ID } from "@insyte/domain/automations/Steps"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import {
  actOnce,
  decide,
  finishRun,
  inputOf,
  loadRun,
  notYet,
  recordStep,
  repliedSince,
  type RunPlan,
  StepFailed
} from "@insyte/modules/automations/use-cases/engine"
import { CustomersService } from "@insyte/modules/customers/Customers"
import { TicketsService } from "@insyte/modules/tickets/Tickets"
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep, type WorkflowStepConfig } from "cloudflare:workers"
import { NonRetryableError } from "cloudflare:workflows"
import { Cause, Effect, Exit, Layer } from "effect"
import { syncRuntime as runtime } from "../platform/Ingest.ts"
import { Telemetry } from "../platform/Observability.ts"
import { withRequestDb } from "../platform/RequestDb.ts"

/*
 * A flow's run (M12 step 3): its pinned version, step by step from the trigger down. Each step is one durable
 * `step.do("<node>:1")` that decides or acts and writes what it did, so a replay does nothing twice; "Wachten" sleeps,
 * "Wachten op antwoord" sleeps and then looks for the customer's mail, "Goedkeuring vragen" waits for the answer the
 * Runs tab sends (seven days at most). A Ja/nee-splitsing is decided in its step and walks one lane. An action runs
 * through its slice as the flow's service account, as the flow is just then: a flow paused, removed or narrowed since
 * the run started stops it, or fails the step for the right it no longer holds (`actOnce`). The action and its row
 * commit together, so a retried attempt does not act twice. A refusal that trying again cannot change fails the run at
 * once, the rest are retried. A step Insyte cannot run yet is skipped, with why. A run that cannot even be read closes
 * as failed rather than staying open.
 */

export interface AutomationRunParams {
  readonly workspaceId: string
  readonly runId: string
}

const RETRY: WorkflowStepConfig = {
  retries: { limit: 5, delay: "10 seconds", backoff: "exponential" },
  timeout: "2 minutes"
}

/** Reading and writing the run's own rows: a short retry, as only the database can be in the way. */
const QUICK: WorkflowStepConfig = {
  retries: { limit: 5, delay: "2 seconds", backoff: "exponential" },
  timeout: "1 minute"
}

const APPROVAL_TIMEOUT = "7 days"

type Node = FlowNode | LaneNode

/** How a run ends early: stopped by a condition or an answer, or failed. */
interface End {
  readonly status: "stopped" | "failed"
  readonly reason: string
}

// What the step's last attempt said: Workflows hands the error back with its class in the message.
const reasonOf = (error: unknown) =>
  error instanceof Error ? error.message.replace(/^(NonRetryableError|Error):\s*/, "") : "mislukt"

const labelOf = (node: Node) => STEPS_BY_ID[node.variantId]?.label ?? node.variantId

export class AutomationRunWorkflow extends WorkflowEntrypoint<Cloudflare.Env, AutomationRunParams> {
  override async run(event: Readonly<WorkflowEvent<AutomationRunParams>>, step: WorkflowStep) {
    const { workspaceId, runId } = event.payload
    const exec = <A>(effect: Effect.Effect<A, unknown, unknown>) => run(workspaceId, effect)
    // The plan crosses the step as text: its steps' settings are any JSON, which the step's type cannot say.
    let loaded: string
    try {
      loaded = await step.do("load", QUICK, () => planOf(workspaceId, runId))
    } catch {
      await step.do("finish", QUICK, () => exec(finishRun(runId, "failed", "De run kon niet worden gelezen.")))
      return { outcome: "failed" as const }
    }
    const plan = JSON.parse(loaded) as RunPlan | null
    if (plan === null) return { outcome: "closed" as const }

    const record = (
      node: Node,
      attempt: number,
      fields: Omit<Parameters<typeof recordStep>[0], "runId" | "runAt" | "nodeId" | "variant">
    ) => exec(recordStep({ runId, runAt: plan.runAt, nodeId: node.id, variant: node.variantId, attempt, ...fields }))

    const walk = async (nodes: ReadonlyArray<Node>): Promise<End | undefined> => {
      for (const node of nodes) {
        const end = await one(node)
        if (end !== undefined) return end
      }
      return undefined
    }

    const one = async (node: Node): Promise<End | undefined> => {
      const config = node.config
      switch (handlingOf(node.variantId)) {
        case "trigger": {
          await step.do(`${node.id}:1`, QUICK, async (ctx) => {
            await record(node, ctx.attempt, {
              status: "succeeded",
              input: inputOf(plan.context),
              output: { summary: plan.context["trigger.summary"] ?? "" }
            })
          })
          return undefined
        }
        case "condition": {
          const passed = await step.do(`${node.id}:1`, QUICK, async (ctx) => {
            const ok = decide(node.variantId, config, plan.context)
            await record(node, ctx.attempt, {
              status: ok ? "succeeded" : "stopped",
              output: { passed: ok },
              ...(ok ? {} : { explanation: "Deze run voldoet niet aan de voorwaarde; de flow stopt hier." })
            })
            return ok
          })
          return passed ? undefined : { status: "stopped", reason: `Gestopt bij “${labelOf(node)}”.` }
        }
        case "branch": {
          const yes = await step.do(`${node.id}:1`, QUICK, async (ctx) => {
            const ok = decide(node.variantId, config, plan.context)
            await record(node, ctx.attempt, { status: "succeeded", output: { lane: ok ? "yes" : "no" } })
            return ok
          })
          const lanes = "branches" in node ? node.branches : undefined
          return walk(yes ? lanes?.yes ?? [] : lanes?.no ?? [])
        }
        case "wait": {
          const minutes = Math.max(1, Number(config["minutes"] ?? 30) || 30)
          await step.do(`${node.id}:wait`, QUICK, async (ctx) => {
            await record(node, ctx.attempt, { status: "waiting", input: { minutes } })
          })
          await step.sleep(`${node.id}:sleep`, `${minutes} minutes`)
          await step.do(`${node.id}:1`, QUICK, async (ctx) => {
            await record(node, ctx.attempt, { status: "succeeded", input: { minutes } })
          })
          return undefined
        }
        case "wait_no_reply": {
          const hours = Math.max(1, Number(config["hours"] ?? 24) || 24)
          await step.do(`${node.id}:wait`, QUICK, async (ctx) => {
            await record(node, ctx.attempt, { status: "waiting", input: { hours } })
          })
          await step.sleep(`${node.id}:sleep`, `${hours} hours`)
          const replied = await step.do(`${node.id}:1`, QUICK, async (ctx) => {
            const answered = await exec(repliedSince(plan))
            await record(node, ctx.attempt, {
              status: answered ? "stopped" : "succeeded",
              input: { hours },
              output: { replied: answered },
              ...(answered ? { explanation: "De klant antwoordde; de flow stopt hier." } : {})
            })
            return answered
          })
          return replied ? { status: "stopped", reason: "De klant antwoordde." } : undefined
        }
        case "approval": {
          await step.do(`${node.id}:wait`, QUICK, async (ctx) => {
            await record(node, ctx.attempt, {
              status: "waiting",
              input: { approver: String(config["approver"] ?? "") },
              explanation: "Wacht op goedkeuring in het tabblad Runs."
            })
          })
          let answer: { approved: boolean; by: string } | undefined
          try {
            const got = await step.waitForEvent<{ approved: boolean; by: string }>(`${node.id}:answer`, {
              type: `approval-${node.id}`,
              timeout: APPROVAL_TIMEOUT
            })
            answer = got.payload
          } catch {
            answer = undefined
          }
          await step.do(`${node.id}:1`, QUICK, async (ctx) => {
            await record(node, ctx.attempt, {
              status: answer?.approved === true ? "succeeded" : "stopped",
              output: answer === undefined ? { timedOut: true } : { approved: answer.approved, by: answer.by },
              explanation: answer === undefined
                ? "Niemand keurde het binnen zeven dagen goed; de flow stopt hier."
                : answer.approved
                ? "Goedgekeurd."
                : "Afgewezen; de flow stopt hier."
            })
          })
          return answer?.approved === true
            ? undefined
            : {
              status: "stopped",
              reason: answer === undefined ? "Geen goedkeuring binnen zeven dagen." : "Afgewezen."
            }
        }
        case "action": {
          if (plan.done.includes(node.id)) {
            await step.do(`${node.id}:1`, QUICK, async (ctx) => {
              await record(node, ctx.attempt, {
                status: "succeeded",
                output: { reused: true },
                explanation: "Al gedaan in een eerdere run met dezelfde sleutel; niet opnieuw gedaan."
              })
            })
            return undefined
          }
          // Cancelled from the Runs tab while it waited, or the flow paused, removed or narrowed: `actOnce` reads it.
          try {
            const outcome = await step.do(`${node.id}:1`, RETRY, async (ctx) => {
              const exit = await actionStep(workspaceId, plan, node, ctx.attempt)
              if (Exit.isSuccess(exit)) {
                const done = exit.value
                if (done.kind === "stop") {
                  await record(node, ctx.attempt, { status: "stopped", explanation: done.reason })
                  return done.reason
                }
                return null
              }
              const failure = Cause.squash(exit.cause)
              const failed = failure instanceof StepFailed
                ? failure
                : new StepFailed({ explanation: "De stap lukte niet; Insyte probeert het opnieuw.", terminal: false })
              await record(node, ctx.attempt, {
                status: "failed",
                input: { ...config },
                error: failed.explanation,
                explanation: failed.explanation
              })
              if (failed.terminal) throw new NonRetryableError(failed.explanation)
              throw new Error(failed.explanation)
            })
            return outcome === null ? undefined : { status: "stopped", reason: outcome }
          } catch (error) {
            return {
              status: "failed",
              reason: `“${labelOf(node)}”: ${reasonOf(error)}`
            }
          }
        }
        case "unsupported": {
          await step.do(`${node.id}:1`, QUICK, async (ctx) => {
            await record(node, ctx.attempt, { status: "skipped", explanation: notYet(node.variantId, plan.connected) })
          })
          return undefined
        }
      }
    }

    const end = await walk(plan.nodes)
    await step.do("finish", QUICK, () => exec(finishRun(runId, end?.status ?? "succeeded", end?.reason ?? null)))
    return { outcome: end?.status ?? ("succeeded" as const) }
  }
}

/** What an action reaches: the slices it carries out its step through. */
const Slices = Layer.mergeAll(TicketsService.layer, CustomersService.layer)

const program = <A>(workspaceId: string, effect: Effect.Effect<A, unknown, unknown>) =>
  withRequestDb(effect).pipe(
    Effect.provide(Slices),
    Effect.provideService(CurrentWorkspace, { id: workspaceId as WorkspaceId }),
    // Said in the logs: a step the Workflow retries is otherwise silent.
    Effect.tapCause((cause) => Effect.logWarning("an automation run step failed", { workspaceId, cause }))
  ) as Effect.Effect<A, unknown, never>

const runExit = <A>(workspaceId: string, effect: Effect.Effect<A, unknown, unknown>) =>
  runtime.runPromiseExit(program(workspaceId, effect)).finally(() => Telemetry.flush())

/** The run's plan as text (it crosses a step), or `"null"` when there is nothing left to do. */
export const planOf = (workspaceId: string, runId: string) =>
  run(workspaceId, Effect.map(loadRun(runId), (p) => JSON.stringify(p)))

/** One action step's attempt, as the Workflow makes it; a retried attempt finds the first one's row and does not act. */
export const actionStep = (workspaceId: string, plan: RunPlan, node: Node, attempt: number) =>
  runExit(workspaceId, actOnce(plan, node, attempt))

/** One step's effect in the workspace, over a connection of its own. */
const run = async <A>(workspaceId: string, effect: Effect.Effect<A, unknown, unknown>): Promise<A> => {
  const exit = await runExit(workspaceId, effect)
  if (Exit.isSuccess(exit)) return exit.value
  throw Cause.squash(exit.cause)
}
