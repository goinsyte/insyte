import { Schema } from "effect"
import { BillingCycle, PlanId } from "../../shared/domain/Billing.ts"
import { CreateWorkspaceInput } from "../../shared/domain/Workspaces.ts"
import { Step, Track } from "./Steps.ts"

/*
 * What the console reads and sends (M4.1). `advance` takes one member per step: the shared head (`account` and `verify`
 * carry nothing; the server checks the facts), `role`, and the admin track's `organization` (founds the workspace),
 * `plan` (starts the trial), `store` ("later", or "connected" once Shopify gave the workspace a store), `sync` (once
 * the store's first import is in) and `ready` (ends onboarding). `analysis` and `offline` join with M6.5 and M15.
 */

export const Answers = Schema.Struct({
  persona: Schema.optional(Track),
  plan: Schema.optional(PlanId),
  cycle: Schema.optional(BillingCycle),
  store: Schema.optional(Schema.Literals(["later", "connected"]))
})
export type Answers = typeof Answers.Type

export class OnboardingState extends Schema.Class<OnboardingState>("onboarding/OnboardingState")({
  track: Track,
  step: Step,
  answers: Answers,
  /** The step's place in the console's list for this track, from 0, and the list's length. */
  index: Schema.Finite,
  total: Schema.Finite,
  /** The track is finished: the person lands on Start, and `/onboarding` sends them there. */
  completed: Schema.Boolean
}) {}

export const AdvanceInput = Schema.Union([
  Schema.Struct({ step: Schema.Literal("account") }),
  Schema.Struct({ step: Schema.Literal("verify") }),
  Schema.Struct({ step: Schema.Literal("role"), persona: Track }),
  // The workspace's facts as the form has them; checked by the founding, which answers `Invalid` per field.
  Schema.Struct({ step: Schema.Literal("organization"), ...CreateWorkspaceInput.fields }),
  Schema.Struct({ step: Schema.Literal("plan"), plan: PlanId, cycle: BillingCycle }),
  // Left for the Start checklist, or connected: the server checks the workspace has the store (M6.2).
  Schema.Struct({ step: Schema.Literal("store"), choice: Schema.Literals(["later", "connected"]) }),
  // The first import is in (M6.3): the server checks it.
  Schema.Struct({ step: Schema.Literal("sync") }),
  // The first analysis read and its choices kept (`FirstAnalysis.prepare`, M6.5).
  Schema.Struct({ step: Schema.Literal("analysis") }),
  Schema.Struct({ step: Schema.Literal("ready") })
])
export type AdvanceInput = typeof AdvanceInput.Type

/** The step's fact is not true yet: no connected store, or its first import is not in. */
export class StepNotReady extends Schema.TaggedError<StepNotReady>()("StepNotReady", {
  step: Step,
  missing: Schema.Literals(["store", "import"])
}) {}

/** Only the current step can be finished: a stale tab or a replayed request is told where the person really is. */
export class NotCurrentStep extends Schema.TaggedError<NotCurrentStep>()("NotCurrentStep", {
  step: Step,
  current: Step
}) {}

/**
 * The Start checklist's tasks (`widgets.tsx` `useSetupTasks`, by its ids). `store`, `inbox` and `team` are done when
 * the workspace has them; the rest only the operator can say they did.
 */
export const SetupTask = Schema.Literals(["store", "inbox", "team", "supplier", "automation", "security", "alerts"])
export type SetupTask = typeof SetupTask.Type

export const ManualSetupTask = Schema.Literals(["supplier", "automation", "security", "alerts"])
export type ManualSetupTask = typeof ManualSetupTask.Type

/** What Start's first-run page shows: the workspace and how far its setup is. */
export class StartChecklist extends Schema.Class<StartChecklist>("onboarding/StartChecklist")({
  workspaceName: Schema.String,
  done: Schema.Array(SetupTask)
}) {}

export const CompleteTaskInput = Schema.Struct({ task: ManualSetupTask, done: Schema.Boolean })
export type CompleteTaskInput = typeof CompleteTaskInput.Type
