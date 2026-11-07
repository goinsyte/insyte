import { Invalid } from "@insyte/domain/Errors"
import { AdvanceInput, NotCurrentStep, OnboardingState } from "@insyte/modules/onboarding/domain/Onboarding"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { WithDb } from "./WithDb.ts"

/** The onboarding machine, for the signed-in person (M4.1): where they are, and finishing the current step. */
export class OnboardingRpcs extends RpcGroup.make(
  Rpc.make("Onboarding.me", { success: OnboardingState }),
  Rpc.make("Onboarding.advance", {
    payload: AdvanceInput,
    success: OnboardingState,
    error: Schema.Union([NotCurrentStep, Invalid])
  })
).middleware(Authenticated).middleware(WithDb) {}
