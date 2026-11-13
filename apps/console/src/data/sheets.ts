import { Forbidden, NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { SheetDetail, SheetList, SheetNotFound } from "@insyte/modules/sheets/domain/Sheets"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ANALYTICS } from "./analytics.ts"
import { ConsoleClient } from "./client.ts"

/*
 * Rekenbladen (M14 step 4): the reader's sheets with the panel's counts and the folders, primed by the route's loader
 * and carried in the document; one sheet with its tabs when it is opened. A `sheet.changed` frame names `SHEETS` and
 * that sheet's key (`realtime.ts`); the figures its cells read are one batch per screen, read again when an order, a
 * ticket or a store changes (`ANALYTICS`). Every write names what it changes.
 */

export const SHEETS = ["sheets"] as const

/** One sheet's key, so a change to it reads only that sheet again. */
export const sheetKey = (id: string) => `sheet:${id}`

const errors = Schema.Union([Forbidden, NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])

export const sheetsAtom = Atom.serializable(
  ConsoleClient.query("Sheets.list", {}, { reactivityKeys: SHEETS }),
  {
    key: "sheets.list",
    schema: AsyncResult.Schema({ success: SheetList, error: errors }),
    skipInitialRun: true
  }
)

export const sheetAtom = Atom.family((id: string) =>
  Atom.serializable(
    ConsoleClient.query("Sheets.get", { id }, { reactivityKeys: [sheetKey(id)] }),
    {
      key: `sheets.get:${id}`,
      schema: AsyncResult.Schema({ success: SheetDetail, error: Schema.Union([SheetNotFound, errors]) }),
      skipInitialRun: true
    }
  )
)

/** The figures a screen's cells read, keyed by the requests as JSON (one order, so the same cells are the same read). */
export const figuresAtom = Atom.family((key: string) =>
  ConsoleClient.query(
    "Analytics.figures",
    { requests: JSON.parse(key) as ReadonlyArray<{ metric: string; month?: string }> },
    { reactivityKeys: ANALYTICS }
  )
)

export const sheetWrites = {
  create: ConsoleClient.mutation("Sheets.create"),
  saveTabs: ConsoleClient.mutation("Sheets.saveTabs"),
  update: ConsoleClient.mutation("Sheets.update"),
  share: ConsoleClient.mutation("Sheets.share"),
  duplicate: ConsoleClient.mutation("Sheets.duplicate"),
  remove: ConsoleClient.mutation("Sheets.remove"),
  markOpened: ConsoleClient.mutation("Sheets.markOpened"),
  createFolder: ConsoleClient.mutation("Sheets.createFolder"),
  export: ConsoleClient.mutation("Sheets.export"),
  undo: ConsoleClient.mutation("Shared.undo")
} as const
