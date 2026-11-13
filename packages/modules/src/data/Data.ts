import type { Db } from "@insyte/database/Db"
import type { Forbidden, Invalid } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import type { FileStore } from "../shared/domain/Documents.ts"
import type { FilterFieldUnknown } from "../shared/domain/Filter.ts"
import type {
  DataOverview,
  ExportIdInput,
  ExportList,
  ExportNotFound,
  ExportRow,
  ExportsListInput,
  ImportChange,
  ImportFile,
  ImportIdInput,
  ImportList,
  ImportNotFound,
  ImportNotReady,
  ImportPreview,
  ImportRows,
  ImportRowsInput,
  RequestExportInput,
  UnknownColumn,
  UploadImportInput,
  UploadNotFound
} from "./domain/Data.ts"
import * as Exports from "./use-cases/exports.ts"
import * as Imports from "./use-cases/imports.ts"
import { overview } from "./use-cases/overview.ts"

type R = Db | CurrentPrincipal

const run = <A, E, Req>(effect: Effect.Effect<A, E | SqlError.SqlError, Req>) =>
  effect.pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)) as Effect.Effect<A, Exclude<E, SqlError.SqlError>, Req>

/**
 * The Data hub (M14 step 5): its counts, CSV imports and exports. Data · Bekijken reads; Data · Importeren (level 2)
 * brings files in and takes them out, each with its undo; an export needs Data · Exporteren (`data.export`) and is
 * written by the `ExportWorkflow` on the jobs Worker.
 *
 * @effect-expect-leaking Db CurrentPrincipal FileStore
 */
export class DataService extends Context.Service<DataService, {
  readonly overview: Effect.Effect<DataOverview, Forbidden, R>
  /** The CSV's bytes as uploaded through the session's route, before it is an import. */
  readonly storeUpload: (input: {
    readonly name: string
    readonly mime: string
    readonly bytes: Uint8Array
  }) => Effect.Effect<
    { readonly fileId: string; readonly name: string; readonly sizeBytes: number },
    Forbidden | Invalid,
    R | FileStore
  >
  readonly imports: {
    readonly list: Effect.Effect<ImportList, Forbidden, R>
    readonly upload: (input: UploadImportInput) => Effect.Effect<ImportFile, Forbidden | UploadNotFound, R>
    readonly preview: (input: ImportIdInput) => Effect.Effect<ImportPreview, Forbidden | ImportNotFound, R>
    readonly rows: (input: ImportRowsInput) => Effect.Effect<ImportRows, Forbidden | ImportNotFound, R>
    readonly commit: (
      input: ImportIdInput
    ) => Effect.Effect<ImportChange, Forbidden | ImportNotFound | ImportNotReady, R>
    readonly remove: (input: ImportIdInput) => Effect.Effect<ImportChange, Forbidden | ImportNotFound, R | FileStore>
    readonly restore: (input: ImportIdInput) => Effect.Effect<ImportChange, Forbidden | ImportNotFound, R>
  }
  readonly export: (
    input: RequestExportInput
  ) => Effect.Effect<
    ExportRow,
    Forbidden | ImportNotFound | ImportNotReady | UnknownColumn | FilterFieldUnknown,
    R
  >
  readonly exports: {
    readonly list: (input: ExportsListInput) => Effect.Effect<ExportList, Forbidden, R>
    readonly get: (input: ExportIdInput) => Effect.Effect<ExportRow, Forbidden | ExportNotFound, R>
  }
}>()("modules/DataService") {
  // A database that does not answer is a defect, as everywhere.
  static readonly layer = Layer.succeed(DataService, {
    overview: run(overview()),
    storeUpload: (input) => run(Imports.storeUpload(input)),
    imports: {
      list: run(Imports.list()),
      upload: (input) => run(Imports.upload(input)),
      preview: (input) => run(Imports.preview(input)),
      rows: (input) => run(Imports.rows(input)),
      commit: (input) => run(Imports.commit(input)),
      remove: (input) => run(Imports.remove(input)),
      restore: (input) => run(Imports.restore(input))
    },
    export: (input) => run(Exports.request(input)),
    exports: {
      list: (input) => run(Exports.list(input)),
      get: (input) => run(Exports.get(input))
    }
  })
}

/** `Shared.undo` for `data.restore`. */
export const restore = Imports.restoreSnapshot

/** The nightly purge of removed imports and files never imported, as `system` in one workspace. */
export const purgeImports = Imports.purgeIn

/** The `ImportParseWorkflow`'s step, as `system` in the import's workspace, and what it does when it gives up. */
export { markUnreadable, parse, type ParseOutcome } from "./use-cases/parse.ts"

/** The hub's export sources, for the `ExportWorkflow`'s registry. */
export { importSource, ordersSource, ordersSourceOf } from "./use-cases/sources.ts"
