import type { Db } from "@insyte/database/Db"
import type { Principal } from "@insyte/domain/Principal"
import { Context, type Effect } from "effect"
import type { Relay } from "../shared/domain/Outbox.ts"
import type { RunPlan, StepFailed } from "./use-cases/engine.ts"

/**
 * A flow's actions through the slices that own them (M12 step 3; widgets/05 §1.3): a message in the supplier's channel
 * (chats), a refund within the flow's limit (orders), another supplier for the order (forwarding), its tracking read
 * again (tracking), its expected delivery worked out, and the AI steps (a reply draft, a summary, the ticket's topic;
 * Insyte AI, within its budget). Each runs as the flow's service account, on the step's own transaction where the slice
 * offers one; what it did is said for the run's history, what it refused is a `StepFailed`. Composed where the app is
 * put together; without it those steps say they cannot run yet.
 */
export interface ActInput {
  readonly plan: RunPlan
  readonly node: { readonly id: string; readonly variantId: string; readonly config: Readonly<Record<string, unknown>> }
  /** The flow's service account, as it is just now. */
  readonly principal: Principal
  /** A config field with the run's `{{field}}` values filled in. */
  readonly text: (key: string) => string
}

export interface Did {
  readonly status: "succeeded" | "skipped"
  readonly output: Record<string, unknown>
  readonly explanation?: string | undefined
}

export class AutomationActions extends Context.Service<AutomationActions, {
  /** The variants it carries out. */
  readonly handles: ReadonlySet<string>
  readonly act: (input: ActInput) => Effect.Effect<Did, StepFailed, Db | Relay>
}>()("automations/AutomationActions") {}
