import { useParams } from "@tanstack/react-router"
import { type ReactNode, useEffect, useMemo } from "react"
import { toast } from "sonner"
import { MONTHS } from "../lib/analytics/engine"
import { ME } from "../lib/assignees"
import { toCsv } from "../lib/sheets"
import { undoable } from "../lib/undo"
import { useArrival } from "../loading/pace"
import { useSheets } from "../stores/sheets-store"
import { useWorkspace } from "../stores/workspace-store"
import { SHEET_CURRENCY, useFigures } from "./figures"
import { cardOf, type SheetDoc, SheetDocProvider, type SheetsSource, SheetsSourceProvider } from "./sheets-source"

/*
 * Rekenbladen in the design app: the sheets and folders in the browser's store (`sheets-store.ts`), the figures from
 * the analytics history and the cost lines (`figures.ts`), in dollars, over January to May 2026. Each change returns
 * the store's own undo; a CSV is computed and downloaded here.
 */

const store = useSheets.getState

export function DemoSheetsSource({ children }: { children: ReactNode }) {
  const sheets = useSheets((s) => s.sheets)
  const folders = useSheets((s) => s.folders)
  const workspaceMembers = useWorkspace((s) => s.members)
  const figures = useFigures()
  const value = useMemo((): SheetsSource => ({
    sheets: sheets.map(cardOf),
    folders,
    me: ME,
    members: workspaceMembers.map((m) => ({ id: m.id, name: m.name, active: m.status === "active" })),
    currency: SHEET_CURRENCY,
    figures,
    months: MONTHS.map((m) => ({ id: m.id, label: m.label, abbr: m.abbr })),
    create: ({ title, template, folderId }) => Promise.resolve(store().create(title, template, ME, folderId).id),
    importRows: (title, rows) => {
      const s = store().importRows(title, rows.map((r) => [...r]), ME)
      undoable(
        `“${s.title}” geïmporteerd`,
        store().remove([s.id]),
        `${rows.length} rijen. Alles boven 40 rijen of 12 kolommen is weggelaten.`
      )
      return Promise.resolve(s.id)
    },
    patch: (ids, patch, message, description) =>
      undoable(
        message,
        store().patch(ids, {
          ...(patch.title === undefined ? {} : { title: patch.title }),
          ...(patch.folderId === undefined ? {} : { folderId: patch.folderId ?? undefined }),
          ...(patch.pinned === undefined ? {} : { pinned: patch.pinned }),
          ...(patch.archived === undefined ? {} : { archived: patch.archived })
        }),
        description
      ),
    share: (id, memberId, on, message, description) => {
      const s = store().sheets.find((x) => x.id === id)
      if (s === undefined) return
      undoable(
        message,
        store().patch([id], { shared: on ? [...s.shared, memberId] : s.shared.filter((x) => x !== memberId) }),
        description
      )
    },
    duplicate: (id) => {
      const c = store().duplicate(id, ME)
      if (c === undefined) return Promise.resolve(undefined)
      undoable(`“${c.title}” gemaakt`, store().remove([c.id]))
      return Promise.resolve(c.id)
    },
    remove: (ids, message) => undoable(message, store().remove(ids)),
    addFolder: (name, moveSheetIds = []) => {
      const { id } = store().addFolder(name)
      if (moveSheetIds.length > 0) undoable("Map gemaakt", store().patch(moveSheetIds, { folderId: id }))
      return Promise.resolve(id)
    }
  }), [sheets, folders, workspaceMembers, figures])
  return <SheetsSourceProvider value={value}>{children}</SheetsSourceProvider>
}

/** The open sheet from the store; its cells appear a beat after the grid, as the formulas are evaluated here. */
export function DemoSheetDoc({ children }: { children: ReactNode }) {
  const { sheetId } = useParams({ strict: false }) as { sheetId?: string }
  const sheet = useSheets((s) => s.sheets.find((x) => x.id === sheetId))
  const computed = useArrival(`sheet:${sheetId ?? ""}`, 320)
  useEffect(() => {
    if (sheetId !== undefined) store().open(sheetId)
  }, [sheetId])
  const value = useMemo((): SheetDoc => ({
    status: sheet === undefined ? "missing" : "ready",
    sheet: sheet ?? null,
    computed,
    save: "saved",
    setTabs: (tabs) => {
      if (sheet !== undefined) store().setTabs(sheet.id, tabs)
    },
    exportCsv: (tab, rows) => {
      if (sheet === undefined) return
      const blob = new Blob([`﻿${toCsv(rows)}`], { type: "text/csv;charset=utf-8" })
      const a = document.createElement("a")
      a.href = URL.createObjectURL(blob)
      a.download = `${sheet.title} - ${tab.name}.csv`
      a.click()
      URL.revokeObjectURL(a.href)
      toast(`${tab.name} gedownload als CSV`, {
        description: "Met de waarden zoals ze nu staan, gescheiden door puntkomma's."
      })
    }
  }), [sheet, computed])
  return <SheetDocProvider value={value}>{children}</SheetDocProvider>
}
