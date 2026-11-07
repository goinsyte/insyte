import { Schema } from "effect"
import { CreateWorkspaceInput } from "../../shared/domain/Workspaces.ts"
import { Step, Track } from "./Steps.ts"

/*
 * What the console reads and sends (M4.1). `advance` takes one member per step: the shared head (`account` and `verify`
 * carry nothing; the server checks the facts), `role`, and the admin track's `organization`, which founds the
 * workspace; the rest of the admin tail joins with step 3.3 and M6.
 */

export const Answers = Schema.Struct({
  persona: Schema.optional(Track)
})
export type Answers = typeof Answers.Type

export class OnboardingState extends Schema.Class<OnboardingState>("onboarding/OnboardingState")({
  track: Track,
  step: Step,
  answers: Answers,
  /** The step's place in the console's list for this track, from 0, and the list's length. */
  index: Schema.Finite,
  total: Schema.Finite
}) {}

export const AdvanceInput = Schema.Union([
  Schema.Struct({ step: Schema.Literal("account") }),
  Schema.Struct({ step: Schema.Literal("verify") }),
  Schema.Struct({ step: Schema.Literal("role"), persona: Track }),
  // The workspace's facts as the form has them; checked by the founding, which answers `Invalid` per field.
  Schema.Struct({ step: Schema.Literal("organization"), ...CreateWorkspaceInput.fields })
])
export type AdvanceInput = typeof AdvanceInput.Type

/** Only the current step can be finished: a stale tab or a replayed request is told where the person really is. */
export class NotCurrentStep extends Schema.TaggedError<NotCurrentStep>()("NotCurrentStep", {
  step: Step,
  current: Step
}) {}
