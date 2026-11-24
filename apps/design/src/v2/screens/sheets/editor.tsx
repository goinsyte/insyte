import { useEffect, useMemo, useRef, useState } from "react"
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react"
import { METRICS, WEEK } from "../../fixtures/costs.ts"
import { addr, tabFrom } from "../../fixtures/sheets.ts"
import type { Cell, Fmt, Sheet, Tab } from "../../fixtures/sheets.ts"
import { PEOPLE } from "../../fixtures/workspace.ts"
import { Link, navigate, paths, setQuery, useQuery } from "../../router.tsx"
import { Denied, ReadOnlyNotice, useAccess } from "../../ui/access.tsx"
import { Button, IconButton } from "../../ui/button.tsx"
import { cx } from "../../ui/cx.ts"
import { Dialog } from "../../ui/dialog.tsx"
import { DropdownItem, DropdownLabel, DropdownMenu, DropdownSeparator } from "../../ui/dropdown.tsx"
import {
  Archive,
  ArrowDown,
  ArrowLeft,
  Bold,
  ChevronDown,
  Copy,
  Download,
  Edit,
  MoreHorizontal,
  Pin,
  Plus,
  Redo,
  Sigma,
  Sparkle,
  Trash,
  Undo
} from "../../ui/icons.tsx"
import { Field, Input, Select } from "../../ui/input.tsx"
import { Page, PageHead } from "../../ui/page.tsx"
import { Popover } from "../../ui/popover.tsx"
import { Skeleton } from "../../ui/skeleton.tsx"
import { EmptyState, ErrorState } from "../../ui/states.tsx"
import { toast } from "../../ui/toast.tsx"
import { dataState, setView, useView } from "../../view.ts"
import {
  colName,
  COLS,
  evaluator,
  fromCsv,
  FUNCTIONS,
  isError,
  parseAddr,
  ROWS,
  shift,
  show,
  typedFmt
} from "./engine.ts"
import { duplicateSheet, getSheet, patchSheet, removeCreated, setTabs, toggleShare, useSheets } from "./store.ts"

const FORMATS: ReadonlyArray<{ readonly value: Fmt | ""; readonly label: string }> = [
  { value: "", label: "Automatisch" },
  { value: "money", label: "Bedrag" },
  { value: "integer", label: "Heel getal" },
  { value: "number", label: "Getal, twee decimalen" },
  { value: "percent", label: "Percentage" },
  { value: "text", label: "Tekst" }
]

type Pos = { readonly c: number; readonly r: number }
type Sel = { readonly a: Pos; readonly b: Pos }
type Box = { readonly c0: number; readonly c1: number; readonly r0: number; readonly r1: number }
type Patch = { readonly v?: string; readonly fmt?: Fmt | null; readonly bold?: boolean }

const DEFAULT_W = 104
const clamp = (p: Pos): Pos => ({ c: Math.max(0, Math.min(COLS - 1, p.c)), r: Math.max(0, Math.min(ROWS - 1, p.r)) })
const boxOf = (s: Sel): Box => ({
  c0: Math.min(s.a.c, s.b.c),
  c1: Math.max(s.a.c, s.b.c),
  r0: Math.min(s.a.r, s.b.r),
  r1: Math.max(s.a.r, s.b.r)
})
const inBox = (b: Box, c: number, r: number) => c >= b.c0 && c <= b.c1 && r >= b.r0 && r <= b.r1
const single = (p: Pos): Sel => ({ a: p, b: p })

/** A cell with a patch laid over it; `null` when nothing is left worth keeping. */
function merge(old: Cell | undefined, p: Patch): Cell | null {
  const v = p.v ?? old?.v ?? ""
  const fmt = p.fmt === undefined ? old?.fmt : p.fmt ?? undefined
  const bold = p.bold ?? old?.bold ?? false
  if (v === "" && fmt === undefined && !bold) return null
  return { v, ...(fmt === undefined ? {} : { fmt }), ...(bold ? { bold: true } : {}) }
}

/**
 * One sheet: a grid that takes the keyboard the way a spreadsheet does (arrows, Shift to widen the
 * range, Enter or F2 to edit, typing to replace, ⌘C/⌘X/⌘V with references that move along, ⌘D to fill
 * down, ⌘Z), a formula bar that completes a function's name and, while a formula is being written,
 * takes a click on a cell as its address. Columns resize from their edge, and a range says what it adds
 * up to. Rebuilt from `/app/sheets/$id` (`sheet-editor.tsx`). An error says why under the formula bar.
 */
export function SheetScreen({ id }: { readonly id: string }) {
  const access = useAccess("analytics")
  const state = dataState(useView())
  const sheet = useSheets().find((s) => s.id === id)

  if (!access.view) {
    return (
      <Page width="text">
        <PageHead title="Blad" />
        <Denied area="analytics" what="dit blad" />
      </Page>
    )
  }
  if (state === "loading") {
    return (
      <Page label="Blad laden">
        <div aria-busy="true" className="flex flex-col gap-4">
          <Skeleton className="h-6 w-72" />
          <Skeleton className="h-8 w-full" />
          <div className="grid grid-cols-8 gap-px">
            {Array.from({ length: 64 }, (_, i) => <Skeleton key={i} className="h-8 rounded-none" />)}
          </div>
        </div>
      </Page>
    )
  }
  if (state === "error") {
    return (
      <Page>
        <ErrorState
          title="Dit blad kwam niet binnen"
          detail={`GET /v1/sheets/${id} · 503 · verzoek 77d0a9`}
          action={<Button onClick={() => setView({ staat: "gewoon" })}>Opnieuw proberen</Button>}
        />
      </Page>
    )
  }
  if (sheet === undefined) {
    return (
      <Page width="text">
        <EmptyState
          title="Dit blad bestaat niet (meer)"
          action={<Button onClick={() => navigate(paths.sheets)}>Naar Sheets</Button>}
        >
          Misschien is het verwijderd, of nooit met je gedeeld.
        </EmptyState>
      </Page>
    )
  }
  return <Editor key={sheet.id} sheet={sheet} canEdit={access.edit} />
}

