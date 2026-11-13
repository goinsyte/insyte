import { Conflict, Forbidden, Invalid } from "@insyte/domain/Errors"
import {
  CreateFolderInput,
  CreateInput,
  ExportInput,
  FolderCount,
  FolderMade,
  FolderNameTaken,
  FolderNotFound,
  GetInput,
  IdsInput,
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
} from "@insyte/modules/sheets/domain/Sheets"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

const Missing = Schema.Union([Forbidden, SheetNotFound])

/**
 * Rekenbladen (M14 step 4; api.md §2.31): the member's sheets with the panel's counts and folders, one sheet with its
 * tabs, and every change with its undo token. Data · Bekijken for each; a stale save is `Conflict { stale_version }`;
 * only the owner shares and removes; the CSV export needs Data · Exporteren.
 */
export class SheetsRpcs extends RpcGroup.make(
  Rpc.make("Sheets.list", { payload: ListInput, success: SheetList, error: Forbidden }),
  Rpc.make("Sheets.counts", { success: SheetCounts, error: Forbidden }),
  Rpc.make("Sheets.folders", { success: Schema.Array(FolderCount), error: Forbidden }),
  Rpc.make("Sheets.get", { payload: GetInput, success: SheetDetail, error: Missing }),
  Rpc.make("Sheets.create", {
    payload: CreateInput,
    success: SheetMade,
    error: Schema.Union([Forbidden, Invalid, FolderNotFound])
  }),
  Rpc.make("Sheets.saveTabs", {
    payload: SaveTabsInput,
    success: TabsSaved,
    error: Schema.Union([Forbidden, Invalid, Conflict, SheetNotFound])
  }),
  Rpc.make("Sheets.update", {
    payload: UpdateInput,
    success: SheetChange,
    error: Schema.Union([Forbidden, Invalid, SheetNotFound, FolderNotFound])
  }),
  Rpc.make("Sheets.share", {
    payload: ShareInput,
    success: SheetChange,
    error: Schema.Union([Forbidden, Invalid, SheetNotFound, NotSheetOwner, ShareTargetInactive])
  }),
  Rpc.make("Sheets.duplicate", { payload: GetInput, success: SheetMade, error: Missing }),
  Rpc.make("Sheets.remove", {
    payload: IdsInput,
    success: SheetChange,
    error: Schema.Union([Forbidden, SheetNotFound, NotSheetOwner])
  }),
  Rpc.make("Sheets.restore", {
    payload: IdsInput,
    success: SheetChange,
    error: Schema.Union([Forbidden, SheetNotFound, NotSheetOwner])
  }),
  Rpc.make("Sheets.markOpened", { payload: GetInput, error: Missing }),
  Rpc.make("Sheets.createFolder", {
    payload: CreateFolderInput,
    success: FolderMade,
    error: Schema.Union([Forbidden, Invalid, FolderNameTaken, SheetNotFound])
  }),
  Rpc.make("Sheets.export", { payload: ExportInput, success: SheetExport, error: Missing })
)
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
