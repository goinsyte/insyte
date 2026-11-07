import { Invalid } from "@insyte/domain/Errors"
import {
  AdvanceInput,
  CompleteTaskInput,
  NotCurrentStep,
  OnboardingState,
  StartChecklist
} from "@insyte/modules/onboarding/domain/Onboarding"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { WithDb } from "./WithDb.ts"

/**
 * The onboarding machine, for the signed-in person (M4.1): where they are, and finishing the current step; then Start's
 * first-run checklist, and ticking one of its tasks. `NotCurrentStep` from those two: the person has no workspace yet.
 */
export class OnboardingRpcs extends RpcGroup.make(
  Rpc.make("Onboarding.me", { success: OnboardingState }),
  Rpc.make("Onboarding.advance", {
    payload: AdvanceInput,
    success: OnboardingState,
    error: Schema.Union([NotCurrentStep, Invalid])
  }),
  Rpc.make("Onboarding.start", { success: StartChecklist, error: NotCurrentStep }),
  Rpc.make("Onboarding.completeTask", { payload: CompleteTaskInput, success: StartChecklist, error: NotCurrentStep })
).middleware(Authenticated).middleware(WithDb) {}
