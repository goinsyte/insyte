import type { Db } from "@insyte/database/Db"
import type { Conflict, Forbidden, Invalid } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import { SheetFigures } from "./domain/Ports.ts"
import type {
  CreateFolderInput,
  CreateInput,
  ExportInput,
  FolderMade,
  FolderNameTaken,
  FolderNotFound,
  ListInput,
  NotSheetOwner,
  SaveTabsInput,
  ShareInput,
  ShareTargetInactive,
  SheetChange,
  SheetCounts,
  SheetDetail,
  SheetExport,
  SheetList,
  SheetMade,
  SheetNotFound,
  TabsSaved,
  UpdateInput
} from "./domain/Sheets.ts"
import * as Commands from "./use-cases/commands.ts"
import * as Reads from "./use-cases/reads.ts"

type R = Db | CurrentPrincipal
type Ids = { readonly ids: ReadonlyArray<string> }
type Id = { readonly id: string }

/**
 * Rekenbladen (M14 step 4): the member's own sheets and those shared with them, kept as typed, every change with its
 * undo token and a save refused when it is stale. Data · Bekijken for all of it; only the owner shares and removes;
 * an export needs Data · Exporteren and reads the figures again through `SheetFigures`.
 *
 * @effect-expect-leaking Db CurrentPrincipal
 */
export class SheetsService extends Context.Service<SheetsService, {
  readonly list: (input: ListInput) => Effect.Effect<SheetList, Forbidden, R>
  readonly counts: Effect.Effect<SheetCounts, Forbidden, R>
  readonly folders: Effect.Effect<SheetList["folders"], Forbidden, R>
  readonly get: (input: Id) => Effect.Effect<SheetDetail, Forbidden | SheetNotFound, R>
  readonly create: (
    input: CreateInput
  ) => Effect.Effect<SheetMade, Forbidden | Invalid | FolderNotFound, R>
  readonly saveTabs: (
    input: SaveTabsInput
  ) => Effect.Effect<TabsSaved, Forbidden | Invalid | Conflict | SheetNotFound, R>
  readonly update: (
    input: UpdateInput
  ) => Effect.Effect<SheetChange, Forbidden | Invalid | SheetNotFound | FolderNotFound, R>
  readonly share: (
    input: ShareInput
  ) => Effect.Effect<SheetChange, Forbidden | Invalid | SheetNotFound | NotSheetOwner | ShareTargetInactive, R>
  readonly duplicate: (input: Id) => Effect.Effect<SheetMade, Forbidden | SheetNotFound, R>
  readonly remove: (input: Ids) => Effect.Effect<SheetChange, Forbidden | SheetNotFound | NotSheetOwner, R>
  readonly restore: (input: Ids) => Effect.Effect<SheetChange, Forbidden | SheetNotFound | NotSheetOwner, R>
  readonly markOpened: (input: Id) => Effect.Effect<void, Forbidden | SheetNotFound, R>
  readonly createFolder: (
    input: CreateFolderInput
  ) => Effect.Effect<FolderMade, Forbidden | Invalid | FolderNameTaken | SheetNotFound, R>
  readonly export: (input: ExportInput) => Effect.Effect<SheetExport, Forbidden | SheetNotFound, R>
}>()("modules/SheetsService") {
  // A database that does not answer is a defect, as everywhere. The figures link is taken once.
  static readonly layer = Layer.effect(
    SheetsService,
    Effect.gen(function*() {
      const figures = yield* SheetFigures
      const run = <A, E, Req>(effect: Effect.Effect<A, E | SqlError.SqlError, Req>) =>
        effect.pipe(Effect.provideService(SheetFigures, figures), Effect.catchIf(SqlError.isSqlError, Effect.die))
      return {
        list: (input) => run(Reads.list(input)),
        counts: run(Reads.counts()),
        folders: run(Reads.folders()),
        get: ({ id }) => run(Reads.get(id)),
        create: (input) => run(Commands.create(input)),
        saveTabs: (input) => run(Commands.saveTabs(input)),
        update: (input) => run(Commands.update(input)),
        share: (input) => run(Commands.share(input)),
        duplicate: (input) => run(Commands.duplicate(input)),
        remove: (input) => run(Commands.remove(input)),
        restore: (input) => run(Commands.restoreSheets(input)),
        markOpened: (input) => run(Commands.markOpened(input)),
        createFolder: (input) => run(Commands.createFolder(input)),
        export: (input) => run(Commands.exportTab(input))
      }
    })
  )
}
