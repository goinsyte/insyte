import { useId, useMemo, useRef, useState } from "react"
import type { KeyboardEvent } from "react"
import { METRICS, WEEK } from "../../fixtures/costs.ts"
import { addr, COLUMNS, tabFrom } from "../../fixtures/sheets.ts"
import type { Cell, Fmt, Sheet, Tab } from "../../fixtures/sheets.ts"
import { PEOPLE } from "../../fixtures/workspace.ts"
import { Link, navigate, paths, setQuery, useQuery } from "../../router.tsx"
import { Denied, ReadOnlyNotice, useAccess } from "../../ui/access.tsx"
import { Button, IconButton } from "../../ui/button.tsx"
import { cx } from "../../ui/cx.ts"
import { Dialog } from "../../ui/dialog.tsx"
import { DropdownItem, DropdownMenu } from "../../ui/dropdown.tsx"
import {
  Archive,
  ArrowLeft,
  Bold,
  Download,
  Edit,
  MoreHorizontal,
  Pin,
  Plus,
  Redo,
  Sigma,
  Sparkle,
  Undo
} from "../../ui/icons.tsx"
import { Field, Input, Select } from "../../ui/input.tsx"
import { Page, PageHead } from "../../ui/page.tsx"
import { Popover } from "../../ui/popover.tsx"
import { Skeleton } from "../../ui/skeleton.tsx"
import { EmptyState, ErrorState } from "../../ui/states.tsx"
import { toast } from "../../ui/toast.tsx"
import { dataState, setView, useView } from "../../view.ts"
import { evaluate, isError, show } from "./engine.ts"
import { getSheet, patchSheet, setCells, setTabs, useSheets } from "./store.ts"

const FORMATS: ReadonlyArray<{ readonly value: Fmt | ""; readonly label: string }> = [
  { value: "", label: "Automatisch" },
  { value: "money", label: "Bedrag" },
  { value: "integer", label: "Heel getal" },
  { value: "number", label: "Getal, twee decimalen" },
  { value: "percent", label: "Percentage" },
  { value: "text", label: "Tekst" }
]

