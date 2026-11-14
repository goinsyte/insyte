import { AutomationActions } from "@insyte/modules/automations/Links"
import { StepFailed } from "@insyte/modules/automations/use-cases/engine"
import { Effect, Layer } from "effect"
import type * as Acts from "./AutomationActs.ts"

/*
 * A flow's actions through orders, forwarding, chats, tracking and Insyte AI (M12 step 3). `AutomationActs.ts` is
 * imported on the first such step an isolate runs, not when the Worker starts (ADR-0041 §3); if it does not load, the
 * step is tried again.
 */

/** The variants `AutomationActs.act` carries out. */
const HANDLES: ReadonlySet<string> = new Set([
  "action.notify_supplier",
  "action.refund",
  "action.assign_supplier",
  "action.update_tracking",
  "action.check_eta",
  "action.ai_compose",
  "action.ai_summarize",
  "action.ai_classify"
])

let loading: Promise<typeof Acts> | undefined

const load = Effect.tryPromise({
  try: () => (loading ??= import("./AutomationActs.ts").catch((error: unknown) => {
    loading = undefined
    throw error
  })),
  catch: () =>
    new StepFailed({
      explanation: "De stap kon nog niet worden geladen; Insyte probeert het opnieuw.",
      terminal: false
    })
})

export const AutomationActionsLive = Layer.succeed(
  AutomationActions,
  AutomationActions.of({
    handles: HANDLES,
    act: (input) => Effect.flatMap(load, (acts) => acts.act(input))
  })
)
