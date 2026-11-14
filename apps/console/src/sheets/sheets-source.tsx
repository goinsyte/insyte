import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Frame } from "@insyte/api/rpc/ShellRpcs"
import { figureKey, figureRequests, MONTH_NAMES } from "@insyte/domain/sheets"
import type { AnalyticsFigures, FigureAnswer } from "@insyte/modules/analytics/domain/Analytics"
import type { SheetDetail, SheetList, SheetRow } from "@insyte/modules/sheets/domain/Sheets"
import type { TemplateId } from "@insyte/ui/app/lib/sheet-templates"
import type { Figures, Sheet, SheetError, Tab } from "@insyte/ui/app/lib/sheets"
import { undoable } from "@insyte/ui/app/lib/undo"
import {
  type SheetCard,
  type SheetDoc,
  SheetDocProvider,
  type SheetMonth,
  type SheetsSource,
  SheetsSourceProvider,
  useSheetsSource
} from "@insyte/ui/app/sheets/sheets-source"
import { Exit, Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { figuresAtom, sheetAtom, sheetKey, SHEETS, sheetWrites } from "../data/sheets.ts"
import { failureOf, type RefusalCopy, sayRefusal } from "../frame/refusals.ts"

/*
 * Rekenbladen in the console (M14 step 4): the list, the folders and the open sheet from `Sheets.*`, every change with
 * the server's undo token; the cells evaluated here with the figures `Analytics.figures` reads for exactly the cells
 * shown, in one batch. An edit is kept on screen at once and saved after a pause in typing, naming the version it
 * started from: a save someone else's overtook is refused, said, and the sheet read again. What Insyte cannot read
 * says why, never a number it made up.
 */

/** How long typing pauses before the tabs are saved. */
const SAVE_AFTER_MS = 800

const iso = (ms: number) => new Date(ms).toISOString()

const cardOf = (r: SheetRow): SheetCard => ({
  id: r.id,
  title: r.title,
  folderId: r.folderId ?? undefined,
  pinned: r.pinned,
  archived: r.archived,
  ownerId: r.ownerId,
  shared: r.sharedWith,
  updatedAt: iso(r.updatedAt),
  openedAt: r.openedAt === null ? undefined : iso(r.openedAt),
  linked: r.linked,
  preview: r.previewTab === null
    ? null
    : { ...r.previewTab, cells: { ...r.previewTab.cells }, widths: { ...r.previewTab.widths } }
})

const COPY: RefusalCopy = {
  gone: "Dit rekenblad bestaat niet meer",
  conflicts: {
    stale_version: ["Iemand anders heeft dit blad net aangepast", "Je ziet nu de nieuwste versie."]
  },
  invalid: {
    title: "Geef het rekenblad een naam.",
    required: "Geef het een naam.",
    one_sheet: "Hernoem één rekenblad tegelijk.",
    name: "Geef de map een naam."
  },
  other: (tagged) => {
    switch (tagged._tag) {
      case "SheetNotFound":
        return void toast.error("Dit rekenblad bestaat niet meer", { description: "Iemand anders was je voor." }), true
      case "FolderNotFound":
        return void toast.error("Die map bestaat niet meer"), true
      case "FolderNameTaken":
        return void toast.error("Er is al een map met die naam"), true
      case "NotSheetOwner":
        return void toast.error("Alleen de eigenaar kan dit", {
          description: "Delen en verwijderen doet wie het blad heeft gemaakt."
        }),
          true
      case "ShareTargetInactive":
        return void toast.error("Die collega is niet meer actief"), true
      default:
        return false
    }
  }
}

/** Says a refusal; true when the write went through. */
function ok<A>(exit: Exit.Exit<A, unknown>): exit is Exit.Success<A, unknown> {
  if (Exit.isSuccess(exit)) return true
  sayRefusal(failureOf(exit), COPY)
  return false
}

const keysFor = (ids: ReadonlyArray<string>) => ({ reactivityKeys: [...SHEETS, ...ids.map(sheetKey)] })

/* ── the figures ─────────────────────────────────────────────────────────────────────────────── */

/** A month as the link picker offers it: "april 2026" by its Dutch name. */
const monthOf = (id: string): SheetMonth => {
  const name = MONTH_NAMES[Number(id.slice(5, 7)) - 1]
  return { id, label: name?.label ?? id, abbr: name?.abbr ?? id }
}

const WAITS: Record<string, string> = {
  channels: "Omzet per marketingkanaal houdt Insyte nog niet bij, dus dit cijfer is nog niet beschikbaar."
}

/** The engine's answer for one figure: its number, or the error and why, in a sentence. */
const valueOf = (f: FigureAnswer, months: ReadonlyArray<string>): number | SheetError => {
  if (f.value !== null) return f.value
  switch (f.error) {
    case "unknown_metric":
      return { error: "#NAAM?", why: `Insyte kent het cijfer “${f.metric}” niet. Kies er een via Koppelen aan Insyte.` }
    case "forbidden":
      return { error: "#N/B", why: "Je rol kan dit cijfer niet zien." }
    case "no_ads":
      return { error: "#DEEL/0!", why: "Er zijn in deze maand geen advertentiekosten, dus er is geen ROAS." }
    case "no_month": {
      const first = months[0]
      const last = months.at(-1)
      return {
        error: "#N/B",
        why: first === undefined || last === undefined
          ? "Insyte heeft nog geen cijfers: er zijn nog geen bestellingen."
          : `Insyte heeft geen cijfers voor “${f.month ?? ""}”. Kies een maand van ${monthOf(first).label} ${
            first.slice(0, 4)
          } tot ${monthOf(last).label} ${last.slice(0, 4)}, zoals "${last}".`
      }
    }
    default:
      return { error: "#N/B", why: WAITS[f.waitsFor ?? ""] ?? "Dit cijfer is er nog niet." }
  }
}

const FETCHING: SheetError = { error: "#N/B", why: "Insyte haalt dit cijfer op." }
const UNREACHABLE: SheetError = { error: "#N/B", why: "Insyte kan dit cijfer nu niet ophalen." }

interface Read {
  readonly figures: Figures
  readonly currency: string | undefined
  readonly months: ReadonlyArray<SheetMonth> | undefined
  /** Whether the figures for these tabs are in (or could not be read). */
  readonly computed: boolean
}

/** The figures these tabs read, in one batch; the last batch stays up while a changed cell's is read. */
function useFiguresFor(tabs: ReadonlyArray<Tab>): Read {
  const known = useRef<AnalyticsFigures | undefined>(undefined)
  const key = useMemo(() => {
    const requests = figureRequests(tabs).map((r) => (r.month === undefined ? { metric: r.metric } : r))
    return JSON.stringify(
      requests.toSorted((a, b) => figureKey(a.metric, a.month).localeCompare(figureKey(b.metric, b.month)))
    )
  }, [tabs])
  const result = useAtomValue(figuresAtom(key))
  const read = AsyncResult.isSuccess(result) ? result.value : Option.getOrUndefined(AsyncResult.value(result))
  if (read !== undefined) known.current = read
  const failed = AsyncResult.isFailure(result) && !result.waiting
  const current = known.current
  return useMemo(() => {
    const answers = new Map(current?.figures.map((f) => [figureKey(f.metric, f.month), f]) ?? [])
    return {
      figures: (metric, month) => {
        const f = answers.get(figureKey(metric, month))
        if (f !== undefined) return valueOf(f, current?.months ?? [])
        return failed ? UNREACHABLE : FETCHING
      },
      currency: current?.currency,
      months: current?.months.map(monthOf),
      computed: read !== undefined || failed
    }
  }, [current, failed, read])
}

/* ── the list ─────────────────────────────────────────────────────────────────────────────────── */

export function ConsoleSheetsSource({ frame, list, children }: { frame: Frame; list: SheetList; children: ReactNode }) {
  const write = {
    create: useAtomSet(sheetWrites.create, { mode: "promiseExit" }),
    update: useAtomSet(sheetWrites.update, { mode: "promiseExit" }),
    share: useAtomSet(sheetWrites.share, { mode: "promiseExit" }),
    duplicate: useAtomSet(sheetWrites.duplicate, { mode: "promiseExit" }),
    remove: useAtomSet(sheetWrites.remove, { mode: "promiseExit" }),
    createFolder: useAtomSet(sheetWrites.createFolder, { mode: "promiseExit" }),
    undo: useAtomSet(sheetWrites.undo, { mode: "promiseExit" })
  }
  const previews = useMemo(
    () =>
      list.rows.flatMap((r) => (r.previewTab === null ? [] : [{ ...r.previewTab, id: `${r.id}:${r.previewTab.id}` }])),
    [list]
  ) as ReadonlyArray<Tab>
  const read = useFiguresFor(previews)
  const undoWith = (token: string, ids: ReadonlyArray<string>) => () =>
    void write.undo({ payload: { token }, ...keysFor(ids) }).then(ok)

  const value = useMemo((): SheetsSource => {
    const me = frame.me.memberId
    const members = [
      { id: me, name: frame.me.name, active: true },
      ...frame.teammates.filter((t) => t.id !== me).map((t) => ({ id: t.id, name: t.name, active: true }))
    ]
    const made = async (exit: Exit.Exit<{ sheet: SheetRow; undo: { token: string } }, unknown>, say?: string) => {
      if (!ok(exit)) return undefined
      const { sheet, undo } = exit.value
      if (say !== undefined) undoable(say, undoWith(undo.token, [sheet.id]))
      return sheet.id
    }
    return {
      sheets: list.rows.map(cardOf),
      folders: list.folders.map((f) => ({ id: f.id, name: f.name })),
      me,
      members,
      currency: read.currency ?? "EUR",
      figures: read.figures,
      months: read.months ?? [],
      create: async ({ title, template, folderId }: { title: string; template: TemplateId; folderId?: string }) =>
        made(
          await write.create({
            payload: { title, template, ...(folderId === undefined ? {} : { folderId }) },
            reactivityKeys: [...SHEETS]
          })
        ),
      importRows: async (title, rows) => {
        const cells: Tab["cells"] = {}
        rows.slice(0, 40).forEach((row, r) =>
          row.slice(0, 12).forEach((v, c) => {
            const text = v.trim().slice(0, 2000)
            if (text) cells[`${String.fromCharCode(65 + c)}${r + 1}`] = { v: text, ...(r === 0 ? { bold: true } : {}) }
          })
        )
        return made(
          await write.create({
            payload: {
              title: title.slice(0, 120),
              template: "blank",
              source: "csv",
              tabs: [{ id: "tab_import", name: "Import", cells, widths: {} }]
            },
            reactivityKeys: [...SHEETS]
          }),
          `“${title}” geïmporteerd`
        )
      },
      patch: (ids, patch, message, description) =>
        void write.update({
          payload: {
            ids: [...ids],
            ...(patch.title === undefined ? {} : { title: patch.title }),
            ...(patch.folderId === undefined ? {} : { folderId: patch.folderId }),
            ...(patch.pinned === undefined ? {} : { pinned: patch.pinned }),
            ...(patch.archived === undefined ? {} : { archived: patch.archived })
          },
          ...keysFor(ids)
        }).then((exit) => {
          if (!ok(exit)) return
          const ticket = exit.value.undo
          if (ticket === null) return void toast(message, description === undefined ? undefined : { description })
          undoable(message, undoWith(ticket.token, ids), description)
        }),
      share: (id, memberId, on, message, description) =>
        void write.share({ payload: { id, memberId, on }, ...keysFor([id]) }).then((exit) => {
          if (!ok(exit)) return
          const ticket = exit.value.undo
          if (ticket === null) return void toast(message)
          undoable(message, undoWith(ticket.token, [id]), description)
        }),
      duplicate: async (id) => {
        const exit = await write.duplicate({ payload: { id }, reactivityKeys: [...SHEETS] })
        return made(exit, Exit.isSuccess(exit) ? `“${exit.value.sheet.title}” gemaakt` : undefined)
      },
      remove: (ids, message) =>
        void write.remove({ payload: { ids: [...ids] }, ...keysFor(ids) }).then((exit) => {
          if (!ok(exit)) return
          const ticket = exit.value.undo
          if (ticket === null) return void toast(message)
          undoable(message, undoWith(ticket.token, ids))
        }),
      addFolder: async (name, moveSheetIds = []) => {
        const exit = await write.createFolder({
          payload: { name, ...(moveSheetIds.length === 0 ? {} : { moveSheetIds: [...moveSheetIds] }) },
          ...keysFor(moveSheetIds)
        })
        if (!ok(exit)) return undefined
        const { folder, undo } = exit.value
        if (moveSheetIds.length > 0) undoable("Map gemaakt", undoWith(undo.token, moveSheetIds))
        return folder.id
      }
    }
    // The writes are the atoms' setters: stable for the component's life.
  }, [frame, list, read])
  return <SheetsSourceProvider value={value}>{children}</SheetsSourceProvider>
}

/* ── the open sheet ─────────────────────────────────────────────────────────────────────────── */

const sheetOf = (d: SheetDetail, tabs: Array<Tab>, updatedAt: number): Sheet => ({
  id: d.id,
  title: d.title,
  ...(d.folder === null ? {} : { folderId: d.folder.id }),
  pinned: d.pinned,
  archived: d.archived,
  ownerId: d.ownerId,
  shared: [...d.sharedWith],
  createdAt: iso(d.updatedAt),
  updatedAt: iso(updatedAt),
  tabs
})

const copyTabs = (tabs: SheetDetail["tabs"]): Array<Tab> =>
  tabs.map((t) => ({ id: t.id, name: t.name, cells: { ...t.cells }, widths: { ...t.widths } }))

/**
 * One sheet in the editor: the tabs as last edited, saved after a pause; the figures its cells read; the version the
 * next save names. A newer version read from the server (someone else saved) replaces the tabs when nothing is waiting
 * to be saved here. A CSV is the server's: it evaluates the tab again with the figures read again.
 */
export function ConsoleSheetDoc({ detail, children }: { detail: SheetDetail; children: ReactNode }) {
  const outer = useSheetsSource()
  const write = {
    save: useAtomSet(sheetWrites.saveTabs, { mode: "promiseExit" }),
    opened: useAtomSet(sheetWrites.markOpened, { mode: "promiseExit" }),
    export: useAtomSet(sheetWrites.export, { mode: "promiseExit" })
  }
  const refresh = useAtomRefresh(sheetAtom(detail.id))
  const [tabs, setLocal] = useState<Array<Tab>>(() => copyTabs(detail.tabs))
  const [updatedAt, setUpdatedAt] = useState(detail.updatedAt)
  const [save, setSave] = useState<SheetDoc["save"]>("saved")
  const version = useRef(detail.version)
  const pending = useRef<{ tabs: Array<Tab>; timer: ReturnType<typeof setTimeout> } | null>(null)
  const inFlight = useRef(false)

  // A newer version from the server, with nothing of ours waiting: theirs.
  useEffect(() => {
    if (detail.version > version.current && pending.current === null && !inFlight.current) {
      version.current = detail.version
      setLocal(copyTabs(detail.tabs))
      setUpdatedAt(detail.updatedAt)
    }
  }, [detail])

  useEffect(() => {
    void write.opened({ payload: { id: detail.id }, reactivityKeys: [...SHEETS] })
    // Once per sheet opened.
  }, [detail.id])

  const flush = async () => {
    const next = pending.current
    if (next === null || inFlight.current) return
    clearTimeout(next.timer)
    pending.current = null
    inFlight.current = true
    setSave("saving")
    const exit = await write.save({
      payload: { id: detail.id, baseVersion: version.current, tabs: next.tabs },
      reactivityKeys: [...SHEETS]
    })
    inFlight.current = false
    if (Exit.isSuccess(exit)) {
      version.current = exit.value.version
      setUpdatedAt(exit.value.updatedAt)
      if (pending.current === null) setSave("saved")
      else void flush()
      return
    }
    const error = failureOf(exit) as { _tag?: string; reason?: string }
    if (error._tag === "Conflict" && error.reason === "stale_version") {
      // Someone else's save came first: theirs is read and shown, ours is said to be gone.
      pending.current = null
      version.current = -1
      setSave("saved")
      toast.error("Iemand anders heeft dit blad net aangepast", {
        description: "Je ziet nu hun versie; je laatste wijziging is niet bewaard."
      })
      refresh()
      return
    }
    setSave("failed")
    sayRefusal(error, COPY)
  }

  // Leaving the sheet saves what is waiting.
  useEffect(() => () => void flush(), [])

  const read = useFiguresFor(tabs)
  const inner = useMemo(
    (): SheetsSource => ({
      ...outer,
      figures: read.figures,
      currency: read.currency ?? outer.currency,
      months: read.months ?? outer.months
    }),
    [outer, read]
  )
  const doc = useMemo((): SheetDoc => ({
    status: "ready",
    sheet: sheetOf(detail, tabs, updatedAt),
    computed: read.computed,
    save,
    setTabs: (next) => {
      setLocal(next)
      setSave("saving")
      if (pending.current !== null) clearTimeout(pending.current.timer)
      pending.current = { tabs: next, timer: setTimeout(() => void flush(), SAVE_AFTER_MS) }
    },
    exportCsv: (tab) =>
      void (async () => {
        await flush()
        const exit = await write.export({ payload: { id: detail.id, tabId: tab.id, format: "csv" } })
        if (!ok(exit)) return
        const file = exit.value
        const blob = new Blob([file.content], { type: file.contentType })
        const a = document.createElement("a")
        a.href = URL.createObjectURL(blob)
        a.download = file.fileName
        a.click()
        URL.revokeObjectURL(a.href)
        toast(`${tab.name} gedownload als CSV`, {
          description: "Met de waarden zoals ze nu staan, gescheiden door puntkomma's."
        })
      })()
    // The writes are the atoms' setters, stable; `flush` reads refs.
  }), [detail, tabs, updatedAt, read.computed, save])
  return (
    <SheetsSourceProvider value={inner}>
      <SheetDocProvider value={doc}>{children}</SheetDocProvider>
    </SheetsSourceProvider>
  )
}
