import { Schema } from "effect"
import { UndoTicket } from "../../shared/domain/Undo.ts"

/*
 * Rekenbladen as the console, `/v1` and MCP read and change them (M14 step 4; widgets/02 Part C, api.md §2.31). A tab
 * is the design's cell model (`@insyte/domain/sheets`): its cells as typed, address → `{ v, fmt?, bold?, align? }`,
 * and its column widths. Nothing computed is kept or sent: the console evaluates the cells, and a figure a cell reads
 * comes from `Analytics.figures`. Times are epoch milliseconds; owners and shares are member ids.
 */

export const Fmt = Schema.Literals(["general", "money", "percent", "number", "integer"])
export const Align = Schema.Literals(["left", "center", "right"])

/** `A1`…`L40`: the twelve columns and forty rows of the grid. */
const Address = Schema.String.check(Schema.isPattern(/^[A-L]([1-9]|[1-3]\d|40)$/))
const Column = Schema.String.check(Schema.isPattern(/^[A-L]$/))
const Width = Schema.Int.check(Schema.isGreaterThanOrEqualTo(56), Schema.isLessThanOrEqualTo(360))

export const Cell = Schema.Struct({
  v: Schema.String.check(Schema.isMaxLength(2000)),
  fmt: Schema.optional(Fmt),
  bold: Schema.optional(Schema.Boolean),
  align: Schema.optional(Align)
})
export type Cell = typeof Cell.Type

/** A tab's id is the editor's own (`tab_…`), so a tab keeps it across saves. */
const TabId = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{1,64}$/))
const TabName = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(40))

export const Tab = Schema.Struct({
  id: TabId,
  name: TabName,
  cells: Schema.Record(Address, Cell),
  widths: Schema.Record(Column, Width)
})
export type Tab = typeof Tab.Type

/** Every tab, in order: at least one and at most twenty. */
export const Tabs = Schema.Array(Tab).check(Schema.isMinLength(1), Schema.isMaxLength(20))

export const Folder = Schema.Struct({ id: Schema.String, name: Schema.String })
export type Folder = typeof Folder.Type

/** A sheet on `/sheets`: what a card and a list row show, with its first tab for the preview. */
export class SheetRow extends Schema.Class<SheetRow>("sheets/SheetRow")({
  id: Schema.String,
  title: Schema.String,
  folderId: Schema.NullOr(Schema.String),
  ownerId: Schema.String,
  sharedWith: Schema.Array(Schema.String),
  /** The reader's own pin. */
  pinned: Schema.Boolean,
  archived: Schema.Boolean,
  /** Any cell reads one of Insyte's figures: the "Insyte" badge. */
  linked: Schema.Boolean,
  createdAt: Schema.Finite,
  updatedAt: Schema.Finite,
  /** When the reader last opened it ("Recent"). */
  openedAt: Schema.NullOr(Schema.Finite),
  previewTab: Schema.NullOr(Tab)
}) {}

export const SheetCounts = Schema.Struct({
  all: Schema.Int,
  pinned: Schema.Int,
  shared: Schema.Int,
  archive: Schema.Int
})
export type SheetCounts = typeof SheetCounts.Type

export const FolderCount = Schema.Struct({ id: Schema.String, name: Schema.String, count: Schema.Int })

export const SheetView = Schema.Literals(["all", "pinned", "recent", "shared", "archive"])
export type SheetView = typeof SheetView.Type

export const ListInput = Schema.Struct({
  /** Without one, every sheet the reader can open, archived ones too: the page cuts them itself. */
  view: Schema.optional(SheetView),
  folderId: Schema.optional(Schema.String),
  q: Schema.optional(Schema.String.check(Schema.isMaxLength(200)))
})
export type ListInput = typeof ListInput.Type

export class SheetList extends Schema.Class<SheetList>("sheets/SheetList")({
  rows: Schema.Array(SheetRow),
  /** Of every sheet the reader can open; `all` leaves the archive out. */
  counts: SheetCounts,
  /** The workspace's folders, each with its sheets the reader can open, the archive left out. */
  folders: Schema.Array(FolderCount),
  /** Whether the reader has any sheet at all, archived ones too: the empty page shows when not. */
  any: Schema.Boolean
}) {}

export class SheetDetail extends Schema.Class<SheetDetail>("sheets/SheetDetail")({
  id: Schema.String,
  title: Schema.String,
  folder: Schema.NullOr(Folder),
  ownerId: Schema.String,
  sharedWith: Schema.Array(Schema.String),
  pinned: Schema.Boolean,
  archived: Schema.Boolean,
  /** The version the tabs are at: a save names it as its `baseVersion`. */
  version: Schema.Int,
  updatedAt: Schema.Finite,
  tabs: Schema.Array(Tab)
}) {}

