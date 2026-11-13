import { Context, type Effect } from "effect"

/**
 * Starts a run's Workflow (M12 step 3), named by the run, so a relay that delivers its event twice starts it once;
 * hands a waiting run the answer to its "Goedkeuring vragen" step; and stops a run cancelled from the Runs tab.
 */
export class AutomationRuns extends Context.Service<AutomationRuns, {
  readonly start: (input: { readonly workspaceId: string; readonly runId: string }) => Effect.Effect<void>
  readonly decide: (
    input: { readonly runId: string; readonly nodeId: string; readonly approved: boolean; readonly by: string }
  ) => Effect.Effect<void>
  readonly cancel: (input: { readonly runId: string }) => Effect.Effect<void>
}>()("automations/AutomationRuns") {}
