import { Link, useNavigate } from "@tanstack/react-router"
import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "../../components/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "../../components/popover"
import { Bold, ChevronDown, Copy, Download, Edit3, Plus, Sigma, Sparkle, Trash2, Undo2 } from "../../icons"
import { EmptyState } from "../common/empty-state"
import { PageHeader } from "../common/page-header"
import { newId } from "../lib/courses"
import { formatRelative } from "../lib/format"
import {
  addr,
  type Cell,
  colName,
  COLS,
  display,
  evaluator,
  type Fmt,
  fromCsv,
  FUNCTIONS,
  inferFmt,
  isErr,
  METRICS,
  parseAddr,
  parseTyped,
  plain,
  ROWS,
  shift,
  type Tab,
  type Value
} from "../lib/sheets"
import { cn } from "../lib/utils"
import { Arriving } from "../loading/bones"
import { GridBones, PageSkeleton } from "../loading/page-skeletons"
import { PersonDisc } from "../team/bits"
import { SheetMenu } from "./sheets-screen"
import { type SheetDoc, useSheetDoc, useSheetsSource } from "./sheets-source"

type Pos = { c: number; r: number }
type Sel = { a: Pos; b: Pos }

const DEFAULT_W = 104
const ROW_H = 30
const clampPos = (p: Pos): Pos => ({ c: Math.max(0, Math.min(COLS - 1, p.c)), r: Math.max(0, Math.min(ROWS - 1, p.r)) })
const box = (s: Sel) => ({
  c0: Math.min(s.a.c, s.b.c),
  c1: Math.max(s.a.c, s.b.c),
  r0: Math.min(s.a.r, s.b.r),
  r1: Math.max(s.a.r, s.b.r)
})
const inBox = (s: Sel, c: number, r: number) => {
  const b = box(s)
  return c >= b.c0 && c <= b.c1 && r >= b.r0 && r <= b.r1
}

const FMT_LABEL: Record<Fmt, string> = {
  general: "Standaard",
  money: "Valuta",
  percent: "Procent",
  number: "Getal, twee decimalen",
  integer: "Heel getal"
}

/**
 * One rekenblad (`/sheets/$sheetId`). The grid takes the keyboard the way a spreadsheet does —
 * arrows, Enter, Tab, typing to replace, F2 to edit, ⌘C/⌘V, ⌘Z — and clicking a cell while writing
 * a formula puts its address in. The bar above it says, in a sentence, what an error means, and
 * where a linked cell reads its figure.
 */
export function SheetEditorPage() {
  const doc = useSheetDoc()
  const sheet = doc.sheet
  if (doc.status === "loading") return <PageSkeleton kind="grid" title="Rekenblad" />
  if (sheet === null || doc.status === "missing") {
    return (
      <div className="flex min-w-0 flex-col">
        <PageHeader title="Rekenblad" crumbs={[{ label: "Rekenbladen", to: "/sheets" }]} />
        <EmptyState kind="sheets" title="Dit rekenblad bestaat niet (meer)." body="Ga terug naar Rekenbladen." />
      </div>
    )
  }
  return <Editor key={sheet.id} doc={doc} />
}