function Editor({ sheet, canEdit }: { readonly sheet: Sheet; readonly canEdit: boolean }) {
  const tabId = useQuery("tab") ?? sheet.tabs[0]?.id ?? ""
  const tab = sheet.tabs.find((t) => t.id === tabId) ?? sheet.tabs[0]
  const [sel, setSel] = useState<Sel>(single({ c: 0, r: 0 }))
  const [edit, setEdit] = useState<{ readonly text: string; readonly from: "cell" | "bar" } | null>(null)
  const [copied, setCopied] = useState<number | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [, bump] = useState(0)
  const past = useRef<Array<ReadonlyArray<Tab>>>([])
  const future = useRef<Array<ReadonlyArray<Tab>>>([])
  const clip = useRef<{ readonly text: string; readonly from: Pos } | null>(null)
  const drag = useRef<Pos | null>(null)
  const grid = useRef<HTMLDivElement>(null)
  const cellInput = useRef<HTMLInputElement>(null)
  const barInput = useRef<HTMLInputElement>(null)
  const editRef = useRef(edit)
  editRef.current = edit
  const pointed = useRef(false)
  const ev = useMemo(() => evaluator(sheet.tabs, tab?.id ?? ""), [sheet.tabs, tab?.id])
  const owner = PEOPLE[sheet.owner]

  useEffect(() => {
    const up = () => {
      drag.current = null
    }
    window.addEventListener("pointerup", up)
    return () => window.removeEventListener("pointerup", up)
  }, [])

  if (tab === undefined) return null
  const active = sel.a
  const activeAddr = addr(active.c, active.r)
  const activeCell: Cell | undefined = tab.cells[activeAddr]
  const activeValue = ev.value(activeAddr)
  const box = boxOf(sel)
  const nameBox = box.c0 === box.c1 && box.r0 === box.r1
    ? activeAddr
    : `${addr(box.c0, box.r0)}:${addr(box.c1, box.r1)}`

  /* ── history ── */
  const latest = () => getSheet(sheet.id)?.tabs ?? sheet.tabs
  const commit = (tabs: ReadonlyArray<Tab>) => {
    if (!canEdit) return
    past.current = [...past.current.slice(-99), latest()]
    future.current = []
    setTabs(sheet.id, tabs)
    bump((n) => n + 1)
  }
  const undo = () => {
    const prev = past.current.pop()
    if (prev === undefined) return
    future.current.push(latest())
    setTabs(sheet.id, prev)
    bump((n) => n + 1)
  }
  const redo = () => {
    const next = future.current.pop()
    if (next === undefined) return
    past.current.push(latest())
    setTabs(sheet.id, next)
    bump((n) => n + 1)
  }
  const editTab = (f: (t: Tab) => Tab) => commit(latest().map((t) => (t.id === tab.id ? f(t) : t)))
  const setCells = (patch: Readonly<Record<string, Patch | null>>) =>
    editTab((t) => {
      const cells: Record<string, Cell> = { ...t.cells }
      for (const [a, p] of Object.entries(patch)) {
        const next = p === null ? null : merge(cells[a], p)
        if (next === null) delete cells[a]
        else cells[a] = next
      }
      return { ...t, cells }
    })
  const forBox = (p: Patch) => {
    const out: Record<string, Patch> = {}
    for (let r = box.r0; r <= box.r1; r++) for (let c = box.c0; c <= box.c1; c++) out[addr(c, r)] = p
    setCells(out)
  }

  /* ── writing a cell ── */
  const write = (a: string, text: string) => {
    const old = tab.cells[a]
    if ((old?.v ?? "") === text) return
    if (text === "") return setCells({ [a]: { v: "" } })
    const fmt = old?.fmt ?? (text.startsWith("=") ? inferFmt(text) : typedFmt(text))
    setCells({ [a]: fmt === undefined ? { v: text } : { v: text, fmt } })
  }
  const focusEditor = (from: "cell" | "bar", end?: number) =>
    window.requestAnimationFrame(() => {
      const el = from === "cell" ? cellInput.current : barInput.current
      el?.focus()
      if (end !== undefined) el?.setSelectionRange(end, end)
    })
  const startEdit = (text: string, from: "cell" | "bar" = "cell") => {
    if (!canEdit) return
    setCopied(null)
    setEdit({ text, from })
    focusEditor(from, text.length)
  }
  const finish = (move?: Pos) => {
    const current = editRef.current
    /* Cleared at once: Enter commits and then the input blurs, and that must not commit twice. */
    editRef.current = null
    if (current !== null) write(activeAddr, current.text)
    setEdit(null)
    if (move !== undefined) setSel(single(clamp({ c: active.c + move.c, r: active.r + move.r })))
    window.requestAnimationFrame(() => grid.current?.focus({ preventScroll: true }))
  }
  const cancel = () => {
    editRef.current = null
    setEdit(null)
    window.requestAnimationFrame(() => grid.current?.focus({ preventScroll: true }))
  }

  /* ── the clipboard: raw cells, so a formula pasted elsewhere reads from its new place ── */
  const copy = (cut = false) => {
    const lines: Array<string> = []
    for (let r = box.r0; r <= box.r1; r++) {
      const row: Array<string> = []
      for (let c = box.c0; c <= box.c1; c++) row.push(tab.cells[addr(c, r)]?.v ?? "")
      lines.push(row.join("\t"))
    }
    const text = lines.join("\n")
    clip.current = { text, from: { c: box.c0, r: box.r0 } }
    void navigator.clipboard?.writeText(text).catch(() => undefined)
    setCopied((box.c1 - box.c0 + 1) * (box.r1 - box.r0 + 1))
    if (cut) clear()
  }
  const paste = async () => {
    let text = clip.current?.text ?? ""
    try {
      text = (await navigator.clipboard?.readText()) || text
    } catch {
      /* Reading the system clipboard needs permission; what was copied here is enough. */
    }
    if (text === "") return
    const rows = fromCsv(text.replace(/\r/g, ""))
    const from = clip.current?.text === text ? clip.current.from : active
    const patch: Record<string, Patch> = {}
    rows.forEach((row, dr) =>
      row.forEach((v, dc) => {
        const c = active.c + dc
        const r = active.r + dr
        if (c < COLS && r < ROWS) patch[addr(c, r)] = { v: shift(v, active.c - from.c, active.r - from.r) }
      })
    )
    setCells(patch)
    setCopied(null)
    setSel({ a: active, b: clamp({ c: active.c + (rows[0]?.length ?? 1) - 1, r: active.r + rows.length - 1 }) })
  }
  const clear = () => {
    const patch: Record<string, null> = {}
    for (let r = box.r0; r <= box.r1; r++) {
      for (let c = box.c0; c <= box.c1; c++) if (tab.cells[addr(c, r)] !== undefined) patch[addr(c, r)] = null
    }
    if (Object.keys(patch).length > 0) setCells(patch)
  }
  const fillDown = () => {
    if (box.r1 === box.r0) {
      toast({ title: "Kies eerst een bereik", body: "Selecteer de bovenste cel en de cellen eronder, dan ⌘D." })
      return
    }
    const patch: Record<string, Patch | null> = {}
    for (let c = box.c0; c <= box.c1; c++) {
      const src = tab.cells[addr(c, box.r0)]
      for (let r = box.r0 + 1; r <= box.r1; r++) {
        patch[addr(c, r)] = src === undefined
          ? null
          : { v: shift(src.v, 0, r - box.r0), fmt: src.fmt ?? null, bold: src.bold === true }
      }
    }
    setCells(patch)
  }
  const sumHere = () => {
    /* Σ: the numbers straight above the active cell, the way a total row is made. */
    let r = active.r - 1
    while (r >= 0 && typeof ev.value(addr(active.c, r)) !== "number") r--
    const end = r
    while (r >= 0 && typeof ev.value(addr(active.c, r)) === "number") r--
    if (end < 0) return startEdit("=SOM(")
    setCells({
      [activeAddr]: {
        v: `=SOM(${addr(active.c, r + 1)}:${addr(active.c, end)})`,
        bold: true,
        fmt: tab.cells[addr(active.c, end)]?.fmt ?? null
      }
    })
  }

  /* ── the keyboard ── */
  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (edit !== null) {
      /* A key that lands before the editor has focus still belongs to it. */
      if (e.target !== grid.current) return
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        setEdit({ ...edit, text: edit.text + e.key })
      } else if (e.key === "Enter") {
        e.preventDefault()
        finish({ c: 0, r: 1 })
      } else if (e.key === "Escape") cancel()
      return
    }
    const mod = e.metaKey || e.ctrlKey
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
    const move = (dc: number, dr: number) => {
      e.preventDefault()
      setCopied(null)
      const from = e.shiftKey ? sel.b : active
      const p = clamp({ c: from.c + dc, r: from.r + dr })
      setSel(e.shiftKey ? { a: sel.a, b: p } : single(p))
    }
    if (mod && k === "z") return (e.preventDefault(), e.shiftKey ? redo() : undo())
    if (mod && k === "y") return (e.preventDefault(), redo())
    if (mod && k === "c") return (e.preventDefault(), copy())
    if (mod && k === "x" && canEdit) return (e.preventDefault(), copy(true))
    if (mod && k === "v" && canEdit) return (e.preventDefault(), void paste())
    if (mod && k === "b" && canEdit) return (e.preventDefault(), forBox({ bold: activeCell?.bold !== true }))
    if (mod && k === "d" && canEdit) return (e.preventDefault(), fillDown())
    if (mod && k === "a") return (e.preventDefault(), setSel({ a: { c: 0, r: 0 }, b: { c: COLS - 1, r: ROWS - 1 } }))
    if (k === "ArrowUp") return move(0, -1)
    if (k === "ArrowDown") return move(0, 1)
    if (k === "ArrowLeft") return move(-1, 0)
    if (k === "ArrowRight") return move(1, 0)
    if (k === "Tab") return move(e.shiftKey ? -1 : 1, 0)
    if (k === "Escape") return setCopied(null)
    if ((k === "Enter" || k === "F2") && canEdit) return (e.preventDefault(), startEdit(activeCell?.v ?? ""))
    if ((k === "Delete" || k === "Backspace") && canEdit) return (e.preventDefault(), clear())
    if (e.key.length === 1 && !mod && !e.altKey && canEdit) {
      e.preventDefault()
      startEdit(e.key)
    }
  }

  const suggestions = (() => {
    const m = edit?.text.startsWith("=") === true ? /([A-Za-z.]{2,})$/.exec(edit.text) : null
    if (m === null) return []
    const typed = (m[1] ?? "").toUpperCase()
    return FUNCTIONS.filter((f) => f.name.startsWith(typed) && f.name !== typed).slice(0, 4)
  })()
  const complete = (name: string) => {
    if (edit === null) return
    const text = edit.text.replace(/[A-Za-z.]+$/, `${name}(`)
    setEdit({ ...edit, text })
    focusEditor(edit.from, text.length)
  }
  const onEditKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") return (e.preventDefault(), finish({ c: 0, r: e.shiftKey ? -1 : 1 }))
    if (e.key === "Tab") {
      e.preventDefault()
      const first = suggestions[0]
      if (first !== undefined) return complete(first.name)
      return finish({ c: e.shiftKey ? -1 : 1, r: 0 })
    }
    if (e.key === "Escape") return (e.preventDefault(), cancel())
  }

  /* While a formula waits for an operand, a click on a cell writes its address; a drag, a range. */
  const pointing = edit !== null && edit.text.startsWith("=") && /[=(;:+\-*/^&<>]$/.test(edit.text.trimEnd())
  const down = (c: number, r: number, e: ReactPointerEvent) => {
    e.preventDefault()
    if (edit !== null && (pointing || pointed.current) && edit.text.startsWith("=")) {
      const base = pointed.current ? edit.text.replace(/[A-Z]\d{1,3}(:[A-Z]\d{1,3})?$/, "") : edit.text
      const text = base + addr(c, r)
      setEdit({ ...edit, text })
      pointed.current = true
      drag.current = { c, r }
      focusEditor(edit.from, text.length)
      return
    }
    if (edit !== null) finish()
    else grid.current?.focus({ preventScroll: true })
    setCopied(null)
    drag.current = e.shiftKey ? sel.a : { c, r }
    setSel(e.shiftKey ? { a: sel.a, b: { c, r } } : single({ c, r }))
  }
  const over = (c: number, r: number) => {
    const start = drag.current
    if (start === null) return
    if (edit !== null && pointed.current) {
      if (start.c === c && start.r === r) return
      const text = edit.text.replace(/[A-Z]\d{1,3}(:[A-Z]\d{1,3})?$/, `${addr(start.c, start.r)}:${addr(c, r)}`)
      setEdit({ ...edit, text })
      return
    }
    setSel((s) => ({ a: s.a, b: { c, r } }))
  }
  if (edit === null) pointed.current = false

  /* ── column widths ── */
  const width = (c: number) => tab.widths[colName(c)] ?? DEFAULT_W
  const resize = (c: number, startX: number) => {
    const start = width(c)
    let w = start
    const col = grid.current?.querySelector<HTMLElement>(`col[data-col="${c}"]`)
    const moveW = (e: PointerEvent) => {
      w = Math.max(56, Math.min(360, start + e.clientX - startX))
      if (col) col.style.width = `${w}px`
    }
    const upW = () => {
      window.removeEventListener("pointermove", moveW)
      window.removeEventListener("pointerup", upW)
      if (Math.round(w) !== start) editTab((t) => ({ ...t, widths: { ...t.widths, [colName(c)]: Math.round(w) } }))
    }
    window.addEventListener("pointermove", moveW)
    window.addEventListener("pointerup", upW)
  }

  /* ── what the range adds up to ── */
  const stats = (() => {
    if (box.c0 === box.c1 && box.r0 === box.r1) return null
    const xs: Array<number> = []
    for (let r = box.r0; r <= box.r1; r++) {
      for (let c = box.c0; c <= box.c1; c++) {
        const v = ev.value(addr(c, r))
        if (typeof v === "number") xs.push(v)
      }
    }
    if (xs.length === 0) return null
    const sum = xs.reduce((s, x) => s + x, 0)
    const fmt = tab.cells[addr(box.c0, box.r1)]?.fmt ?? tab.cells[addr(box.c0, box.r0)]?.fmt
    const f = fmt === "percent" ? "percent" : fmt === "money" ? "money" : undefined
    return { sum: show(sum, f), avg: show(sum / xs.length, f === undefined ? "number" : f), n: xs.length }
  })()

  const exportCsv = () => {
    let maxR = 0
    let maxC = 0
    for (const a of Object.keys(tab.cells)) {
      const p = parseAddr(a)
      if (p !== null) {
        maxR = Math.max(maxR, p.r)
        maxC = Math.max(maxC, p.c)
      }
    }
    const lines = Array.from({ length: maxR + 1 }, (_, r) =>
      Array.from({ length: maxC + 1 }, (_x, c) => {
        const text = show(ev.value(addr(c, r)), tab.cells[addr(c, r)]?.fmt)
        return /[";\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text
      }).join(";"))
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }))
    const a = document.createElement("a")
    a.href = url
    a.download = `${sheet.title} · ${tab.name}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast({ title: `${tab.name} geëxporteerd als CSV`, body: "Met de waarden zoals ze in het blad staan." })
  }

  const reads = Object.values(tab.cells).some((x) => /INSYTE\(/i.test(x.v))
  const raw = edit?.text ?? activeCell?.v ?? ""

  return (
    <Page width="full" className="max-w-[1400px]">
      <div className="flex flex-col gap-4">
        <Link
          to={paths.sheets}
          className="flex h-7 items-center gap-1 self-start rounded-sm pr-2 text-sm text-ink-3 hover:text-ink pointer-coarse:h-11"
        >
          <ArrowLeft size={14} />
          Sheets
        </Link>
        <PageHead
          title={sheet.title}
          meta={`Opgeslagen · van ${owner.name} · bewerkt ${sheet.updated}${
            sheet.shared.length > 0
              ? ` · gedeeld met ${sheet.shared.map((p) => PEOPLE[p].name.split(" ")[0]).join(", ")}`
              : ""
          }${reads ? " · leest cijfers uit Insyte" : ""}`}
          actions={
            <>
              <Button icon={<Download />} onClick={exportCsv}>Exporteren</Button>
              <SheetMenu sheet={sheet} canEdit={canEdit} onRename={() => setRenaming(true)} />
            </>
          }
        />
        {!canEdit && <ReadOnlyNotice area="analytics" />}
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        {canEdit && (
          <div role="toolbar" aria-label="Opmaak" className="flex flex-wrap items-center gap-1 rounded-md bg-well p-1">
            <IconButton label="Ongedaan maken (⌘Z)" size="sm" onClick={undo} disabled={past.current.length === 0}>
              <Undo />
            </IconButton>
            <IconButton label="Opnieuw (⇧⌘Z)" size="sm" onClick={redo} disabled={future.current.length === 0}>
              <Redo />
            </IconButton>
            <span className="mx-1 h-4 w-px bg-line-strong" aria-hidden="true" />
            <IconButton
              label="Vet (⌘B)"
              size="sm"
              pressed={activeCell?.bold === true}
              onClick={() =>
                forBox({ bold: activeCell?.bold !== true })}
            >
              <Bold />
            </IconButton>
            <IconButton label="Optellen wat erboven staat" size="sm" onClick={sumHere}>
              <Sigma />
            </IconButton>
            <IconButton label="Omlaag vullen (⌘D)" size="sm" onClick={fillDown} disabled={box.r1 === box.r0}>
              <ArrowDown />
            </IconButton>
            <Select
              aria-label="Opmaak van de cellen"
              value={activeCell?.fmt ?? ""}
              onChange={(event) =>
                forBox({ fmt: event.target.value === "" ? null : event.target.value as Fmt })}
              className="h-7 w-44 text-xs"
            >
              {FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </Select>
            <span className="flex-1" />
            <Popover
              label="Insyte-cijfer"
              placement="bottom-end"
              trigger={(props) => (
                <Button size="sm" variant="ghost" icon={<Sparkle />} {...props}>Insyte-cijfer</Button>
              )}
            >
              {(close) => (
                <FigurePicker
                  cells={(box.c1 - box.c0 + 1) * (box.r1 - box.r0 + 1)}
                  onPick={(formula, fmt) => {
                    forBox({ v: formula, fmt })
                    close()
                    grid.current?.focus()
                  }}
                />
              )}
            </Popover>
          </div>
        )}

        <div className="flex items-stretch gap-2">
          <span
            className="figure flex h-8 min-w-16 shrink-0 items-center justify-center rounded-sm bg-well px-2 text-xs font-medium text-ink-2"
            aria-label="Geselecteerd"
          >
            {nameBox}
          </span>
          <div className="relative min-w-0 flex-1">
            <input
              ref={barInput}
              className="h-8 w-full min-w-0 rounded-sm bg-canvas px-2.5 text-sm text-ink ring-1 ring-line-strong ring-inset outline-none placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-accent read-only:bg-well read-only:ring-line pointer-coarse:h-11"
              aria-label={`Inhoud van ${activeAddr}`}
              value={raw}
              readOnly={!canEdit}
              placeholder={canEdit ? "Een waarde, of een formule na =" : ""}
              onFocus={() => edit === null && canEdit && setEdit({ text: activeCell?.v ?? "", from: "bar" })}
              onChange={(event) => setEdit({ text: event.target.value, from: "bar" })}
              onKeyDown={onEditKey}
              onBlur={() => edit?.from === "bar" && !pointing && !pointed.current && finish()}
            />
            {edit?.from === "bar" && <Suggestions items={suggestions} onPick={complete} />}
          </div>
        </div>
        <p className="min-h-5 text-xs text-pretty" aria-live="polite">
          {isError(activeValue)
            ? (
              <span className="text-bad-ink">
                <span className="font-medium">{activeValue.error}</span> · {activeValue.why}
              </span>
            )
            : pointing
            ? <span className="text-ink-3">Klik een cel om hem in de formule te zetten, of sleep voor een bereik.</span>
            : /INSYTE\(/i.test(activeCell?.v ?? "")
            ? (
              <span className="text-ink-3">
                Hetzelfde cijfer als in{" "}
                <Link to={paths.costs} className="underline underline-offset-2 hover:text-ink">Kosten</Link>{" "}
                en Analyse, en het blijft bij.
              </span>
            )
            : activeCell?.v.startsWith("=") === true
            ? <span className="text-ink-3">Uitkomst: {show(activeValue, activeCell.fmt)}</span>
            : null}
        </p>

        <div
          ref={grid}
          role="grid"
          aria-label={`${sheet.title}, tabblad ${tab.name}`}
          aria-readonly={!canEdit}
          aria-rowcount={ROWS}
          aria-colcount={COLS}
          tabIndex={0}
          onKeyDown={onGridKey}
          className="pane-scroll relative max-h-[calc(100vh-22rem)] min-h-80 rounded-md ring-1 ring-line focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          <table className="border-separate border-spacing-0 text-sm" style={{ tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: 44 }} />
              {Array.from({ length: COLS }, (_, c) => <col key={c} data-col={c} style={{ width: width(c) }} />)}
            </colgroup>
            <thead>
              <tr>
                <th className="sticky top-0 left-0 z-20 h-7 bg-panel" aria-hidden="true" />
                {Array.from({ length: COLS }, (_, c) => (
                  <th
                    key={c}
                    scope="col"
                    onPointerDown={(e) => {
                      e.preventDefault()
                      grid.current?.focus({ preventScroll: true })
                      setSel({ a: { c, r: 0 }, b: { c, r: ROWS - 1 } })
                    }}
                    className={cx(
                      "sticky top-0 z-10 h-7 bg-panel px-2 text-center text-2xs font-medium select-none",
                      c >= box.c0 && c <= box.c1 ? "text-ink" : "text-ink-3"
                    )}
                  >
                    {colName(c)}
                    {canEdit && (
                      <span
                        aria-hidden="true"
                        onPointerDown={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          resize(c, e.clientX)
                        }}
                        className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-accent/40"
                      />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: ROWS }, (_, r) => (
                <tr key={r}>
                  <th
                    scope="row"
                    onPointerDown={(e) => {
                      e.preventDefault()
                      grid.current?.focus({ preventScroll: true })
                      setSel({ a: { c: 0, r }, b: { c: COLS - 1, r } })
                    }}
                    className={cx(
                      "figure sticky left-0 z-10 h-8 bg-panel text-center text-2xs font-medium select-none",
                      r >= box.r0 && r <= box.r1 ? "text-ink" : "text-ink-3"
                    )}
                  >
                    {r + 1}
                  </th>
                  {Array.from({ length: COLS }, (_x, c) => {
                    const key = addr(c, r)
                    const x = tab.cells[key]
                    const v = ev.value(key)
                    const on = c === active.c && r === active.r
                    const picked = inBox(box, c, r)
                    return (
                      <td
                        key={key}
                        role="gridcell"
                        aria-selected={picked}
                        title={isError(v) ? `${v.error} ${v.why}` : undefined}
                        onPointerDown={(e) => down(c, r, e)}
                        onPointerEnter={() => over(c, r)}
                        onDoubleClick={() => startEdit(x?.v ?? "")}
                        className={cx(
                          "relative h-8 cursor-cell truncate border-t border-l border-line px-2 whitespace-nowrap",
                          typeof v === "number" || isError(v) ? "figure text-right" : "text-left",
                          x?.bold === true ? "font-semibold text-ink" : "text-ink-2",
                          isError(v) && "text-bad-ink",
                          on
                            ? "bg-accent-tint outline-2 -outline-offset-2 outline-accent"
                            : picked
                            ? "bg-accent-tint/60"
                            : undefined
                        )}
                      >
                        {show(v, x?.fmt)}
                        {on && edit?.from === "cell" && (
                          <>
                            <input
                              ref={cellInput}
                              aria-label={`Bewerk ${key}`}
                              value={edit.text}
                              onChange={(event) => setEdit({ text: event.target.value, from: "cell" })}
                              onKeyDown={onEditKey}
                              onBlur={() => !pointing && !pointed.current && finish()}
                              className="absolute inset-0 z-10 w-full bg-canvas px-2 text-sm text-ink outline-2 -outline-offset-2 outline-accent"
                            />
                            <Suggestions items={suggestions} onPick={complete} />
                          </>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <TabBar
            sheet={sheet}
            active={tab.id}
            canEdit={canEdit}
            onPick={(id) => {
              setQuery({ tab: id === sheet.tabs[0]?.id ? null : id })
              setSel(single({ c: 0, r: 0 }))
              setEdit(null)
            }}
            onChange={commit}
          />
          <span className="ml-auto text-xs text-ink-3" aria-live="polite">
            {stats !== null
              ? (
                <span className="figure flex gap-4">
                  <span>
                    <span className="text-ink-4">Som</span> <span className="text-ink-2">{stats.sum}</span>
                  </span>
                  <span>
                    <span className="text-ink-4">Gemiddelde</span> <span className="text-ink-2">{stats.avg}</span>
                  </span>
                  <span>
                    <span className="text-ink-4">Aantal</span> <span className="text-ink-2">{stats.n}</span>
                  </span>
                </span>
              )
              : copied !== null
              ? `${copied === 1 ? "1 cel" : `${copied} cellen`} gekopieerd · ⌘V plakt ze, met de verwijzingen mee`
              : "⌘C kopiëren · ⌘V plakken · ⌘D omlaag vullen · F2 bewerken"}
          </span>
        </div>
      </div>

      <RenameDialog sheet={sheet} open={renaming} onClose={() => setRenaming(false)} />
    </Page>
  )
}

/** The format a formula's result wants, from the figure it reads. */
function inferFmt(raw: string): Fmt | undefined {
  const m = /INSYTE\(\s*"([^"]+)"/i.exec(raw)
  if (m === null) return undefined
  const metric = METRICS.find((x) => x.id === (m[1] ?? "").toLowerCase())
  if (metric === undefined) return undefined
  return metric.id === "marge" ? "percent" : metric.money ? "money" : "integer"
}

function Suggestions({ items, onPick }: {
  readonly items: ReadonlyArray<{ readonly name: string; readonly hint: string }>
  readonly onPick: (name: string) => void
}) {
  if (items.length === 0) return null
  return (
    <ul
      aria-label="Functies"
      className="absolute top-full left-0 z-30 mt-1 w-72 rounded-md bg-canvas p-1 text-sm shadow-pop ring-1 ring-line"
    >
      {items.map((f, i) => (
        <li key={f.name}>
          <button
            type="button"
            tabIndex={-1}
            onPointerDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onPick(f.name)
            }}
            className={cx(
              "flex w-full flex-col items-start rounded-sm px-2 py-1.5 text-left hover:bg-hover",
              i === 0 && "bg-hover"
            )}
          >
            <span className="font-medium text-ink">{f.name}</span>
            <span className="text-xs text-ink-3">{f.hint}{i === 0 ? " · Tab vult aan" : ""}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** The sheet's own menu: rename, pin, share, a copy, the archive. */
function SheetMenu({ sheet, canEdit, onRename }: {
  readonly sheet: Sheet
  readonly canEdit: boolean
  readonly onRename: () => void
}) {
  if (!canEdit) return null
  const mine = sheet.owner === "elena"
  return (
    <DropdownMenu
      label="Meer acties"
      placement="bottom-end"
      trigger={(props) => (
        <IconButton label="Meer acties" tone="outline" {...props}>
          <MoreHorizontal />
        </IconButton>
      )}
    >
      {(close) => (
        <>
          <DropdownItem glyph={Edit} onSelect={onRename}>Naam wijzigen</DropdownItem>
          <DropdownItem
            glyph={Pin}
            onSelect={() => {
              patchSheet(sheet.id, { pinned: !sheet.pinned })
              toast({ title: sheet.pinned ? "Losgemaakt" : "Vastgezet" })
              close()
            }}
          >
            {sheet.pinned ? "Losmaken" : "Vastzetten"}
          </DropdownItem>
          <DropdownItem
            glyph={Copy}
            onSelect={() => {
              const id = duplicateSheet(sheet)
              close()
              navigate(paths.sheet(id))
              toast({
                title: `‘${sheet.title} (kopie)’ gemaakt`,
                action: {
                  label: "Ongedaan maken",
                  onClick: () => {
                    removeCreated(id)
                    navigate(paths.sheet(sheet.id))
                  }
                }
              })
            }}
          >
            Dupliceren
          </DropdownItem>
          {mine && (
            <>
              <DropdownSeparator />
              <DropdownLabel>Delen met</DropdownLabel>
              {(["sofia", "ethan", "liam", "maya"] as const).map((who) => (
                <DropdownItem
                  key={who}
                  checked={sheet.shared.includes(who)}
                  onSelect={() => {
                    const on = sheet.shared.includes(who)
                    toggleShare(sheet, who)
                    toast({
                      title: `${on ? "Niet meer gedeeld" : "Gedeeld"} met ${PEOPLE[who].name.split(" ")[0] ?? ""}`,
                      body: on ? undefined : "Kan bekijken en bewerken."
                    })
                  }}
                >
                  {PEOPLE[who].name}
                </DropdownItem>
              ))}
            </>
          )}
          <DropdownSeparator />
          <DropdownItem
            glyph={Archive}
            onSelect={() => {
              patchSheet(sheet.id, { archived: !sheet.archived })
              close()
              toast({
                title: sheet.archived ? "Teruggezet" : "Gearchiveerd",
                action: { label: "Ongedaan maken", onClick: () => patchSheet(sheet.id, { archived: sheet.archived }) }
              })
            }}
          >
            {sheet.archived ? "Terugzetten" : "Archiveren"}
          </DropdownItem>
        </>
      )}
    </DropdownMenu>
  )
}

/** The tabs under the grid: pick one, double-click to rename, and the active one's menu. */
function TabBar({ sheet, active, canEdit, onPick, onChange }: {
  readonly sheet: Sheet
  readonly active: string
  readonly canEdit: boolean
  readonly onPick: (id: string) => void
  readonly onChange: (tabs: ReadonlyArray<Tab>) => void
}) {
  const [renaming, setRenaming] = useState<string | null>(null)
  const [name, setName] = useState("")
  const tabs = sheet.tabs
  const rename = (t: Tab) => {
    if (!canEdit) return
    setName(t.name)
    setRenaming(t.id)
  }
  const done = () => {
    const next = name.trim()
    if (renaming !== null && next !== "") onChange(tabs.map((t) => (t.id === renaming ? { ...t, name: next } : t)))
    setRenaming(null)
  }
  const newId = () => `tab-${sheet.id}-${Date.now().toString(36)}`
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1" role="tablist" aria-label="Tabbladen">
      {tabs.map((t) =>
        renaming === t.id
          ? (
            <Input
              key={t.id}
              autoFocus
              value={name}
              aria-label="Naam van het tabblad"
              onChange={(e) => setName(e.target.value)}
              onBlur={done}
              onKeyDown={(e) => {
                if (e.key === "Enter") done()
                if (e.key === "Escape") setRenaming(null)
              }}
              className="h-8 w-32"
            />
          )
          : (
            <span key={t.id} className="flex items-center">
              <button
                type="button"
                role="tab"
                aria-selected={t.id === active}
                onClick={() => onPick(t.id)}
                onDoubleClick={() => rename(t)}
                className={cx(
                  "h-8 px-3 text-sm pointer-coarse:h-11",
                  t.id === active && canEdit ? "rounded-l-sm" : "rounded-sm",
                  t.id === active ? "bg-selected font-medium text-ink" : "text-ink-3 hover:bg-hover hover:text-ink"
                )}
              >
                {t.name}
              </button>
              {t.id === active && canEdit && (
                <DropdownMenu
                  label={`Opties voor ${t.name}`}
                  placement="top"
                  width="w-48"
                  trigger={(props) => (
                    <button
                      type="button"
                      aria-label={`Opties voor ${t.name}`}
                      className="flex h-8 items-center rounded-r-sm bg-selected pr-2 pl-0.5 text-ink-3 hover:text-ink pointer-coarse:h-11"
                      {...props}
                    >
                      <ChevronDown size={13} />
                    </button>
                  )}
                >
                  {(close) => (
                    <>
                      <DropdownItem
                        glyph={Edit}
                        onSelect={() => {
                          close()
                          rename(t)
                        }}
                      >
                        Naam wijzigen
                      </DropdownItem>
                      <DropdownItem
                        glyph={Copy}
                        onSelect={() => {
                          const copy = { ...t, id: newId(), name: `${t.name} (kopie)` }
                          const at = tabs.indexOf(t) + 1
                          onChange([...tabs.slice(0, at), copy, ...tabs.slice(at)])
                          onPick(copy.id)
                          close()
                        }}
                      >
                        Dupliceren
                      </DropdownItem>
                      <DropdownSeparator />
                      <DropdownItem
                        glyph={Trash}
                        tone="danger"
                        disabled={tabs.length === 1}
                        onSelect={() => {
                          const rest = tabs.filter((x) => x.id !== t.id)
                          onChange(rest)
                          onPick(rest[0]?.id ?? "")
                          close()
                          toast({
                            title: `${t.name} verwijderd`,
                            body: "⌘Z zet het terug.",
                            action: {
                              label: "Ongedaan maken",
                              onClick: () => {
                                onChange(tabs)
                                onPick(t.id)
                              }
                            }
                          })
                        }}
                      >
                        Verwijderen
                      </DropdownItem>
                    </>
                  )}
                </DropdownMenu>
              )}
            </span>
          )
      )}
      {canEdit && (
        <IconButton
          label="Tabblad toevoegen"
          size="sm"
          onClick={() => {
            const next = tabFrom(newId(), `Blad ${tabs.length + 1}`, [])
            onChange([...tabs, next])
            onPick(next.id)
          }}
        >
          <Plus />
        </IconButton>
      )}
    </div>
  )
}

/** The figures a cell can read, and for which day: the formula it writes is plain text you can edit. */
function FigurePicker({ cells, onPick }: {
  readonly cells: number
  readonly onPick: (formula: string, fmt: Fmt) => void
}) {
  const [period, setPeriod] = useState("week")
  return (
    <div className="flex flex-col gap-3 p-3">
      <Field label="Voor">
        {(control) => (
          <Select {...control} value={period} onChange={(event) => setPeriod(event.target.value)}>
            <option value="week">De week, 16–22 nov</option>
            {WEEK.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            <option value="vandaag">Vandaag tot 14:30</option>
          </Select>
        )}
      </Field>
      <ul className="flex max-h-64 flex-col overflow-y-auto" aria-label="Cijfers">
        {METRICS.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() =>
                onPick(`=INSYTE("${m.id}"; "${period}")`, m.id === "marge" ? "percent" : m.money ? "money" : "integer")}
              className="flex min-h-8 w-full items-center rounded-sm px-2 text-left text-sm text-ink hover:bg-hover pointer-coarse:min-h-11"
            >
              {m.label}
            </button>
          </li>
        ))}
      </ul>
      {cells > 1 && <p className="text-xs text-ink-3">Komt in alle {cells} geselecteerde cellen.</p>}
    </div>
  )
}

function RenameDialog(
  { sheet, open, onClose }: { readonly sheet: Sheet; readonly open: boolean; readonly onClose: () => void }
) {
  const [title, setTitle] = useState(sheet.title)
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Naam wijzigen"
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Annuleren</Button>
          <Button
            variant="primary"
            disabled={title.trim() === ""}
            onClick={() => {
              patchSheet(sheet.id, { title: title.trim() })
              onClose()
              toast({ title: "Naam gewijzigd" })
            }}
          >
            Opslaan
          </Button>
        </>
      }
    >
      <Field label="Naam">
        {(control) => <Input {...control} value={title} onChange={(event) => setTitle(event.target.value)} />}
      </Field>
    </Dialog>
  )
}
