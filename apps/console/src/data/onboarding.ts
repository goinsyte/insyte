import { Unauthenticated } from "@insyte/domain/Errors"
import { OnboardingState } from "@insyte/modules/onboarding/domain/Onboarding"
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
