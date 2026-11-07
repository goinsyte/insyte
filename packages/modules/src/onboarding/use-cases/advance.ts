import { CurrentUser } from "@insyte/domain/Session"
import { Effect } from "effect"
import { type AdvanceInput, NotCurrentStep } from "../domain/Onboarding.ts"
import { next } from "../domain/Steps.ts"
import { me } from "./me.ts"
import { factsOf, saveProgress, stateOf } from "./progress.ts"

/**
 * `Onboarding.advance`: finishes the current step with its answers, and moves to the next. `role` stores the persona
 * and with it the track; the admin tail's steps join with step 3 and M6.
 */
export const advance = Effect.fn("Onboarding.advance")(function*(input: AdvanceInput) {
  const user = yield* CurrentUser
  const current = yield* me()
  if (input.step !== current.step) return yield* new NotCurrentStep({ step: input.step, current: current.step })
  const track = input.step === "role" ? input.persona : current.track
  const answers = input.step === "role" ? { ...current.answers, persona: input.persona } : current.answers
  const row = { track, answers, step: next(track, input.step, factsOf(user)) }
  yield* saveProgress(row)
  return stateOf(row)
})
