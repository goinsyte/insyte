import type { Db } from "@insyte/database/Db"
import type { Conflict, Invalid } from "@insyte/domain/Errors"
import type { WorkspaceId } from "@insyte/domain/Ids"
import type { CurrentUser, Switched } from "@insyte/domain/Session"
import { Context, Effect, Layer } from "effect"
import { Relay } from "../shared/domain/Outbox.ts"
import { type CreateWorkspaceInput, WorkspaceFounder, WorkspaceSetup } from "../shared/domain/Workspaces.ts"
import type {
  AdvanceInput,
  CompleteTaskInput,
  NotCurrentStep,
  OnboardingState,
  StartChecklist,
  StepNotReady
} from "./domain/Onboarding.ts"
import { advance } from "./use-cases/advance.ts"
import { another } from "./use-cases/another.ts"
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
  readonly advance: (
    input: AdvanceInput
  ) => Effect.Effect<OnboardingState, NotCurrentStep | StepNotReady | Invalid, Db | CurrentUser>
  /** Start's checklist for `active`, the workspace the session acts in (`null`: none chosen yet). */
  readonly start: (active: WorkspaceId | null) => Effect.Effect<StartChecklist, NotCurrentStep, Db | CurrentUser>
  readonly completeTask: (
    input: CompleteTaskInput,
    active: WorkspaceId | null
  ) => Effect.Effect<StartChecklist, NotCurrentStep, Db | CurrentUser>
  /**
   * A further workspace for someone whose onboarding is done (`Workspaces.create`); the session goes on in it.
   * `Conflict` "limit" past the workspaces one person may found.
   */
  readonly another: (
    input: CreateWorkspaceInput,
    sessionId: string
  ) => Effect.Effect<Switched, NotCurrentStep | Invalid | Conflict, Db | CurrentUser>
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
        start: (active: WorkspaceId | null) =>
          start(active).pipe(Effect.catchTags({ SqlError: Effect.die, SchemaError: Effect.die })),
        completeTask: (input: CompleteTaskInput, active: WorkspaceId | null) =>
          completeTask(input, active).pipe(Effect.catchTags({ SqlError: Effect.die, SchemaError: Effect.die })),
        another: (input: CreateWorkspaceInput, sessionId: string) =>
          another(input, sessionId).pipe(
            Effect.provideService(WorkspaceFounder, founder),
            Effect.provideService(Relay, relay),
            Effect.catchTags({ SqlError: Effect.die, SchemaError: Effect.die })
          )
      })
    )
  )
}
