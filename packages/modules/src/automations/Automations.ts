import type { Db } from "@insyte/database/Db"
import type { Conflict, Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import { Relay } from "../shared/domain/Outbox.ts"
import type {
  AutomationChange,
  AutomationDetail,
  AutomationList,
  AutomationVersion,
  CreateInput,
  DraftSaved,
  InvalidFlow,
  ListInput,
  NothingToPublish,
  PublishInput,
  Recommendation,
  SaveDraftInput,
  SetStatusInput,
  TriggerFieldRow,
  UpdateSettingsInput
} from "./domain/Automations.ts"
import type { TestInput, TestResult } from "./domain/Runs.ts"
import * as Commands from "./use-cases/commands.ts"
import * as Read from "./use-cases/read.ts"
import * as Test from "./use-cases/test.ts"

type R = Db | CurrentPrincipal

/**
 * The automations slice (M12 step 1): flows as definitions. The list and one flow, drafts the canvas saves, published
 * versions, the status and the settings, the library's templates and the ones the workspace's records recommend. Runs,
 * the executor, the flow's service account and Test are later steps of M12.
 *
 * @effect-expect-leaking Db CurrentPrincipal
 */
export class AutomationsService extends Context.Service<AutomationsService, {
  readonly list: (input: typeof ListInput.Type) => Effect.Effect<AutomationList, Forbidden, R>
  readonly get: (id: string) => Effect.Effect<AutomationDetail, Forbidden | NotFound, R>
  readonly versions: (id: string) => Effect.Effect<ReadonlyArray<AutomationVersion>, Forbidden | NotFound, R>
  readonly fields: (triggerVariant: string) => Effect.Effect<ReadonlyArray<TriggerFieldRow>, Forbidden, R>
  readonly recommended: Effect.Effect<ReadonlyArray<Recommendation>, Forbidden, R>
  readonly create: (
    input: typeof CreateInput.Type
  ) => Effect.Effect<AutomationChange, Forbidden | NotFound | Invalid, R>
  readonly saveDraft: (
    input: typeof SaveDraftInput.Type
  ) => Effect.Effect<DraftSaved, Forbidden | NotFound | Invalid, R>
  readonly duplicate: (id: string) => Effect.Effect<AutomationChange, Forbidden | NotFound, R>
  readonly remove: (id: string) => Effect.Effect<AutomationChange, Forbidden | NotFound, R>
  readonly restore: (id: string) => Effect.Effect<AutomationChange, Forbidden | NotFound, R>
  readonly publish: (
    input: typeof PublishInput.Type
  ) => Effect.Effect<AutomationChange, Forbidden | NotFound | NothingToPublish | InvalidFlow, R>
  readonly setStatus: (
    input: typeof SetStatusInput.Type
  ) => Effect.Effect<AutomationChange, Forbidden | NotFound | Conflict, R>
  readonly updateSettings: (
    input: typeof UpdateSettingsInput.Type
  ) => Effect.Effect<AutomationChange, Forbidden | NotFound | Invalid, R>
  /** "Test met voorbeeld" (M12 step 4): the draft walked against an order, nothing kept or sent. */
  readonly test: (input: typeof TestInput.Type) => Effect.Effect<TestResult, Forbidden | NotFound, R>
}>()("modules/AutomationsService") {
  // A database that does not answer is a defect, as everywhere. The relay is taken once, for the published event.
  static readonly layer = Layer.effect(
    AutomationsService,
    Effect.map(Effect.service(Relay), (relay) => {
      const run = <A, E, Req>(effect: Effect.Effect<A, E | SqlError.SqlError, Req>) =>
        effect.pipe(Effect.provideService(Relay, relay), Effect.catchIf(SqlError.isSqlError, Effect.die))
      return {
        list: (input) => run(Read.list(input)),
        get: (id) => run(Read.get(id)),
        versions: (id) => run(Read.versions(id)),
        fields: (triggerVariant) => run(Read.fields(triggerVariant)),
        recommended: run(Read.recommended()),
        create: (input) => run(Commands.create(input)),
        saveDraft: (input) => run(Commands.saveDraft(input)),
        duplicate: (id) => run(Commands.duplicate(id)),
        remove: (id) => run(Commands.remove(id)),
        restore: (id) => run(Commands.restoreRemoved(id)),
        publish: (input) => run(Commands.publish(input)),
        setStatus: (input) => run(Commands.setStatus(input)),
        updateSettings: (input) => run(Commands.updateSettings(input)),
        test: (input) => run(Test.test(input))
      }
    })
  )
}