export const Template = Schema.Literals(["blank", "profit", "ads"])
export type Template = typeof Template.Type

const Title = Schema.String.check(Schema.isMaxLength(120))
const Ids = Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(500))

export const GetInput = Schema.Struct({ id: Schema.String })

export const CreateInput = Schema.Struct({
  /** Empty: the template's own title, or "Naamloos rekenblad" for a blank one. */
  title: Schema.optional(Title),
  template: Template,
  folderId: Schema.optional(Schema.NullOr(Schema.String)),
  /** Given tabs (a CSV import, the first analysis) in place of the template's. */
  tabs: Schema.optional(Tabs),
  source: Schema.optional(Schema.Literals(["csv", "first_analysis"]))
})
export type CreateInput = typeof CreateInput.Type

export const SaveTabsInput = Schema.Struct({ id: Schema.String, baseVersion: Schema.Int, tabs: Tabs })
export type SaveTabsInput = typeof SaveTabsInput.Type

export const UpdateInput = Schema.Struct({
  ids: Ids,
  /** With one id only. */
  title: Schema.optional(Title),
  folderId: Schema.optional(Schema.NullOr(Schema.String)),
  pinned: Schema.optional(Schema.Boolean),
  archived: Schema.optional(Schema.Boolean)
})
export type UpdateInput = typeof UpdateInput.Type

export const ShareInput = Schema.Struct({ id: Schema.String, memberId: Schema.String, on: Schema.Boolean })
export type ShareInput = typeof ShareInput.Type

export const IdsInput = Schema.Struct({ ids: Ids })

export const CreateFolderInput = Schema.Struct({
  name: Schema.String.check(Schema.isMaxLength(60)),
  moveSheetIds: Schema.optional(Schema.Array(Schema.String).check(Schema.isMaxLength(500)))
})
export type CreateFolderInput = typeof CreateFolderInput.Type

export const ExportInput = Schema.Struct({
  id: Schema.String,
  /** Without one, the first tab. */
  tabId: Schema.optional(Schema.String),
  format: Schema.Literal("csv")
})
export type ExportInput = typeof ExportInput.Type

/** What a change did: the sheets as they are now, and the token that puts them back. */
export class SheetChange extends Schema.Class<SheetChange>("sheets/SheetChange")({
  sheets: Schema.Array(SheetRow),
  undo: Schema.NullOr(UndoTicket)
}) {}

export class SheetMade extends Schema.Class<SheetMade>("sheets/SheetMade")({
  sheet: SheetRow,
  undo: UndoTicket
}) {}

export class TabsSaved extends Schema.Class<TabsSaved>("sheets/TabsSaved")({
  version: Schema.Int,
  updatedAt: Schema.Finite
}) {}

export class FolderMade extends Schema.Class<FolderMade>("sheets/FolderMade")({
  folder: Folder,
  undo: UndoTicket
}) {}

/** A tab's values as computed now, the figures read again on the server, ready to download. */
export class SheetExport extends Schema.Class<SheetExport>("sheets/SheetExport")({
  fileName: Schema.String,
  contentType: Schema.String,
  content: Schema.String
}) {}

/** No such sheet, or not one the reader may open: the same answer, so existence does not leak. */
export class SheetNotFound extends Schema.TaggedError<SheetNotFound>()("SheetNotFound", { id: Schema.String }) {}

export class FolderNotFound extends Schema.TaggedError<FolderNotFound>()("FolderNotFound", { id: Schema.String }) {}

/** A folder by that name already exists in the workspace (case aside). */
export class FolderNameTaken extends Schema.TaggedError<FolderNameTaken>()("FolderNameTaken", {}) {}

/** Only the owner shares or removes a sheet. */
export class NotSheetOwner extends Schema.TaggedError<NotSheetOwner>()("NotSheetOwner", { id: Schema.String }) {}

/** The member to share with has left the team or never joined. */
export class ShareTargetInactive extends Schema.TaggedError<ShareTargetInactive>()("ShareTargetInactive", {
  memberId: Schema.String
}) {}

/** The snapshot a sheet change's undo puts back (`sheets.restore`). */
export const SheetsRestore = Schema.Struct({
  sheets: Schema.Array(Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    folderId: Schema.NullOr(Schema.String),
    archived: Schema.Boolean,
    deleted: Schema.Boolean
  })),
  /** The reader's own pins as they were. */
  pins: Schema.Array(Schema.Struct({ id: Schema.String, pinned: Schema.Boolean })),
  /** A share as it was: `on` false takes it away again. */
  shares: Schema.Array(Schema.Struct({ id: Schema.String, memberId: Schema.String, on: Schema.Boolean })),
  /** A folder the change made, removed again. */
  folderId: Schema.NullOr(Schema.String)
})
export type SheetsRestore = typeof SheetsRestore.Type