function Editor({ doc }: { doc: SheetDoc }) {
  /* The formulas are evaluated in the browser, so the cells are the last thing to appear: the grid
	   is there at once, the values a beat later (ADR-0028). */
  const computed = doc.computed
  const navigate = useNavigate()
  const sheet = doc.sheet!
  const id = sheet.id
  const source = useSheetsSource()
  const { folders, figures, currency, months } = source
  const owner = source.members.find((m) => m.id === sheet.ownerId)
  const [tabId, setTabId] = useState(sheet.tabs[0]!.id)
  const tab = sheet.tabs.find((t) => t.id === tabId) ?? sheet.tabs[0]!
  const [sel, setSel] = useState<Sel>({ a: { c: 0, r: 0 }, b: { c: 0, r: 0 } })
  const [edit, setEdit] = useState<{ text: string; from: "cell" | "bar" } | null>(null)
  const past = useRef<Tab[][]>([])
  const future = useRef<Tab[][]>([])
  const grid = useRef<HTMLDivElement>(null)
  const cellInput = useRef<HTMLInputElement>(null)
  const barInput = useRef<HTMLInputElement>(null)
  const [, bump] = useState(0)

  // The tabs as last set, for the history: an edit lands before the host has rendered it.
  const latest = useRef(sheet.tabs)
  latest.current = sheet.tabs
  const setTabs = (tabs: Tab[]) => {
    latest.current = tabs
    doc.setTabs(tabs)
  }

  const ev = useMemo(() => evaluator({ tabs: sheet.tabs, figures }, tab.id), [sheet.tabs, figures, tab.id])
  const active = sel.a
  const activeAddr = addr(active.c, active.r)
  const activeCell = tab.cells[activeAddr]
  const activeValue = ev.value(activeAddr)
  const link = ev.link(activeAddr)

  /* ── history ── */
  const commit = useCallback(
    (tabs: Tab[]) => {
      past.current.push(latest.current)
      if (past.current.length > 100) past.current.shift()
      future.current = []
      latest.current = tabs
      doc.setTabs(tabs)
      bump((n) => n + 1)
    },
    [doc]
  )
  const undo = () => {
    const prev = past.current.pop()
    if (!prev) return
    future.current.push(latest.current)
    setTabs(prev)
    bump((n) => n + 1)
  }
  const redo = () => {
    const next = future.current.pop()
    if (!next) return
    past.current.push(latest.current)
    setTabs(next)
    bump((n) => n + 1)
  }
  const editTab = (f: (t: Tab) => Tab) => commit(latest.current.map((t) => (t.id === tab.id ? f(t) : t)))
  const setCells = (patch: Record<string, Partial<Cell> | null>) =>
    editTab((t) => {
      const cells = { ...t.cells }
      for (const [a, p] of Object.entries(patch)) {
        if (p === null) delete cells[a]
        else {
          const next = { ...(cells[a] ?? { v: "" }), ...p }
          if (!next.v && !next.bold && !next.fmt) delete cells[a]
          else cells[a] = next
        }
      }
      return { ...t, cells }
    })

  /* ── writing a cell ── */
  const write = (a: string, text: string) => {
    const old = tab.cells[a]
    if ((old?.v ?? "") === text) return
    if (text === "") return setCells({ [a]: old?.bold || old?.fmt ? { v: "" } : null })
    const typed = text.startsWith("=") ? { fmt: old?.fmt ?? inferFmt(text) } : { fmt: old?.fmt ?? parseTyped(text).fmt }
    setCells({ [a]: { v: text, ...(typed.fmt ? { fmt: typed.fmt } : {}) } })
  }
  const startEdit = (text: string, from: "cell" | "bar" = "cell") => {
    setEdit({ text, from })
    requestAnimationFrame(() => {
      const el = from === "cell" ? cellInput.current : barInput.current
      el?.focus()
      el?.setSelectionRange(text.length, text.length)
    })
  }
  const editRef = useRef(edit)
  editRef.current = edit
  const finish = (move?: Pos) => {
    const current = editRef.current
    /* Cleared at once: Enter commits and then the input blurs, and that must not commit twice. */
    editRef.current = null
    if (current) write(activeAddr, current.text)
    setEdit(null)
    if (move) {
      const p = clampPos({ c: active.c + move.c, r: active.r + move.r })
      setSel({ a: p, b: p })
    }
    requestAnimationFrame(() => grid.current?.focus())
  }
  const cancel = () => {
    setEdit(null)
    requestAnimationFrame(() => grid.current?.focus())
  }

  /* ── clipboard ── */
  const rangeRows = () => {
    const b = box(sel)
    const rows: string[][] = []
    for (let r = b.r0; r <= b.r1; r++) {
      const row: string[] = []
      for (let c = b.c0; c <= b.c1; c++) row.push(tab.cells[addr(c, r)]?.v ?? "")
      rows.push(row)
    }
    return rows
  }
  const copy = async (cut = false) => {
    const text = rangeRows()
      .map((r) => r.join("\t"))
      .join("\n")
    clip.current = { text, from: box(sel) }
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      /* The internal copy is enough inside the sheet. */
    }
    if (cut) clear()
  }
  const clip = useRef<{ text: string; from: { c0: number; r0: number } } | null>(null)
  const paste = async () => {
    let text = clip.current?.text ?? ""
    try {
      text = (await navigator.clipboard.readText()) || text
    } catch {
      /* Reading the system clipboard needs permission; fall back to what was copied here. */
    }
    if (!text) return
    const rows = fromCsv(text.replace(/\r/g, ""))
    const from = clip.current?.text === text ? clip.current.from : { c0: active.c, r0: active.r }
    const patch: Record<string, Partial<Cell>> = {}
    rows.forEach((row, dr) =>
      row.forEach((v, dc) => {
        const c = active.c + dc
        const r = active.r + dr
        if (c >= COLS || r >= ROWS) return
        patch[addr(c, r)] = { v: shift(v, active.c - from.c0, active.r - from.r0) }
      })
    )
    setCells(patch)
    setSel({ a: active, b: clampPos({ c: active.c + (rows[0]?.length ?? 1) - 1, r: active.r + rows.length - 1 }) })
  }
  const clear = () => {
    const b = box(sel)
    const patch: Record<string, null> = {}
    for (let r = b.r0; r <= b.r1; r++) {
      for (let c = b.c0; c <= b.c1; c++) if (tab.cells[addr(c, r)]) patch[addr(c, r)] = null
    }
    if (Object.keys(patch).length) setCells(patch)
  }
  const fillDown = () => {
    const b = box(sel)
    if (b.r1 === b.r0) return
    const patch: Record<string, Partial<Cell>> = {}
    for (let c = b.c0; c <= b.c1; c++) {
      const src = tab.cells[addr(c, b.r0)]
      for (let r = b.r0 + 1; r <= b.r1; r++) {
        patch[addr(c, r)] = src
          ? { ...src, v: shift(src.v, 0, r - b.r0) }
          : { v: "" }
      }
    }
    setCells(patch)
  }
  const format = (patch: Partial<Cell>) => {
    const b = box(sel)
    const out: Record<string, Partial<Cell>> = {}
    for (let r = b.r0; r <= b.r1; r++) for (let c = b.c0; c <= b.c1; c++) out[addr(c, r)] = patch
    setCells(out)
  }
  const sumHere = () => {
    /* Σ: sums the numbers directly above the active cell, the way a total row is made. */
    let r = active.r - 1
    while (r >= 0 && typeof ev.value(addr(active.c, r)) !== "number") r--
    const end = r
    while (r >= 0 && typeof ev.value(addr(active.c, r)) === "number") r--
    if (end < 0) return startEdit("=SOM()")
    write(activeAddr, `=SOM(${addr(active.c, r + 1)}:${addr(active.c, end)})`)
  }

  /* ── the keyboard ── */
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (edit) {
      /* Keys that arrive before the editor has focus still belong to it. */
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        setEdit((x) => (x ? { ...x, text: x.text + e.key } : x))
      } else if (e.key === "Enter") {
        e.preventDefault()
        finish({ c: 0, r: 1 })
      } else if (e.key === "Escape") cancel()
      return
    }
    const mod = e.metaKey || e.ctrlKey
    const k = e.key
    const move = (dc: number, dr: number) => {
      e.preventDefault()
      const p = clampPos({ c: (e.shiftKey ? sel.b.c : active.c) + dc, r: (e.shiftKey ? sel.b.r : active.r) + dr })
      setSel(e.shiftKey ? { a: sel.a, b: p } : { a: p, b: p })
    }
    if (mod && k.toLowerCase() === "z") {
      e.preventDefault()
      return e.shiftKey ? redo() : undo()
    }
    if (mod && k.toLowerCase() === "y") return (e.preventDefault(), redo())
    if (mod && k.toLowerCase() === "c") return (e.preventDefault(), void copy())
    if (mod && k.toLowerCase() === "x") return (e.preventDefault(), void copy(true))
    if (mod && k.toLowerCase() === "v") return (e.preventDefault(), void paste())
    if (mod && k.toLowerCase() === "b") return (e.preventDefault(), format({ bold: !activeCell?.bold }))
    if (mod && k.toLowerCase() === "d") return (e.preventDefault(), fillDown())
    if (mod && k.toLowerCase() === "a") {
      return (e.preventDefault(), setSel({ a: { c: 0, r: 0 }, b: { c: COLS - 1, r: ROWS - 1 } }))
    }
    if (k === "ArrowUp") return move(0, -1)
    if (k === "ArrowDown") return move(0, 1)
    if (k === "ArrowLeft") return move(-1, 0)
    if (k === "ArrowRight") return move(1, 0)
    if (k === "Tab") return move(e.shiftKey ? -1 : 1, 0)
    if (k === "Enter" || k === "F2") return (e.preventDefault(), startEdit(activeCell?.v ?? ""))
    if (k === "Delete" || k === "Backspace") return (e.preventDefault(), clear())
    if (k.length === 1 && !mod && !e.altKey) {
      e.preventDefault()
      startEdit(k)
    }
  }
  const onEditKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") return (e.preventDefault(), finish({ c: 0, r: e.shiftKey ? -1 : 1 }))
    if (e.key === "Tab") {
      e.preventDefault()
      const hint = suggestions[0]
      if (hint && edit) return setEdit({ ...edit, text: edit.text.replace(/[A-Z.]+$/i, `${hint.name}(`) })
      return finish({ c: e.shiftKey ? -1 : 1, r: 0 })
    }
    if (e.key === "Escape") return (e.preventDefault(), cancel())
  }

  /* While a formula is being written, a click on a cell writes its address instead of moving. */
  const pointing = edit !== null && edit.text.startsWith("=") && /[=(;:+\-*/^&<>]$/.test(edit.text.trimEnd())
  const drag = useRef<Pos | null>(null)
  const down = (c: number, r: number, shiftKey: boolean) => {
    if (pointing && edit) {
      setEdit({ ...edit, text: edit.text + addr(c, r) })
      drag.current = { c, r }
      requestAnimationFrame(() => (edit.from === "cell" ? cellInput : barInput).current?.focus())
      return
    }
    if (edit) finish()
    else grid.current?.focus({ preventScroll: true })
    drag.current = shiftKey ? sel.a : { c, r }
    setSel(shiftKey ? { a: sel.a, b: { c, r } } : { a: { c, r }, b: { c, r } })
  }
  const over = (c: number, r: number) => {
    if (!drag.current) return
    if (pointing && edit) {
      const start = drag.current
      if (start.c === c && start.r === r) return
      setEdit({
        ...edit,
        text: edit.text.replace(/[A-Z]{1,2}\d{1,4}(:[A-Z]{1,2}\d{1,4})?$/, `${addr(start.c, start.r)}:${addr(c, r)}`)
      })
      return
    }
    setSel((s) => ({ a: s.a, b: { c, r } }))
  }
  useEffect(() => {
    const up = () => {
      drag.current = null
    }
    window.addEventListener("pointerup", up)
    return () => window.removeEventListener("pointerup", up)
  }, [])

  const suggestions = useMemo(() => {
    const m = edit?.text.startsWith("=") ? /([A-Z.]{2,})$/i.exec(edit.text) : null
    return m ? FUNCTIONS.filter((f) => f.name.startsWith(m[1]!.toUpperCase())).slice(0, 4) : []
  }, [edit])

  /* ── column widths ── */
  const width = (c: number) => tab.widths[colName(c)] ?? DEFAULT_W
  const resize = (c: number, startX: number) => {
    const start = width(c)
    let w = start
    const moveW = (e: PointerEvent) => {
      w = Math.max(56, Math.min(360, start + e.clientX - startX))
      const th = grid.current?.querySelector<HTMLElement>(`[data-col="${c}"]`)
      if (th) th.style.width = `${w}px`
    }
    const upW = () => {
      window.removeEventListener("pointermove", moveW)
      window.removeEventListener("pointerup", upW)
      if (w !== start) editTab((t) => ({ ...t, widths: { ...t.widths, [colName(c)]: Math.round(w) } }))
    }
    window.addEventListener("pointermove", moveW)
    window.addEventListener("pointerup", upW)
  }

  /* ── what the selection adds up to ── */
  const stats = useMemo(() => {
    const b = box(sel)
    if (b.c0 === b.c1 && b.r0 === b.r1) return null
    const xs: number[] = []
    for (let r = b.r0; r <= b.r1; r++) {
      for (let c = b.c0; c <= b.c1; c++) {
        const v = ev.value(addr(c, r))
        if (typeof v === "number") xs.push(v)
      }
    }
    if (!xs.length) return null
    const sum = xs.reduce((s, x) => s + x, 0)
    const f = tab.cells[addr(b.c0, b.r0)]?.fmt === "money" || tab.cells[addr(b.c0, b.r1)]?.fmt === "money"
      ? "money"
      : undefined
    return { sum: display(sum, f, currency), avg: display(sum / xs.length, f, currency), n: xs.length }
  }, [sel, ev, tab.cells, currency])

  const exportCsv = () => {
    let maxR = 0
    let maxC = 0
    for (const a of Object.keys(tab.cells)) {
      const p = parseAddr(a)
      if (p) {
        maxR = Math.max(maxR, p.r)
        maxC = Math.max(maxC, p.c)
      }
    }
    const rows: string[][] = []
    for (let r = 0; r <= maxR; r++) {
      const row: string[] = []
      for (let c = 0; c <= maxC; c++) row.push(plain(ev.value(addr(c, r))))
      rows.push(row)
    }
    doc.exportCsv(tab, rows)
  }

  const folder = folders.find((f) => f.id === sheet.folderId)
  const b = box(sel)
  const nameBox = b.c0 === b.c1 && b.r0 === b.r1 ? activeAddr : `${addr(b.c0, b.r0)}:${addr(b.c1, b.r1)}`

  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      <PageHeader
        title={
          <TitleInput
            value={sheet.title}
            onChange={(title) => source.patch([id], { title }, "Naam gewijzigd")}
          />
        }
        crumbs={[
          { label: "Rekenbladen", to: "/sheets" },
          ...(folder ? [{ label: folder.name, to: `/sheets?folder=${folder.id}` }] : [])
        ]}
        meta={
          <span className="flex items-center gap-2 text-ink-3 text-sm">
            <PersonDisc seed={sheet.ownerId} name={owner?.name ?? "?"} size={18} />
            {doc.save === "saving" ? "Opslaan…" : doc.save === "failed" ? "Niet opgeslagen" : "Opgeslagen"} · bewerkt
            {" "}
            {formatRelative(sheet.updatedAt)}
            {sheet.shared.length ? ` · gedeeld met ${sheet.shared.length}` : ""}
          </span>
        }
        actions={
          <>
            <button
              type="button"
              onClick={exportCsv}
              className="field flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-ink text-sm transition-colors hover:field-hover"
            >
              <Download className="size-3.5" strokeWidth={1.75} />
              CSV
            </button>
            <SheetMenu s={sheet} onGone={() => void navigate({ to: "/sheets" })} />
          </>
        }
      />

      <div className="flex min-h-0 flex-col px-5 pb-6">
        <div className="flex min-h-0 flex-col overflow-hidden rounded-xl bg-paper shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--ink)_9%,transparent)]">
          {/* toolbar */}
          <div role="toolbar" aria-label="Opmaak" className="flex flex-wrap items-center gap-0.5 bg-mist px-2 py-1.5">
            <Tool label="Ongedaan maken (⌘Z)" onClick={undo} disabled={!past.current.length}>
              <Undo2 className="size-3.5" strokeWidth={1.75} />
            </Tool>
            <Tool label="Opnieuw (⇧⌘Z)" onClick={redo} disabled={!future.current.length}>
              <Undo2 className="size-3.5 -scale-x-100" strokeWidth={1.75} />
            </Tool>
            <Sep />
            {(
              [
                ["money", "$"],
                ["percent", "%"],
                ["number", ",00"],
                ["integer", "123"]
              ] as const
            ).map(([f, l]) => (
              <Tool
                key={f}
                label={FMT_LABEL[f]}
                pressed={activeCell?.fmt === f}
                onClick={() => format({ fmt: activeCell?.fmt === f ? "general" : f })}
              >
                <span className="font-medium text-xs tabular-nums">{l}</span>
              </Tool>
            ))}
            <Tool label="Vet (⌘B)" pressed={!!activeCell?.bold} onClick={() => format({ bold: !activeCell?.bold })}>
              <Bold className="size-3.5" strokeWidth={2} />
            </Tool>
            <Sep />
            <Tool label="Optellen wat erboven staat" onClick={sumHere}>
              <Sigma className="size-3.5" strokeWidth={1.75} />
              <span className="text-xs">Som</span>
            </Tool>
            <span className="flex-1" />
            <LinkPicker
              rows={b.r1 - b.r0 + 1}
              monthInA={months.some((m) => String(ev.value(addr(0, b.r0))).toLowerCase() === m.label.toLowerCase())}
              onPick={(metric, month) => {
                const patch: Record<string, Partial<Cell>> = {}
                for (let r = b.r0; r <= b.r1; r++) {
                  for (let c = b.c0; c <= b.c1; c++) {
                    const arg = month === "row" ? `$A${r + 1}` : `"${month}"`
                    patch[addr(c, r)] = {
                      v: `=INSYTE("${metric}"; ${arg})`,
                      fmt: METRICS.find((m) => m.id === metric)?.fmt
                    }
                  }
                }
                setCells(patch)
                requestAnimationFrame(() => grid.current?.focus())
              }}
            />
          </div>

          {/* formula bar */}
          <div className="flex items-center gap-2 px-2 py-1.5">
            <span
              className="flex h-7 min-w-16 items-center justify-center rounded-md bg-mist px-2 font-medium text-ink-2 text-xs tabular-nums"
              aria-label="Geselecteerd"
            >
              {nameBox}
            </span>
            <Sigma className="size-3.5 shrink-0 text-ink-3" strokeWidth={1.75} aria-hidden />
            <div className="relative min-w-0 flex-1">
              <input
                ref={barInput}
                aria-label={`Inhoud van ${activeAddr}`}
                value={edit ? edit.text : (activeCell?.v ?? "")}
                onFocus={() => !edit && setEdit({ text: activeCell?.v ?? "", from: "bar" })}
                onChange={(e) => setEdit({ text: e.target.value, from: "bar" })}
                onKeyDown={onEditKey}
                onBlur={() => edit?.from === "bar" && !pointing && finish()}
                placeholder="Een waarde, of een formule na ="
                className="h-7 w-full rounded-md bg-transparent px-2 text-ink text-sm outline-none placeholder:text-ink-3 focus:bg-mist"
              />
              {edit?.from === "bar" && suggestions.length ? <Suggestions items={suggestions} /> : null}
            </div>
            {link ?
              (
                <Link
                  to="/analytics"
                  className="flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-arc-tint px-2 font-medium text-arc-ink text-xs transition-colors hover:bg-arc-tint/70"
                  title="Hetzelfde cijfer als in Analyse"
                >
                  <Sparkle className="size-3" strokeWidth={1.75} />
                  {METRICS.find((m) => m.id === link.metric.toLowerCase())?.label ?? link.metric}
                  {link.month ? ` · ${months.find((m) => m.id === link.month)?.abbr ?? link.month}` : ""}
                </Link>
              ) :
              null}
          </div>
          {isErr(activeValue) ?
            (
              <p
                role="status"
                className="mx-2 mb-1.5 flex items-start gap-2 rounded-md bg-signal-red-bg px-3 py-1.5 text-ink text-sm"
              >
                <span className="font-medium text-signal-red tabular-nums">{activeValue.error}</span>
                {activeValue.why}
              </p>
            ) :
            null}

          {/* grid */}
          <div
            ref={grid}
            tabIndex={0}
            onKeyDown={onKey}
            aria-label={`Blad ${tab.name}`}
            role="grid"
            aria-rowcount={ROWS}
            aria-colcount={COLS}
            className="relative max-h-[calc(100vh-280px)] min-h-[320px] overflow-auto outline-none"
          >
            <table className="border-separate border-spacing-0 text-sm" style={{ tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: 44 }} />
                {Array.from({ length: COLS }, (_, c) => <col key={c} data-col={c} style={{ width: width(c) }} />)}
              </colgroup>
              <thead>
                <tr>
                  <th className="sticky top-0 left-0 z-20 h-7 bg-mist" aria-hidden />
                  {Array.from({ length: COLS }, (_, c) => {
                    const on = c >= b.c0 && c <= b.c1
                    return (
                      <th
                        key={c}
                        scope="col"
                        className={cn(
                          "sticky top-0 z-10 h-7 select-none font-medium text-xs",
                          on ? "bg-arc-tint text-arc-ink" : "bg-mist text-ink-3"
                        )}
                        onPointerDown={() => setSel({ a: { c, r: 0 }, b: { c, r: ROWS - 1 } })}
                      >
                        {colName(c)}
                        <span
                          onPointerDown={(e) => {
                            e.stopPropagation()
                            resize(c, e.clientX)
                          }}
                          className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-arc/30"
                          aria-hidden
                        />
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: ROWS }, (_, r) => {
                  const onRow = r >= b.r0 && r <= b.r1
                  return (
                    <tr key={r} style={{ height: ROW_H }}>
                      <th
                        scope="row"
                        className={cn(
                          "sticky left-0 z-10 select-none text-center font-normal text-xs tabular-nums",
                          onRow ? "bg-arc-tint text-arc-ink" : "bg-mist text-ink-3"
                        )}
                        onPointerDown={() => setSel({ a: { c: 0, r }, b: { c: COLS - 1, r } })}
                      >
                        {r + 1}
                      </th>
                      {Array.from({ length: COLS }, (_, c) => {
                        const a = addr(c, r)
                        const isActive = c === active.c && r === active.r
                        return (
                          <GridCell
                            key={a}
                            cell={tab.cells[a]}
                            value={ev.value(a)}
                            linked={!!tab.cells[a]?.v && /INSYTE\(/i.test(tab.cells[a]!.v)}
                            active={isActive}
                            selected={inBox(sel, c, r)}
                            band={r % 2 === 1}
                            onDown={(e) => down(c, r, e.shiftKey)}
                            onEnter={() => over(c, r)}
                            onDouble={() => startEdit(tab.cells[a]?.v ?? "")}
                          >
                            {isActive && edit?.from === "cell" ?
                              (
                                <>
                                  <input
                                    ref={cellInput}
                                    autoFocus
                                    aria-label={`Bewerk ${a}`}
                                    value={edit.text}
                                    onChange={(e) => setEdit({ text: e.target.value, from: "cell" })}
                                    onKeyDown={onEditKey}
                                    onBlur={() => !pointing && finish()}
                                    className="absolute inset-0 z-10 w-full bg-paper px-2 text-ink text-sm outline-none"
                                  />
                                  {suggestions.length ? <Suggestions items={suggestions} /> : null}
                                </>
                              ) :
                              null}
                          </GridCell>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {computed ? null : (
              <div className="absolute inset-0 z-20 bg-paper">
                <Arriving label="Rekenblad uitrekenen">
                  <GridBones rows={18} />
                </Arriving>
              </div>
            )}
          </div>

          {/* tabs and the selection's sum */}
          <div className="flex items-center gap-1 bg-mist px-2 py-1.5">
            <Tabs tabs={sheet.tabs} active={tab.id} onPick={(t) => setTabId(t)} onChange={commit} />
            <span className="flex-1" />
            {stats ?
              (
                <span className="hidden gap-4 text-ink-2 text-xs tabular-nums sm:flex">
                  <span>
                    <span className="text-ink-3">Som</span> {stats.sum}
                  </span>
                  <span>
                    <span className="text-ink-3">Gemiddelde</span> {stats.avg}
                  </span>
                  <span>
                    <span className="text-ink-3">Aantal</span> {stats.n}
                  </span>
                </span>
              ) :
              (
                <span className="hidden text-ink-3 text-xs sm:block">
                  ⌘C kopiëren · ⌘V plakken · ⌘D omlaag vullen · F2 bewerken
                </span>
              )}
          </div>
        </div>
      </div>
    </div>
  )
}

function GridCell({
  cell,
  value,
  linked,
  active,
  selected,
  band,
  onDown,
  onEnter,
  onDouble,
  children
}: {
  cell?: Cell
  value: Value
  linked: boolean
  active: boolean
  selected: boolean
  band: boolean
  onDown: (e: React.PointerEvent) => void
  onEnter: () => void
  onDouble: () => void
  children?: ReactNode
}) {
  const text = display(value, cell?.fmt, useSheetsSource().currency)
  const num = typeof value === "number"
  return (
    <td
      role="gridcell"
      aria-selected={selected}
      title={isErr(value) ? `${value.error} ${value.why}` : undefined}
      onPointerDown={(e) => {
        e.preventDefault()
        onDown(e)
      }}
      onPointerEnter={onEnter}
      onDoubleClick={onDouble}
      className={cn(
        "relative cursor-cell truncate px-2 text-ink",
        active
          ? "bg-arc-tint shadow-[inset_0_-2px_0_var(--arc)]"
          : selected
          ? "bg-arc-tint/45"
          : band
          ? "bg-mist/40"
          : "bg-paper",
        (num || cell?.align === "right") && "text-right tabular-nums",
        cell?.bold && "font-medium",
        isErr(value) && "text-signal-red"
      )}
    >
      {text}
      {linked ? <span aria-hidden className="absolute top-1 right-1 size-1 bg-arc" /> : null}
      {children}
    </td>
  )
}

function Suggestions({ items }: { items: ReadonlyArray<{ name: string; hint: string }> }) {
  return (
    <ul className="panel-raised absolute top-full left-0 z-30 mt-1 w-72 rounded-lg bg-paper p-1 text-sm">
      {items.map((f, i) => (
        <li key={f.name} className={cn("flex flex-col rounded-md px-2 py-1.5", i === 0 && "bg-mist")}>
          <span className="font-medium text-ink">{f.name}</span>
          <span className="text-ink-3 text-xs">
            {f.hint}
            {i === 0 ? " · Tab vult aan" : ""}
          </span>
        </li>
      ))}
    </ul>
  )
}

function TitleInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <input
      value={v}
      aria-label="Naam van het rekenblad"
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v.trim() && v !== value && onChange(v.trim())}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      size={Math.max(8, Math.min(48, v.length + 1))}
      className="-mx-1.5 max-w-[50vw] rounded-md bg-transparent px-1.5 py-0.5 font-medium text-ink text-lg outline-none hover:bg-ink/4 focus:bg-paper"
    />
  )
}

function Tool(
  { label, onClick, disabled, pressed, children }: {
    label: string
    onClick: () => void
    disabled?: boolean
    pressed?: boolean
    children: ReactNode
  }
) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-7 min-w-7 items-center justify-center gap-1 rounded-md px-1.5 transition-colors disabled:opacity-35",
        pressed
          ? "bg-paper text-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)]"
          : "text-ink-2 enabled:hover:bg-ink/6 enabled:hover:text-ink"
      )}
    >
      {children}
    </button>
  )
}

const Sep = () => <span aria-hidden className="mx-1 h-4 w-px bg-ink/10" />

/* ── linking a cell to Insyte ──────────────────────────────────────────────────────────────── */

function LinkPicker(
  { rows, monthInA, onPick }: { rows: number; monthInA: boolean; onPick: (metric: string, month: string) => void }
) {
  const { months } = useSheetsSource()
  const last = months.at(-1)?.id ?? ""
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState<string>(monthInA && rows > 1 ? "row" : last)
  useEffect(() => {
    if (open) setMonth(monthInA ? "row" : last)
  }, [open, monthInA, last])
  const groups = ["Verkoop", "Kosten", "Resultaat", "Kanalen"] as const
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-7 items-center gap-1.5 rounded-md bg-arc-tint px-2.5 font-medium text-arc-ink text-sm transition-colors hover:bg-arc-tint/70"
        >
          <Sparkle className="size-3.5" strokeWidth={1.75} />
          Koppelen aan Insyte
          <ChevronDown className="size-3" strokeWidth={2} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] p-0">
        <div className="flex flex-col gap-2 p-3">
          <span className="font-medium text-ink text-sm">Welke maand</span>
          <div role="radiogroup" aria-label="Maand" className="flex flex-wrap gap-1">
            {monthInA ?
              (
                <MonthChip on={month === "row"} onClick={() => setMonth("row")}>
                  Uit kolom A
                </MonthChip>
              ) :
              null}
            {months.map((m) => (
              <MonthChip key={m.id} on={month === m.id} onClick={() => setMonth(m.id)}>
                {m.abbr}
              </MonthChip>
            ))}
          </div>
          {month === "row"
            ? (
              <p className="text-ink-3 text-xs">
                Elke rij leest de maand die in kolom A staat, dus je kunt hem omlaag vullen.
              </p>
            )
            : null}
        </div>
        <div className="max-h-[300px] overflow-y-auto border-hairline border-t p-1">
          {groups.map((g) => (
            <div key={g} className="flex flex-col">
              <span className="px-2 pt-2 pb-1 text-ink-3 text-xs">{g}</span>
              {METRICS.filter((m) => m.group === g).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    onPick(m.id, month)
                    setOpen(false)
                  }}
                  className="flex h-8 items-center justify-between rounded-md px-2 text-left text-ink text-sm transition-colors hover:bg-arc-tint/60"
                >
                  {m.label}
                  <span className="text-ink-3 text-xs">
                    {m.fmt === "money" ? "bedrag" : m.fmt === "percent" ? "procent" : "getal"}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
        <p className="bg-mist px-3 py-2 text-ink-3 text-xs">
          Hetzelfde cijfer als in Analyse. Advertenties en kosten komen uit Kosten.
        </p>
      </PopoverContent>
    </Popover>
  )
}

function MonthChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        "h-7 rounded-md px-2.5 font-medium text-sm transition-colors",
        on ? "bg-abyss text-mesh-ink" : "field text-ink-2 hover:field-hover hover:text-ink"
      )}
    >
      {children}
    </button>
  )
}

