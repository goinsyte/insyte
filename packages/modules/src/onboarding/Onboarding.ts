import type { Db } from "@insyte/database/Db"
import type { CurrentUser } from "@insyte/domain/Session"
import { Context, Effect, Layer } from "effect"
import type { AdvanceInput, NotCurrentStep, OnboardingState } from "./domain/Onboarding.ts"
import { advance } from "./use-cases/advance.ts"
import { me } from "./use-cases/me.ts"

/**
 * The onboarding slice (M4.1): the server-side state machine every device reads, so a reload resumes on the right
 * step. Its methods run as the request's person on the request's connection, which is why they ask for both.
 *
 * @effect-expect-leaking Db CurrentUser
 */
export class Onboarding extends Context.Service<Onboarding, {
  readonly me: Effect.Effect<OnboardingState, never, Db | CurrentUser>
  readonly advance: (input: AdvanceInput) => Effect.Effect<OnboardingState, NotCurrentStep, Db | CurrentUser>
}>()("modules/Onboarding") {
  // A database that does not answer is a defect: the RPC answers it as one, and the request is in the traces.
  static readonly layer = Layer.succeed(Onboarding, {
    me: Effect.orDie(me()),
    advance: (input) => advance(input).pipe(Effect.catchTags({ SqlError: Effect.die, SchemaError: Effect.die }))
  })
}
