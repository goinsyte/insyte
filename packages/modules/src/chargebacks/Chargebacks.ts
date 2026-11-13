import { Db } from "@insyte/database/Db"
import type { Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { type CurrentPrincipal, CurrentWorkspace } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import { FileStore } from "../shared/domain/Documents.ts"
import { Relay } from "../shared/domain/Outbox.ts"
import type { SearchHit } from "../shared/domain/Search.ts"
import type {
  AddEvidenceInput,
  AssemblePackInput,
  CaseClosed,
  CaseNumberTaken,
  ChargebackChange,
  ChargebackCounts,
  ChargebackDetail,
  ChargebackList,
  ChargebackStats,
  CreateManualInput,
  ListInput,
  RemoveEvidenceInput,
  ReorderEvidenceInput,
  SetNoteInput
} from "./domain/Chargebacks.ts"
import * as Read from "./use-cases/chargebacks.ts"
import * as Commands from "./use-cases/commands.ts"
import { assemblePack } from "./use-cases/pack.ts"
import { remindIn } from "./use-cases/reminders.ts"
import { uploadEvidence } from "./use-cases/upload.ts"

type R = Db | CurrentPrincipal
type Ids = { readonly ids: ReadonlyArray<string> }

/**
 * The chargebacks slice (M13 steps 3 and 4): the cases and their counts and standing, one case with its pack and
 * timeline, a case opened by hand, its note, its pack's files, Insyte gathering its pack (`EvidencePackWorkflow`),
 * accepting cases as lost, and the palette's search. Disputes from a payment provider and submitting a pack wait for
 * the payment connections (M13 step 2).
 *
 * @effect-expect-leaking Db CurrentPrincipal
 */
export class ChargebacksService extends Context.Service<ChargebacksService, {
  readonly list: (input: typeof ListInput.Type) => Effect.Effect<ChargebackList, Forbidden, R>
  /** The area panel's counts, for the frame. */
  readonly counts: Effect.Effect<ChargebackCounts, Forbidden, R>
  readonly get: (id: string) => Effect.Effect<ChargebackDetail, Forbidden | NotFound, R>
  readonly stats: Effect.Effect<ChargebackStats, Forbidden, R>
  readonly nextCaseNumber: Effect.Effect<{ readonly caseNumber: string }, Forbidden, R>
  readonly createManual: (
    input: typeof CreateManualInput.Type
  ) => Effect.Effect<ChargebackChange, Forbidden | NotFound | Invalid | CaseNumberTaken, R>
  readonly setNote: (input: typeof SetNoteInput.Type) => Effect.Effect<ChargebackChange, Forbidden | NotFound, R>
  readonly accept: (input: Ids) => Effect.Effect<ChargebackChange, Forbidden | NotFound | CaseClosed, R>
  readonly addEvidence: (
    input: typeof AddEvidenceInput.Type
  ) => Effect.Effect<ChargebackChange, Forbidden | NotFound | CaseClosed, R>
  readonly removeEvidence: (
    input: typeof RemoveEvidenceInput.Type
  ) => Effect.Effect<ChargebackChange, Forbidden | NotFound | CaseClosed, R>
  readonly reorderEvidence: (
    input: typeof ReorderEvidenceInput.Type
  ) => Effect.Effect<ChargebackChange, Forbidden | NotFound | CaseClosed | Invalid, R>
  /** "Bewijspakket samenstellen": a run of the `EvidencePackWorkflow` per case (none for one already gathering). */
  readonly assemblePack: (
    input: typeof AssemblePackInput.Type
  ) => Effect.Effect<ChargebackChange, Forbidden | NotFound | CaseClosed, R>
  /** The palette's cases: never refuses, answers nothing without Chargebacks · Bekijken. */
  readonly search: (q: string, limit: number) => Effect.Effect<ReadonlyArray<SearchHit>, never, R>
  /** One file for a case's pack, before `addEvidence` puts it in. */
  readonly upload: (input: {
    readonly chargebackId: string
    readonly name: string
    readonly mime: string
    readonly bytes: Uint8Array
  }) => Effect.Effect<
    { readonly id: string; readonly name: string; readonly sizeBytes: number },
    Forbidden | NotFound | Invalid | CaseClosed,
    R
  >
}>()("modules/ChargebacksService") {
  // A database that does not answer is a defect, as everywhere. The relay is taken once, for the opened case's note;
  // the file store once, for the uploads.
  static readonly layer = Layer.effect(
    ChargebacksService,
    Effect.gen(function*() {
      const relay = yield* Relay
      const files = yield* FileStore
      const run = <A, E, Req>(effect: Effect.Effect<A, E | SqlError.SqlError, Req>) =>
        effect.pipe(
          Effect.provideService(Relay, relay),
          Effect.provideService(FileStore, files),
          Effect.catchIf(SqlError.isSqlError, Effect.die)
        )
      return {
        list: (input) => run(Read.list(input)),
        counts: run(Read.counts()),
        get: (id) => run(Read.get(id)),
        stats: run(Read.stats()),
        nextCaseNumber: run(Read.nextCaseNumber()),
        createManual: (input) => run(Commands.createManual(input)),
        setNote: (input) => run(Commands.setNote(input)),
        accept: (input) => run(Commands.accept(input)),
        addEvidence: (input) => run(Commands.addEvidence(input)),
        removeEvidence: (input) => run(Commands.removeEvidence(input)),
        reorderEvidence: (input) => run(Commands.reorderEvidence(input)),
        assemblePack: (input) => run(assemblePack(input)),
        search: (q, limit) => run(Read.search(q, limit)),
        upload: (input) => run(uploadEvidence(input))
      }
    })
  )
}

/** The workspaces the hourly sweep reminds: those with a case that needs evidence and a deadline within five days. */
export const reminderWorkspaces: Effect.Effect<ReadonlyArray<WorkspaceId>, SqlError.SqlError, Db> = Effect.flatMap(
  Effect.service(Db),
  (db) =>
    db.routing((sql) =>
      Effect.map(
        sql<{ workspaceId: WorkspaceId }>`select workspace_id from chargeback_deadline_workspaces()`,
        (rows) => rows.map((r) => r.workspaceId)
      )
    )
)

/** One workspace's reminders due at `at`, as `system`; answers the outbox rows to kick. */
export const remindWorkspace = (
  workspaceId: WorkspaceId,
  at: Date = new Date()
): Effect.Effect<ReadonlyArray<string>, SqlError.SqlError, Db> =>
  Effect.flatMap(Effect.service(Db), (db) => db.scopedFor((sql) => remindIn(sql, workspaceId, at))).pipe(
    Effect.provideService(CurrentWorkspace, { id: workspaceId })
  )

/** `Shared.undo` for `chargebacks.restore`. */
export const restore = Commands.restore

/** The `EvidencePackWorkflow`'s steps, as `system` in the case's workspace. */
export { failPack, finishPack, gatherDocument, planPack } from "./use-cases/pack.ts"

/** A case's facts as its documents read them, and whether its pack is being gathered by this run (M15 step 2). */
export { factsOf, isCurrentRun } from "./use-cases/pack.ts"