/**
 * One sheet: a grid of cells with a formula bar, tabs, and the few tools a calculation needs (undo,
 * bold, a sum, a figure from Insyte, a format). Rebuilt from `/app/sheets/$id` (`sheet-editor.tsx`).
 * Cells that read `INSYTE()` show the same figure as Kosten and Analyse; an error says why under the
 * formula bar.
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

type Snapshot = ReadonlyArray<Tab>

function Editor({ sheet, canEdit }: { readonly sheet: Sheet; readonly canEdit: boolean }) {
  const tabId = useQuery("tab") ?? sheet.tabs[0]?.id ?? ""
  const tab = sheet.tabs.find((t) => t.id === tabId) ?? sheet.tabs[0]
  const [selected, setSelected] = useState("A1")
  const [draft, setDraft] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)
  const past = useRef<Array<Snapshot>>([])
  const future = useRef<Array<Snapshot>>([])
  const grid = useRef<HTMLDivElement>(null)
  const barId = useId()
  const bar = { current: { focus: () => document.getElementById(barId)?.focus() } }
  const values = useMemo(() => evaluate(tab?.cells ?? {}), [tab])
  const owner = PEOPLE[sheet.owner]

  if (tab === undefined) return null
  const cell: Cell | undefined = tab.cells[selected]
  const value = values[selected]
  const raw = draft ?? cell?.v ?? ""

  const remember = () => {
    past.current = [...past.current.slice(-49), sheet.tabs]
    future.current = []
  }
  const write = (cells: Readonly<Record<string, Cell | null>>) => {
    if (!canEdit) return
    remember()
    setCells(getSheet(sheet.id) ?? sheet, tab.id, cells)
  }
  const commit = (move: [number, number] | null) => {
    if (draft !== null && draft !== (cell?.v ?? "")) {
      write({ [selected]: draft === "" ? null : { ...cell, v: draft } })
    }
    setDraft(null)
    if (move !== null) go(move[0], move[1])
    grid.current?.focus()
  }
  const undo = () => {
    const prev = past.current.pop()
    if (prev === undefined) return
    future.current.push(sheet.tabs)
    setTabs(sheet.id, prev)
  }
  const redo = () => {
    const next = future.current.pop()
    if (next === undefined) return
    past.current.push(sheet.tabs)
    setTabs(sheet.id, next)
  }

  const used = Object.keys(tab.cells)
  const rows = Math.max(14, ...used.map((k) => Number(k.slice(1)) + 3))
  const cols = Math.min(COLUMNS.length, Math.max(6, ...used.map((k) => COLUMNS.indexOf(k[0] ?? "A") + 2)))
  const pos = () => ({ c: COLUMNS.indexOf(selected[0] ?? "A"), r: Number(selected.slice(1)) - 1 })
  const go = (dc: number, dr: number) => {
    const { c, r } = pos()
    setSelected(addr(Math.min(cols - 1, Math.max(0, c + dc)), Math.min(rows - 1, Math.max(0, r + dr))))
  }

  const onGridKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const k = event.key
    if ((event.metaKey || event.ctrlKey) && k.toLowerCase() === "z") {
      event.preventDefault()
      if (event.shiftKey) redo()
      else undo()
      return
    }
    if ((event.metaKey || event.ctrlKey) && k.toLowerCase() === "b") {
      event.preventDefault()
      write({ [selected]: { ...cell, v: cell?.v ?? "", bold: cell?.bold !== true } })
      return
    }
    const moves: Record<string, [number, number]> = {
      ArrowRight: [1, 0],
      ArrowLeft: [-1, 0],
      ArrowDown: [0, 1],
      ArrowUp: [0, -1],
      Tab: [event.shiftKey ? -1 : 1, 0],
      Enter: [0, 1]
    }
    const m = moves[k]
    if (m !== undefined) {
      event.preventDefault()
      if (k === "Enter" && canEdit) {
        bar.current?.focus()
        setDraft(cell?.v ?? "")
        return
      }
      go(m[0], m[1])
      return
    }
    if ((k === "Backspace" || k === "Delete") && canEdit && cell !== undefined) {
      event.preventDefault()
      write({ [selected]: null })
      return
    }
    if (k.length === 1 && !event.metaKey && !event.ctrlKey && canEdit) {
      event.preventDefault()
      setDraft(k)
      bar.current?.focus()
    }
  }

  const sumHere = () => {
    const { c, r } = pos()
    let top = r - 1
    while (top >= 0 && typeof values[addr(c, top)] === "number") top--
    if (top === r - 1) {
      toast({ title: "Niets om op te tellen", body: "Kies de cel onder een rij getallen." })
      return
    }
    write({
      [selected]: { v: `=SOM(${addr(c, top + 1)}:${addr(c, r - 1)})`, bold: true, fmt: tab.cells[addr(c, r - 1)]?.fmt }
    })
  }

  const exportCsv = () => {
    const lines = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_x, c) => {
        const key = addr(c, r)
        const text = show(values[key], tab.cells[key]?.fmt)
        return /[",;\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text
      }).join(";")).filter((line) => line.replace(/;/g, "") !== "")
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }))
    const a = document.createElement("a")
    a.href = url
    a.download = `${sheet.title}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast({ title: `${sheet.title}.csv geëxporteerd`, body: "Het bestand bleef op je eigen computer." })
  }

  const reads = Object.values(tab.cells).some((x) => x.v.includes("INSYTE("))

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
            reads ? " · leest cijfers uit Insyte" : ""
          }`}
          actions={
            <>
              <Button icon={<Download />} onClick={exportCsv}>Exporteren</Button>
              {canEdit && (
                <DropdownMenu
                  label="Meer acties"
                  placement="bottom-end"
                  trigger={(props) => (
                    <IconButton label="Meer acties" tone="outline" {...props}>
                      <MoreHorizontal />
                    </IconButton>
                  )}
                >
                  <DropdownItem glyph={Edit} onSelect={() => setRenaming(true)}>Naam wijzigen</DropdownItem>
                  <DropdownItem
                    glyph={Pin}
                    onSelect={() => {
                      patchSheet(sheet.id, { pinned: !sheet.pinned })
                      toast({ title: sheet.pinned ? "Losgemaakt" : "Vastgezet" })
                    }}
                  >
                    {sheet.pinned ? "Losmaken" : "Vastzetten"}
                  </DropdownItem>
                  <DropdownItem
                    glyph={Archive}
                    onSelect={() => {
                      patchSheet(sheet.id, { archived: !sheet.archived })
                      toast({
                        title: sheet.archived ? "Teruggezet" : "Gearchiveerd",
                        action: {
                          label: "Ongedaan maken",
                          onClick: () => patchSheet(sheet.id, { archived: sheet.archived })
                        }
                      })
                    }}
                  >
                    {sheet.archived ? "Terugzetten" : "Archiveren"}
                  </DropdownItem>
                </DropdownMenu>
              )}
            </>
          }
        />
        {!canEdit && <ReadOnlyNotice area="analytics" />}
      </div>

      <div className="flex min-w-0 flex-col gap-3">
        {canEdit && (
          <div role="toolbar" aria-label="Opmaak" className="flex flex-wrap items-center gap-1 rounded-md bg-well p-1">
            <IconButton label="Ongedaan maken" size="sm" onClick={undo} disabled={past.current.length === 0}>
              <Undo />
            </IconButton>
            <IconButton label="Opnieuw" size="sm" onClick={redo} disabled={future.current.length === 0}>
              <Redo />
            </IconButton>
            <span className="mx-1 h-4 w-px bg-line-strong" aria-hidden="true" />
            <IconButton
              label="Vet"
              size="sm"
              pressed={cell?.bold === true}
              onClick={() =>
                write({ [selected]: { ...cell, v: cell?.v ?? "", bold: cell?.bold !== true } })}
            >
              <Bold />
            </IconButton>
            <IconButton label="Optellen wat erboven staat" size="sm" onClick={sumHere}>
              <Sigma />
            </IconButton>
            <Select
              aria-label="Opmaak van de cel"
              value={cell?.fmt ?? ""}
              onChange={(event) =>
                write({
                  [selected]: {
                    ...cell,
                    v: cell?.v ?? "",
                    ...(event.target.value === "" ? { fmt: undefined } : { fmt: event.target.value as Fmt })
                  }
                })}
              className="h-7 w-44 text-xs"
            >
              {FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </Select>
            <Popover
              label="Insyte-cijfer"
              trigger={(props) => (
                <Button size="sm" variant="ghost" icon={<Sparkle />} {...props}>Insyte-cijfer</Button>
              )}
            >
              {(close) => (
                <FigurePicker
                  onPick={(formula, fmt) => {
                    write({ [selected]: { v: formula, fmt } })
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
            className="figure flex h-8 w-14 shrink-0 items-center justify-center rounded-sm bg-well text-xs font-medium text-ink-2"
            aria-label="Geselecteerde cel"
          >
            {selected}
          </span>
          <Input
            id={barId}
            aria-label={`Inhoud van ${selected}`}
            value={raw}
            readOnly={!canEdit}
            placeholder={canEdit ? "Een waarde, of een formule na =" : ""}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                commit([0, 1])
              }
              if (event.key === "Tab") {
                event.preventDefault()
                commit([1, 0])
              }
              if (event.key === "Escape") {
                setDraft(null)
                grid.current?.focus()
              }
            }}
            onBlur={() => draft !== null && commit(null)}
          />
        </div>
        <p className="min-h-5 text-xs text-pretty" aria-live="polite">
          {value !== undefined && isError(value)
            ? (
              <span className="text-bad-ink">
                <span className="font-medium">{value.error}</span> · {value.why}
              </span>
            )
            : cell?.v.includes("INSYTE(")
            ? (
              <span className="text-ink-3">
                Hetzelfde cijfer als in{" "}
                <Link to={paths.costs} className="underline underline-offset-2 hover:text-ink">Kosten</Link>{" "}
                en Analyse, en het blijft bij.
              </span>
            )
            : cell?.v.startsWith("=")
            ? <span className="text-ink-3">Uitkomst: {show(value, cell.fmt)}</span>
            : null}
        </p>

        <div
          ref={grid}
          role="grid"
          aria-label={`${sheet.title}, tabblad ${tab.name}`}
          aria-readonly={!canEdit}
          tabIndex={0}
          onKeyDown={onGridKey}
          className="pane-scroll overflow-x-auto rounded-md ring-1 ring-line focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          <table className="border-collapse text-sm" style={{ minWidth: "100%" }}>
            <thead>
              <tr>
                <th className="sticky left-0 z-10 w-10 bg-panel" aria-hidden="true" />
                {Array.from({ length: cols }, (_, c) => (
                  <th
                    key={c}
                    scope="col"
                    className={cx(
                      "h-7 bg-panel px-2 text-center text-2xs font-medium",
                      COLUMNS.indexOf(selected[0] ?? "") === c ? "text-ink" : "text-ink-3"
                    )}
                    style={{ minWidth: tab.widths[COLUMNS[c] ?? ""] ?? 104 }}
                  >
                    {COLUMNS[c]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rows }, (_, r) => (
                <tr key={r}>
                  <th
                    scope="row"
                    className={cx(
                      "figure sticky left-0 z-10 h-8 w-10 bg-panel text-center text-2xs font-medium",
                      Number(selected.slice(1)) === r + 1 ? "text-ink" : "text-ink-3"
                    )}
                  >
                    {r + 1}
                  </th>
                  {Array.from({ length: cols }, (_x, c) => {
                    const key = addr(c, r)
                    const x = tab.cells[key]
                    const v = values[key]
                    const isNum = typeof v === "number"
                    const on = key === selected
                    return (
                      <td
                        key={key}
                        role="gridcell"
                        aria-selected={on}
                        onClick={() => {
                          if (draft !== null) commit(null)
                          setSelected(key)
                          grid.current?.focus()
                        }}
                        onDoubleClick={() => {
                          if (!canEdit) return
                          setDraft(x?.v ?? "")
                          bar.current?.focus()
                        }}
                        className={cx(
                          "h-8 max-w-[18rem] cursor-cell truncate border-t border-l border-line px-2 whitespace-nowrap",
                          isNum || (v !== undefined && isError(v)) ? "figure text-right" : "text-left",
                          x?.bold === true ? "font-semibold text-ink" : "text-ink-2",
                          v !== undefined && isError(v) && "text-bad-ink",
                          on && "relative bg-accent-tint outline-2 -outline-offset-2 outline-accent"
                        )}
                      >
                        {show(v, x?.fmt)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="Tabbladen">
          {sheet.tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={t.id === tab.id}
              onClick={() => {
                setQuery({ tab: t.id === sheet.tabs[0]?.id ? null : t.id })
                setSelected("A1")
              }}
              className={cx(
                "h-8 rounded-sm px-3 text-sm pointer-coarse:h-11",
                t.id === tab.id ? "bg-selected font-medium text-ink" : "text-ink-3 hover:bg-hover hover:text-ink"
              )}
            >
              {t.name}
            </button>
          ))}
          {canEdit && (
            <IconButton
              label="Tabblad toevoegen"
              size="sm"
              onClick={() => {
                const next = tabFrom(`tab-${crypto.randomUUID().slice(0, 8)}`, `Blad ${sheet.tabs.length + 1}`, [])
                remember()
                setTabs(sheet.id, [...sheet.tabs, next])
                setQuery({ tab: next.id })
                setSelected("A1")
              }}
            >
              <Plus />
            </IconButton>
          )}
          <span className="ml-auto text-xs text-ink-3">
            Formules: SOM, GEMIDDELDE, MIN, MAX, AANTAL en INSYTE, met ; tussen de delen.
          </span>
        </div>
      </div>

      <RenameDialog sheet={sheet} open={renaming} onClose={() => setRenaming(false)} />
    </Page>
  )
}

/** The figures a cell can read, and for which day: the formula it writes is plain text you can edit. */
function FigurePicker({ onPick }: { readonly onPick: (formula: string, fmt: Fmt) => void }) {
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
