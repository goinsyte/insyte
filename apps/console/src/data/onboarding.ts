import { Unauthenticated } from "@insyte/domain/Errors"
import { NotCurrentStep, OnboardingState, StartChecklist } from "@insyte/modules/onboarding/domain/Onboarding"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"

/*
 * The onboarding machine for the signed-in person (M4.1): one read, primed by the route's loader on the server and
 * carried in the document (serializable, `skipInitialRun`, as `healthAtom`), and the step's completion as a mutation.
 * Both name `ONBOARDING`, so finishing a step refreshes the read. Signed out, the read fails `Unauthenticated` and the
 * screen runs its first steps locally.
 */

export const ONBOARDING = ["onboarding"] as const

export const onboardingMeAtom = Atom.serializable(
  ConsoleClient.query("Onboarding.me", undefined, { reactivityKeys: ONBOARDING }),
  {
    key: "onboarding.me",
    schema: AsyncResult.Schema({
      success: OnboardingState,
      error: Schema.Union([Unauthenticated, RpcClientError.RpcClientError])
    }),
    skipInitialRun: true
  }
)

export const advanceOnboardingAtom = ConsoleClient.mutation("Onboarding.advance")

/**
 * Start's first-run checklist (`Onboarding.start`), primed by `/dashboard`'s loader like `onboardingMeAtom`; ticking a
 * task answers the new checklist and refreshes it through `START`.
 */
export const START = ["onboarding.start"] as const

export const startAtom = Atom.serializable(
  ConsoleClient.query("Onboarding.start", undefined, { reactivityKeys: START }),
  {
    key: "onboarding.start",
    schema: AsyncResult.Schema({
      success: StartChecklist,
      error: Schema.Union([NotCurrentStep, Unauthenticated, RpcClientError.RpcClientError])
    }),
    skipInitialRun: true
  }
)

export const completeTaskAtom = ConsoleClient.mutation("Onboarding.completeTask")
