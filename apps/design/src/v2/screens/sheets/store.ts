import { useSyncExternalStore } from "react"
import { BUSY_SHEETS, FOLDERS, profitTab, SHEETS, tabFrom } from "../../fixtures/sheets.ts"
import type { Cell, Folder, Sheet, Tab } from "../../fixtures/sheets.ts"
import { useView } from "../../view.ts"

/**
 * What the demo changes about the sheets while it is looked at: a new sheet or folder, a pin, an
 * archive, a rename, an edited cell, a new tab. Module state, so the list and the editor agree.
 */

type State = {
  readonly created: ReadonlyArray<Sheet>
  readonly folders: ReadonlyArray<Folder>
  readonly patches: Readonly<Record<string, Partial<Sheet>>>
}

let state: State = { created: [], folders: [], patches: {} }
const listeners = new Set<() => void>()
const set = (next: State) => {
  state = next
  for (const listener of listeners) listener()
}
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const useStore = () => useSyncExternalStore(subscribe, () => state)

export function useSheets(): ReadonlyArray<Sheet> {
  const s = useStore()
  const view = useView()
  const base = view.staat === "leeg" ? [] : view.staat === "druk" ? [...SHEETS, ...BUSY_SHEETS] : SHEETS
  return [...s.created, ...base].map((sh) => ({ ...sh, ...s.patches[sh.id] }))
}

export function useFolders(): ReadonlyArray<Folder> {
  const s = useStore()
  const view = useView()
  return [...(view.staat === "leeg" ? [] : FOLDERS), ...s.folders]
}

/** The sheet as it stands, for the werkdraad (no view: the demo's normal Monday plus what was made). */
export const getSheet = (id: string) => {
  const sh = [...state.created, ...SHEETS, ...BUSY_SHEETS].find((x) => x.id === id)
  return sh === undefined ? undefined : { ...sh, ...state.patches[id] }
}

export function patchSheet(id: string, next: Partial<Sheet>) {
  set({ ...state, patches: { ...state.patches, [id]: { ...state.patches[id], ...next } } })
}

export function setTabs(id: string, tabs: ReadonlyArray<Tab>) {
  patchSheet(id, { tabs, updated: "zojuist" })
}

/** Sets cells on one tab; `null` empties a cell. */
export function setCells(sheet: Sheet, tabId: string, cells: Readonly<Record<string, Cell | null>>) {
  setTabs(
    sheet.id,
    sheet.tabs.map((t) => {
      if (t.id !== tabId) return t
      const next: Record<string, Cell> = { ...t.cells }
      for (const [k, c] of Object.entries(cells)) {
        if (c === null || c.v === "") delete next[k]
        else next[k] = c
      }
      return { ...t, cells: next }
    })
  )
}

let made = 0

export function createFolder(name: string): string {
  made += 1
  const id = `map-${made}`
  set({ ...state, folders: [...state.folders, { id, name }] })
  return id
}

export type Start = "winst" | "leeg"

export function createSheet(title: string, folderId: string | null, start: Start): string {
  made += 1
  const id = `blad-${made}`
  const tab = start === "winst" ? profitTab(`tab-${id}`) : tabFrom(`tab-${id}`, "Blad 1", [])
  const sheet: Sheet = {
    id,
    title,
    folderId,
    pinned: false,
    archived: false,
    owner: "elena",
    shared: [],
    updated: "zojuist",
    opened: 0,
    tabs: [tab],
    reads: start === "winst" ? [{ kind: "page", label: "Kosten", href: "/v2/kosten", meta: "omzet en kosten" }] : []
  }
  set({ ...state, created: [sheet, ...state.created] })
  return id
}
