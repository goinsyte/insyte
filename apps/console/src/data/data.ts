import { Forbidden, NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { DataOverview, ExportList, ImportList, type ImportRows } from "@insyte/modules/data/domain/Data"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"

/*
 * The Data hub (M14 step 5): its counts, the imported files and the member's own exports, primed by the route's loader
 * and carried in the document; an imported file's rows when Tabel or Exporteren opens it. Every Data command names
 * `DATA`, as do an import's read and an export's progress frames (`realtime.ts`); a store's change names it too, since
 * the counts read the orders and the stores.
 */

export const DATA = ["data"] as const

/** Rows Tabel holds of an imported file. */
const ROWS = 1000

const errors = Schema.Union([Forbidden, NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])

export const dataOverviewAtom = Atom.serializable(
  ConsoleClient.query("Data.overview", undefined, { reactivityKeys: DATA }),
  { key: "data.overview", schema: AsyncResult.Schema({ success: DataOverview, error: errors }), skipInitialRun: true }
)

export const importsAtom = Atom.serializable(
  ConsoleClient.query("Data.imports.list", undefined, { reactivityKeys: DATA }),
  { key: "data.imports", schema: AsyncResult.Schema({ success: ImportList, error: errors }), skipInitialRun: true }
)

export const exportsAtom = Atom.serializable(
  ConsoleClient.query("Data.exports.list", {}, { reactivityKeys: DATA }),
  { key: "data.exports", schema: AsyncResult.Schema({ success: ExportList, error: errors }), skipInitialRun: true }
)

/** An imported file's first rows, for Tabel and the export's preview. */
export const importRowsAtom = Atom.family((importId: string) =>
  ConsoleClient.query("Data.imports.rows", { importId, limit: ROWS }, { reactivityKeys: [`data-import:${importId}`] })
)

/** No file open: Tabel and Exporteren on the orders. */
export const NO_ROWS = Atom.make(AsyncResult.initial<ImportRows, never>())

export const dataWrites = {
  upload: ConsoleClient.mutation("Data.imports.upload"),
  preview: ConsoleClient.mutation("Data.imports.preview"),
  commit: ConsoleClient.mutation("Data.imports.commit"),
  remove: ConsoleClient.mutation("Data.imports.remove"),
  request: ConsoleClient.mutation("Data.export"),
  undo: ConsoleClient.mutation("Shared.undo")
} as const
