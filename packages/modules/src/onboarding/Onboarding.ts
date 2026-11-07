import type { Db } from "@insyte/database/Db"
import type { Invalid } from "@insyte/domain/Errors"
import type { CurrentUser } from "@insyte/domain/Session"
import { Context, Effect, Layer } from "effect"
import { Relay } from "../shared/domain/Outbox.ts"
import { WorkspaceFounder, WorkspaceSetup } from "../shared/domain/Workspaces.ts"
import type {
  AdvanceInput,
  CompleteTaskInput,
  NotCurrentStep,
  OnboardingState,
  StartChecklist
} from "./domain/Onboarding.ts"
import { advance } from "./use-cases/advance.ts"
import { me } from "./use-cases/me.ts"
import { completeTask, start } from "./use-cases/start.ts"

/**
 * The onboarding slice (M4.1): the server-side state machine every device reads, so a reload resumes on the right
 * step, and Start's first-run checklist after it. Its methods run as the request's person on the request's connection,
 * which is why they ask for both.
 *
 * @effect-expect-leaking Db CurrentUser
 */
export class Onboarding extends Context.Service<Onboarding, {
  readonly me: Effect.Effect<OnboardingState, never, Db | CurrentUser>
  readonly advance: (input: AdvanceInput) => Effect.Effect<OnboardingState, NotCurrentStep | Invalid, Db | CurrentUser>
  readonly start: Effect.Effect<StartChecklist, NotCurrentStep, Db | CurrentUser>
  readonly completeTask: (
    input: CompleteTaskInput
  ) => Effect.Effect<StartChecklist, NotCurrentStep, Db | CurrentUser>
}>()("modules/Onboarding") {
  // A database that does not answer is a defect: the RPC answers it as one, and the request is in the traces.
  // The workspace's own changes and kicking the relay go through ports, taken from the context when the layer is built.
  static readonly layer = Layer.effect(
    Onboarding,
    Effect.map(
      Effect.all([Effect.service(WorkspaceFounder), Effect.service(WorkspaceSetup), Effect.service(Relay)]),
      ([founder, setup, relay]) => ({
        me: Effect.orDie(me()),
        advance: (input: AdvanceInput) =>
          advance(input).pipe(
            Effect.provideService(WorkspaceFounder, founder),
            Effect.provideService(WorkspaceSetup, setup),
            Effect.provideService(Relay, relay),
            Effect.catchTags({ SqlError: Effect.die, SchemaError: Effect.die })
          ),
        start: start().pipe(Effect.catchTags({ SqlError: Effect.die, SchemaError: Effect.die })),
        completeTask: (input: CompleteTaskInput) =>
          completeTask(input).pipe(Effect.catchTags({ SqlError: Effect.die, SchemaError: Effect.die }))
      })
    )
  )
}
