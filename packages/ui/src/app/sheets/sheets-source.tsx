import { createContext, type ReactNode, useContext } from "react"
import type { TemplateId } from "../lib/sheet-templates"
import type { Figures, Folder, Sheet, Tab } from "../lib/sheets"

/**
 * What Rekenbladen (`/sheets`) reads and does, from whoever hosts it (as `analytics-source.tsx` is for Analyse): the
 * design app keeps its sheets in the browser and reads its figures from the analytics history; the console reads and
 * writes them through `Sheets.*` and its figures through `Analytics.figures` (M14 step 4). Each change says itself and
 * carries its own undo, so the screens only ask; the host knows whether that is a store's function or a server token.
 */

/** A sheet on the list: what a card and a row show, with its first tab for the preview. */
export interface SheetCard {
  id: string
  title: string
  folderId?: string | undefined
  pinned: boolean
  archived: boolean
  ownerId: string
  shared: ReadonlyArray<string>
  /** ISO. */
  updatedAt: string
  openedAt?: string | undefined
  /** Any cell reads one of Insyte's figures: the "Insyte" badge. */
  linked: boolean
  preview: Tab | null
}

export interface SheetMember {
  id: string
  name: string
  active: boolean
}

/** A month INSYTE() can read, as the link picker offers it. */
export interface SheetMonth {
  /** `YYYY-MM`. */
  id: string
  label: string
  abbr: string
}

export interface SheetPatch {
  title?: string | undefined
  /** `null` takes it out of its folder. */
  folderId?: string | null | undefined
  pinned?: boolean | undefined
  archived?: boolean | undefined
}

export interface SheetsSource {
  /** `null` while the list is read the first time. */
  sheets: ReadonlyArray<SheetCard> | null
  folders: ReadonlyArray<Folder>
  /** The reader's own member id. */
  me: string
  members: ReadonlyArray<SheetMember>
  /** Every amount's currency. */
  currency: string
  /** What INSYTE() answers: a number, or why there is none. */
  figures: Figures
  /** The months the link picker offers, oldest first; the last is the default. */
  months: ReadonlyArray<SheetMonth>
  /** The new sheet's id once it is made; `undefined` when it was not. */
  create: (input: { title: string; template: TemplateId; folderId?: string | undefined }) => Promise<string | undefined>
  importRows: (title: string, rows: ReadonlyArray<ReadonlyArray<string>>) => Promise<string | undefined>
  /** Says `message` with its undo. */
  patch: (ids: ReadonlyArray<string>, patch: SheetPatch, message: string, description?: string) => void
  share: (id: string, memberId: string, on: boolean, message: string, description?: string) => void
  duplicate: (id: string) => Promise<string | undefined>
  remove: (ids: ReadonlyArray<string>, message: string) => void
  /** The new folder's id, with the sheets moved into it. */
  addFolder: (name: string, moveSheetIds?: ReadonlyArray<string>) => Promise<string | undefined>
}

/** The open sheet, from whoever hosts the editor. */
export interface SheetDoc {
  status: "loading" | "ready" | "missing"
  sheet: Sheet | null
  /** Whether the figures are in: until then the cells show their bones (ADR-0028). */
  computed: boolean
  /** The save of the last edit: the header says it. */
  save: "saved" | "saving" | "failed"
  /** Every edit, as the whole tab list; the host saves it. */
  setTabs: (tabs: Array<Tab>) => void
  /** "CSV": the tab's values as the screen computed them (`rows`); a host may compute them itself. */
  exportCsv: (tab: Tab, rows: Array<Array<string>>) => void
}

const SourceContext = createContext<SheetsSource | null>(null)
const DocContext = createContext<SheetDoc | null>(null)

export function SheetsSourceProvider({ value, children }: { value: SheetsSource; children: ReactNode }) {
  return <SourceContext.Provider value={value}>{children}</SourceContext.Provider>
}

export function SheetDocProvider({ value, children }: { value: SheetDoc; children: ReactNode }) {
  return <DocContext.Provider value={value}>{children}</DocContext.Provider>
}

export function useSheetsSource(): SheetsSource {
  const source = useContext(SourceContext)
  if (source === null) throw new Error("Rekenbladen needs a SheetsSourceProvider")
  return source
}

export function useSheetDoc(): SheetDoc {
  const doc = useContext(DocContext)
  if (doc === null) throw new Error("A rekenblad needs a SheetDocProvider")
  return doc
}

/** A sheet as its card shows it. */
export const cardOf = (s: Sheet): SheetCard => ({
  id: s.id,
  title: s.title,
  folderId: s.folderId,
  pinned: s.pinned,
  archived: s.archived,
  ownerId: s.ownerId,
  shared: s.shared,
  updatedAt: s.updatedAt,
  openedAt: s.openedAt,
  linked: s.tabs.some((t) => Object.values(t.cells).some((c) => /INSYTE\(/i.test(c.v))),
  preview: s.tabs[0] ?? null
})
