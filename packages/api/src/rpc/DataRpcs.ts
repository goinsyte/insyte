import { Forbidden } from "@insyte/domain/Errors"
import {
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
} from "@insyte/modules/data/domain/Data"
import { FilterFieldUnknown } from "@insyte/modules/shared/domain/Filter"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

const Missing = Schema.Union([Forbidden, ImportNotFound])

/**
 * The Data hub (M14 step 5; api.md §2.30): the hub's counts, CSV imports and exports. Data · Bekijken reads; bringing
 * a file in and taking it out needs Data · Importeren (level 2), each with its undo token (`data.restore`); an
 * export needs Data · Exporteren (`data.export`) and arrives as `job.progress{ export }` and a notification. The file
 * itself is uploaded first through `PUT /api/data/imports`.
 */
export class DataRpcs extends RpcGroup.make(
  Rpc.make("Data.overview", { success: DataOverview, error: Forbidden }),
  Rpc.make("Data.imports.list", { success: ImportList, error: Forbidden }),
  Rpc.make("Data.imports.upload", {
    payload: UploadImportInput,
    success: ImportFile,
    error: Schema.Union([Forbidden, UploadNotFound])
  }),
  Rpc.make("Data.imports.preview", { payload: ImportIdInput, success: ImportPreview, error: Missing }),
  Rpc.make("Data.imports.rows", { payload: ImportRowsInput, success: ImportRows, error: Missing }),
  Rpc.make("Data.imports.commit", {
    payload: ImportIdInput,
    success: ImportChange,
    error: Schema.Union([Forbidden, ImportNotFound, ImportNotReady])
  }),
  Rpc.make("Data.imports.remove", { payload: ImportIdInput, success: ImportChange, error: Missing }),
  Rpc.make("Data.imports.restore", { payload: ImportIdInput, success: ImportChange, error: Missing }),
  Rpc.make("Data.export", {
    payload: RequestExportInput,
    success: ExportRow,
    error: Schema.Union([Forbidden, ImportNotFound, ImportNotReady, UnknownColumn, FilterFieldUnknown])
  }),
  Rpc.make("Data.exports.list", { payload: ExportsListInput, success: ExportList, error: Forbidden }),
  Rpc.make("Data.exports.get", {
    payload: ExportIdInput,
    success: ExportRow,
    error: Schema.Union([Forbidden, ExportNotFound])
  })
)
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