/* ── tabs ─────────────────────────────────────────────────────────────────────────────────── */

function Tabs(
  { tabs, active, onPick, onChange }: {
    tabs: Tab[]
    active: string
    onPick: (id: string) => void
    onChange: (tabs: Tab[]) => void
  }
) {
  const [renaming, setRenaming] = useState<string | null>(null)
  const [name, setName] = useState("")
  const rename = (id: string) => {
    const t = tabs.find((x) => x.id === id)
    setName(t?.name ?? "")
    setRenaming(id)
  }
  const done = () => {
    if (renaming && name.trim()) onChange(tabs.map((t) => (t.id === renaming ? { ...t, name: name.trim() } : t)))
    setRenaming(null)
  }
  return (
    <div role="tablist" aria-label="Tabbladen" className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
      {tabs.map((t) =>
        renaming === t.id ?
          (
            <input
              key={t.id}
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={done}
              onKeyDown={(e) => (e.key === "Enter" ? done() : e.key === "Escape" ? setRenaming(null) : undefined)}
              aria-label="Naam van het tabblad"
              className="h-7 w-28 rounded-md bg-paper px-2 text-ink text-sm outline-none"
            />
          ) :
          (
            <span key={t.id} className="flex items-center">
              <button
                type="button"
                role="tab"
                aria-selected={t.id === active}
                onClick={() => onPick(t.id)}
                onDoubleClick={() => rename(t.id)}
                className={cn(
                  "flex h-7 items-center rounded-l-md px-2.5 text-sm transition-colors",
                  t.id === active
                    ? "bg-paper font-medium text-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)]"
                    : "rounded-r-md text-ink-2 hover:bg-ink/6 hover:text-ink"
                )}
              >
                {t.name}
              </button>
              {t.id === active ?
                (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Opties voor ${t.name}`}
                        className="flex h-7 items-center rounded-r-md bg-paper pr-1.5 pl-0.5 text-ink-3 shadow-[0_1px_2px_rgb(0_0_0/0.06)] hover:text-ink"
                      >
                        <ChevronDown className="size-3" strokeWidth={2} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" side="top" className="w-44">
                      <DropdownMenuItem onClick={() => rename(t.id)}>
                        <Edit3 className="size-3.5" strokeWidth={1.75} />
                        Hernoemen
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          const copy = { ...t, id: newId("tab"), name: `${t.name} (kopie)` }
                          onChange([...tabs, copy])
                          onPick(copy.id)
                        }}
                      >
                        <Copy className="size-3.5" strokeWidth={1.75} />
                        Dupliceren
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        disabled={tabs.length === 1}
                        onClick={() => {
                          const rest = tabs.filter((x) => x.id !== t.id)
                          onChange(rest)
                          onPick(rest[0]!.id)
                          toast(`${t.name} verwijderd`, { description: "⌘Z zet het terug." })
                        }}
                      >
                        <Trash2 className="size-3.5" strokeWidth={1.75} />
                        Verwijderen
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) :
                null}
            </span>
          )
      )}
      <button
        type="button"
        aria-label="Tabblad toevoegen"
        title="Tabblad toevoegen"
        onClick={() => {
          const t: Tab = { id: newId("tab"), name: `Blad${tabs.length + 1}`, cells: {}, widths: {} }
          onChange([...tabs, t])
          onPick(t.id)
        }}
        className="flex size-7 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink"
      >
        <Plus className="size-3.5" strokeWidth={1.75} />
      </button>
    </div>
  )
}
