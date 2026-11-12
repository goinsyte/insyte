import { useNavigate, useSearch } from "@tanstack/react-router"
import { useCallback, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "../../components/dropdown-menu"
import {
  Archive,
  Copy,
  Folder,
  LayoutGrid,
  List,
  MoreHorizontal,
  Pin,
  PinOff,
  Plus,
  RotateCcw,
  Search,
  Sparkle,
  Trash2,
  Upload,
  Users
} from "../../icons"
import { EmptyPage } from "../common/empty-page"
import { EmptyState } from "../common/empty-state"
import { Field, FormDialog, TextField } from "../common/form-dialog"
import { PageGuide } from "../common/page-guide"
import { PageHeader } from "../common/page-header"
import { ME } from "../lib/assignees"
import { formatRelative } from "../lib/format"
import { type TemplateId, TEMPLATES } from "../lib/sheet-templates"
import { addr, display, evaluator, fromCsv, isErr, type Sheet, type Tab } from "../lib/sheets"
import { undoable } from "../lib/undo"
import { cn } from "../lib/utils"
import { useOnCreate } from "../stores/create-intent"
import { useSheets } from "../stores/sheets-store"
import { useWorkspace } from "../stores/workspace-store"
import { PersonDisc } from "../team/bits"
import { SHEET_CURRENCY, useFigures } from "./figures"

export type SheetsSearch = { view?: string; folder?: string }

const GUIDE = [
  {
    title: "Rekenen op je eigen cijfers",
    body:
      "Een cel kan een cijfer uit Insyte lezen: omzet, advertenties, nettowinst. Het is hetzelfde getal als in Analyse en het blijft bij.",
    art: "chart"
  },
  {
    title: "Formules zoals je ze kent",
    body: "=SOM, =GEMIDDELDE, =ALS, met een puntkomma tussen de delen. Gaat er iets mis, dan staat erbij waarom.",
    art: "rules"
  }
] as const

const linked = (s: Sheet) => s.tabs.some((t) => Object.values(t.cells).some((c) => /INSYTE\(/i.test(c.v)))

/**
 * Rekenbladen (`/sheets`, PLAN 40). The area panel cuts the list: everything, pinned, recent, shared
 * with you, a folder, the archive. A sheet shows its own first cells as its preview, computed, so
 * the list says what is in each one without opening it.
 */
export function SheetsPage() {
  const { view, folder } = useSearch({ strict: false }) as SheetsSearch
  const navigate = useNavigate()
  const all = useSheets((s) => s.sheets)
  const folders = useSheets((s) => s.folders)
  const [q, setQ] = useState("")
  const [layout, setLayout] = useState<"grid" | "list">("grid")
  const [creating, setCreating] = useState<TemplateId | null>(null)
  const file = useRef<HTMLInputElement>(null)
  useOnCreate("sheet", useCallback(() => setCreating("profit"), []))

  const shown = useMemo(() => {
    let xs = all.filter((s) => (view === "archive" ? s.archived : !s.archived))
    if (view === "pinned") xs = xs.filter((s) => s.pinned)
    if (view === "shared") xs = xs.filter((s) => s.ownerId !== ME && s.shared.includes(ME))
    if (folder) xs = xs.filter((s) => s.folderId === folder)
    if (view === "recent") xs = [...xs].sort((a, b) => (b.openedAt ?? "").localeCompare(a.openedAt ?? "")).slice(0, 8)
    else xs = [...xs].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt))
    if (q.trim()) xs = xs.filter((s) => s.title.toLowerCase().includes(q.trim().toLowerCase()))
    return xs
  }, [all, view, folder, q])

  const folderName = folders.find((f) => f.id === folder)?.name
  const title = folderName ??
    { pinned: "Vastgezet", recent: "Recent", shared: "Gedeeld met mij", archive: "Archief" }[view ?? ""] ??
    "Rekenbladen"
  const open = (s: Sheet) => void navigate({ to: "/sheets/$sheetId", params: { sheetId: s.id } })

  const importFile = (f: File | undefined) => {
    if (!f) return
    if (!/\.(csv|tsv|txt)$/i.test(f.name)) {
      return void toast("Dat is geen CSV", { description: "Exporteer het blad als CSV en kies dat bestand." })
    }
    const r = new FileReader()
    r.onload = () => {
      const rows = fromCsv(String(r.result))
      if (!rows.length) return void toast("Het bestand is leeg")
      const s = useSheets.getState().importRows(f.name.replace(/\.\w+$/, ""), rows, ME)
      undoable(
        `“${s.title}” geïmporteerd`,
        useSheets.getState().remove([s.id]),
        `${rows.length} rijen. Alles boven 40 rijen of 12 kolommen is weggelaten.`
      )
      open(s)
    }
    r.readAsText(f)
  }

  const actions = (
    <>
      <button
        type="button"
        onClick={() => file.current?.click()}
        className="field flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-ink text-sm transition-colors hover:field-hover"
      >
        <Upload className="size-3.5" strokeWidth={1.75} />
        CSV importeren
      </button>
      <button
        type="button"
        onClick={() => setCreating("profit")}
        className="flex h-8 items-center gap-1.5 rounded-md bg-abyss px-3 font-medium text-mesh-ink text-sm shadow-primary transition-colors hover:bg-abyss-2"
      >
        <Plus className="size-3.5" strokeWidth={2} />
        Nieuw rekenblad
      </button>
      <input
        ref={file}
        type="file"
        accept=".csv,.tsv,.txt,text/csv"
        className="hidden"
        onChange={(e) => importFile(e.target.files?.[0])}
      />
    </>
  )

  if (all.length === 0) {
    return (
      <div className="flex min-w-0 flex-col">
        <PageHeader title="Rekenbladen" actions={actions} />
        <EmptyPage
          kind="sheets"
          count="0 rekenbladen"
          title="Nog geen rekenbladen"
          body="Reken op je eigen cijfers zonder ze over te typen. Een cel leest omzet, advertenties of nettowinst uit Insyte en blijft bij, net als in Analyse."
          action={{ label: "Winst per maand maken", onClick: () => setCreating("profit") }}
          secondary={{ label: "Leeg rekenblad", onClick: () => setCreating("blank") }}
          starts={[{
            id: "costs",
            label: "Eerst je kosten invullen",
            body: "Dan rekent Insyte de nettowinst voor je uit.",
            to: "/costs"
          }]}
        />
        <NewSheetDialog value={creating} onClose={() => setCreating(null)} onCreated={open} />
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        title={title}
        crumbs={view || folder ? [{ label: "Rekenbladen", to: "/sheets" }] : []}
        meta={`${shown.length} ${shown.length === 1 ? "blad" : "bladen"}`}
        actions={actions}
      />
      <div className="flex min-w-0 flex-col gap-8 px-5 pb-12">
        {!view && !folder && !q ?
          (
            <section aria-labelledby="h-templates" className="flex flex-col gap-3">
              <h2 id="h-templates" className="font-medium text-base text-ink">
                Begin met een sjabloon
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setCreating(t.id)}
                    className="group/t flex items-stretch gap-3 rounded-xl bg-paper p-3 text-left shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--ink)_9%,transparent)] transition-colors hover:bg-arc-tint/50"
                  >
                    <TemplateMark id={t.id} />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-medium text-ink text-sm">{t.title}</span>
                      <span className="line-clamp-2 text-ink-3 text-xs leading-[1.45]">{t.body}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ) :
          null}

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="field flex h-8 w-full max-w-[280px] items-center gap-2 rounded-md px-2.5 focus-within:bg-paper">
              <Search className="size-3.5 text-ink-3" strokeWidth={1.75} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Rekenbladen zoeken"
                aria-label="Rekenbladen zoeken"
                className="min-w-0 flex-1 bg-transparent text-ink text-sm outline-none placeholder:text-ink-3"
              />
            </label>
            <span className="flex-1" />
            <div
              role="radiogroup"
              aria-label="Weergave"
              className="flex h-8 items-center gap-0.5 rounded-md bg-ink/5 p-0.5"
            >
              {(
                [
                  ["grid", LayoutGrid, "Tegels"],
                  ["list", List, "Lijst"]
                ] as const
              ).map(([id, G, label]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={layout === id}
                  aria-label={label}
                  title={label}
                  onClick={() => setLayout(id)}
                  className={cn(
                    "flex size-7 items-center justify-center rounded transition-colors",
                    layout === id ? "bg-paper text-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)]" : "text-ink-3 hover:text-ink"
                  )}
                >
                  <G className="size-3.5" strokeWidth={1.75} />
                </button>
              ))}
            </div>
          </div>
          {shown.length === 0 ?
            (
              <EmptyState
                kind="sheets"
                title={q
                  ? "Geen rekenbladen met die naam."
                  : view === "archive"
                  ? "Het archief is leeg."
                  : view === "shared"
                  ? "Niemand heeft nog een blad met je gedeeld."
                  : "Hier staat nog niets."}
                body={q
                  ? "Zoek op een ander woord."
                  : "Gearchiveerde bladen blijven hier staan tot je ze terugzet of verwijdert."}
              />
            ) :
            layout === "grid" ?
            (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {shown.map((s) => <SheetCard key={s.id} s={s} onOpen={() => open(s)} />)}
              </ul>
            ) :
            <SheetList sheets={shown} onOpen={open} />}
        </section>
      </div>
      <NewSheetDialog value={creating} onClose={() => setCreating(null)} onCreated={open} folderId={folder} />
      <PageGuide id="sheets" title="Rekenbladen" steps={GUIDE} />
    </div>
  )
}

/* ── a sheet, previewed ──────────────────────────────────────────────────────────────────────── */

/** The first rows and columns of a tab, computed, at a size that reads as a sheet and not as data. */
function Preview({ tab, rows = 5, cols = 3 }: { tab: Tab; rows?: number; cols?: number }) {
  const figures = useFigures()
  const ev = useMemo(() => evaluator({ tabs: [tab], figures }, tab.id), [tab, figures])
  return (
    <div
      aria-hidden
      className="grid overflow-hidden rounded-md bg-paper text-2xs leading-none"
      style={{ gridTemplateColumns: `1.4fr repeat(${cols - 1}, 1fr)` }}
    >
      {Array.from({ length: rows * cols }, (_, i) => {
        const r = Math.floor(i / cols)
        const c = i % cols
        const a = addr(c, r)
        const v = ev.value(a)
        const cell = tab.cells[a]
        const text = display(v, cell?.fmt, SHEET_CURRENCY, true)
        return (
          <span
            key={a}
            className={cn(
              "truncate px-1.5 py-1",
              r === 0 ? "bg-mist font-medium text-ink-2" : r % 2 ? "text-ink-2" : "bg-mist/50 text-ink-2",
              typeof v === "number" && "text-right tabular-nums",
              isErr(v) && "text-signal-red"
            )}
          >
            {text || " "}
          </span>
        )
      })}
    </div>
  )
}

function SheetCard({ s, onOpen }: { s: Sheet; onOpen: () => void }) {
  const owner = useWorkspace((st) => st.members.find((m) => m.id === s.ownerId))
  return (
    <li className="group/card relative flex flex-col overflow-hidden rounded-xl bg-paper shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--ink)_9%,transparent)] transition-shadow hover:shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--ink)_16%,transparent),0_6px_18px_-10px_rgb(0_0_0/0.18)]">
      <button type="button" onClick={onOpen} className="flex flex-col text-left" aria-label={`${s.title} openen`}>
        <span className="block bg-mist p-3 pb-0">
          <span className="block overflow-hidden rounded-t-md shadow-[0_0_0_1px_color-mix(in_oklch,var(--ink)_7%,transparent)]">
            {s.tabs[0] ? <Preview tab={s.tabs[0]} /> : null}
          </span>
        </span>
        <span className="flex flex-col gap-1.5 px-3.5 pt-3 pb-3">
          <span className="flex items-center gap-1.5">
            {s.pinned ? <Pin className="size-3.5 shrink-0 text-ink-3" strokeWidth={1.75} /> : null}
            <span className="truncate font-medium text-base text-ink">{s.title}</span>
          </span>
          <span className="flex items-center gap-2 text-ink-3 text-xs">
            <PersonDisc seed={s.ownerId} name={owner?.name ?? "?"} size={18} />
            <span className="truncate">Bewerkt {formatRelative(s.updatedAt)}</span>
            {linked(s) ?
              (
                <span className="ml-auto flex h-5 shrink-0 items-center gap-1 rounded-full bg-arc-tint px-1.5 font-medium text-arc-ink">
                  <Sparkle className="size-3" strokeWidth={1.75} />
                  Insyte
                </span>
              ) :
              null}
          </span>
        </span>
      </button>
      <span className="absolute top-2 right-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover/card:opacity-100">
        <SheetMenu s={s} />
      </span>
    </li>
  )
}

function SheetList({ sheets, onOpen }: { sheets: Sheet[]; onOpen: (s: Sheet) => void }) {
  const members = useWorkspace((s) => s.members)
  const folders = useSheets((s) => s.folders)
  return (
    <div className="table-scroll overflow-hidden rounded-xl bg-paper shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--ink)_9%,transparent)]">
      <div className="grid min-w-[640px] grid-cols-[minmax(0,1fr)_140px_160px_120px_32px] gap-3 bg-mist px-3 py-2 font-medium text-ink-3 text-xs">
        <span>Naam</span>
        <span>Map</span>
        <span>Eigenaar</span>
        <span>Bewerkt</span>
        <span />
      </div>
      {sheets.map((s) => {
        const owner = members.find((m) => m.id === s.ownerId)
        return (
          <div
            key={s.id}
            className="grid min-w-[640px] cursor-pointer grid-cols-[minmax(0,1fr)_140px_160px_120px_32px] items-center gap-3 px-3 py-2 text-ink-2 text-sm transition-colors odd:bg-paper even:bg-mist/50 hover:bg-arc-tint/50"
            onClick={() => onOpen(s)}
          >
            <span className="flex min-w-0 items-center gap-2">
              {s.pinned ? <Pin className="size-3.5 shrink-0 text-ink-3" strokeWidth={1.75} /> : null}
              <span className="truncate font-medium text-ink">{s.title}</span>
              {linked(s)
                ? <span className="rounded-full bg-arc-tint px-1.5 font-medium text-arc-ink text-xs">Insyte</span>
                : null}
            </span>
            <span className="truncate">{folders.find((f) => f.id === s.folderId)?.name ?? "—"}</span>
            <span className="flex min-w-0 items-center gap-2">
              <PersonDisc seed={s.ownerId} name={owner?.name ?? "?"} size={20} />
              <span className="truncate">{owner?.name ?? "—"}</span>
            </span>
            <span className="tabular-nums">{formatRelative(s.updatedAt)}</span>
            <span
              onClick={(e) => e.stopPropagation()}
            >
              <SheetMenu s={s} />
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function SheetMenu({ s, onGone }: { s: Sheet; onGone?: () => void }) {
  const navigate = useNavigate()
  const folders = useSheets((st) => st.folders)
  const members = useWorkspace((st) => st.members)
  const store = useSheets.getState
  const mine = s.ownerId === ME
  const [folderDialog, setFolderDialog] = useState(false)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Opties voor ${s.title}`}
            className="flex size-8 items-center justify-center rounded-md bg-paper/80 text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink"
          >
            <MoreHorizontal className="size-4" strokeWidth={1.75} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            onClick={() =>
              undoable(s.pinned ? "Losgemaakt" : "Vastgezet", store().patch([s.id], { pinned: !s.pinned }))}
          >
            {s.pinned
              ? <PinOff className="size-3.5" strokeWidth={1.75} />
              : <Pin className="size-3.5" strokeWidth={1.75} />}
            {s.pinned ? "Losmaken" : "Vastzetten"}
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Folder className="size-3.5" strokeWidth={1.75} />
              Verplaatsen naar map
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-48">
              <DropdownMenuItem
                onClick={() => undoable("Uit de map gehaald", store().patch([s.id], { folderId: undefined }))}
              >
                Geen map
              </DropdownMenuItem>
              {folders.map((f) => (
                <DropdownMenuItem
                  key={f.id}
                  onClick={() => undoable(`Naar ${f.name}`, store().patch([s.id], { folderId: f.id }))}
                >
                  {f.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setFolderDialog(true)}>
                <Plus className="size-3.5" strokeWidth={1.75} />
                Nieuwe map
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          {mine ?
            (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Users className="size-3.5" strokeWidth={1.75} />
                  Delen
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-56">
                  {members
                    .filter((m) => m.id !== ME && m.status === "active")
                    .map((m) => {
                      const on = s.shared.includes(m.id)
                      return (
                        <DropdownMenuItem
                          key={m.id}
                          onClick={() =>
                            undoable(
                              on
                                ? `Niet meer gedeeld met ${m.name.split(" ")[0]}`
                                : `Gedeeld met ${m.name.split(" ")[0]}`,
                              store().patch([s.id], {
                                shared: on
                                  ? s.shared.filter((x) => x !== m.id)
                                  : [...s.shared, m.id]
                              }),
                              on ? undefined : "Kan bekijken en bewerken."
                            )}
                        >
                          <PersonDisc seed={m.id} name={m.name} size={18} />
                          <span className="flex-1 truncate">{m.name}</span>
                          {on ? <span className="text-arc-ink text-xs">Gedeeld</span> : null}
                        </DropdownMenuItem>
                      )
                    })}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ) :
            null}
          <DropdownMenuItem
            onClick={() => {
              const c = store().duplicate(s.id, ME)
              if (c) {
                undoable(`“${c.title}” gemaakt`, store().remove([c.id]))
                void navigate({ to: "/sheets/$sheetId", params: { sheetId: c.id } })
              }
            }}
          >
            <Copy className="size-3.5" strokeWidth={1.75} />
            Dupliceren
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {s.archived ?
            (
              <DropdownMenuItem
                onClick={() => undoable(`“${s.title}” teruggezet`, store().patch([s.id], { archived: false }))}
              >
                <RotateCcw className="size-3.5" strokeWidth={1.75} />
                Terugzetten
              </DropdownMenuItem>
            ) :
            (
              <DropdownMenuItem
                onClick={() => {
                  undoable(`“${s.title}” gearchiveerd`, store().patch([s.id], { archived: true, pinned: false }))
                  onGone?.()
                }}
              >
                <Archive className="size-3.5" strokeWidth={1.75} />
                Archiveren
              </DropdownMenuItem>
            )}
          {mine ?
            (
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  undoable(`“${s.title}” verwijderd`, store().remove([s.id]))
                  onGone?.()
                }}
              >
                <Trash2 className="size-3.5" strokeWidth={1.75} />
                Verwijderen
              </DropdownMenuItem>
            ) :
            null}
        </DropdownMenuContent>
      </DropdownMenu>
      <FolderDialog
        open={folderDialog}
        onClose={() => setFolderDialog(false)}
        onMade={(id) => undoable("Map gemaakt", store().patch([s.id], { folderId: id }))}
      />
    </>
  )
}

export function FolderDialog(
  { open, onClose, onMade }: { open: boolean; onClose: () => void; onMade?: (id: string) => void }
) {
  const [name, setName] = useState("")
  return (
    <FormDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setName("")
          onClose()
        }
      }}
      title="Nieuwe map"
      primaryLabel="Map maken"
      disabled={!name.trim()}
      width={420}
      onSubmit={() => {
        const { id } = useSheets.getState().addFolder(name.trim())
        onMade?.(id)
        setName("")
        onClose()
      }}
    >
      <Field label="Naam">
        <TextField value={name} onChange={setName} placeholder="Bijvoorbeeld: Financiën" />
      </Field>
    </FormDialog>
  )
}

/* ── making one ───────────────────────────────────────────────────────────────────────────── */

/**
 * A template's mark: the shape of the sheet, not its text — label bars down the left, figures to
 * the right, and an Arc square on each cell that reads Insyte, which is the point of the template.
 */
function TemplateMark({ id }: { id: TemplateId }) {
  if (id === "blank") return <span aria-hidden className="hatch block h-16 w-24 shrink-0 rounded-md bg-mist" />
  const cols = id === "profit" ? [1, 1, 0.6, 1] : [1, 0.6, 1, 0.6]
  return (
    <span
      aria-hidden
      className="grid h-16 w-24 shrink-0 grid-cols-[1.2fr_repeat(4,1fr)] content-start gap-x-1 gap-y-1.5 rounded-md bg-mist p-2"
    >
      {Array.from({ length: 5 * 4 }, (_, i) => {
        const r = Math.floor(i / 5)
        const c = i % 5
        if (c === 0) {
          return (
            <span
              key={i}
              className={cn("h-1.5 rounded-sm", r === 0 ? "bg-ink/25" : "bg-ink/12")}
              style={{ width: `${60 + ((r * 13) % 35)}%` }}
            />
          )
        }
        const linkedCell = r > 0 && cols[c - 1] === 1
        return (
          <span key={i} className="relative flex h-1.5 justify-end">
            <span
              className={cn("h-full rounded-sm", r === 0 ? "bg-ink/25" : "bg-ink/12")}
              style={{ width: `${55 + ((r * 7 + c * 11) % 40)}%` }}
            />
            {linkedCell ? <span className="absolute -top-0.5 -right-1 size-1 bg-arc" /> : null}
          </span>
        )
      })}
    </span>
  )
}

function NewSheetDialog(
  { value, onClose, onCreated, folderId }: {
    value: TemplateId | null
    onClose: () => void
    onCreated: (s: Sheet) => void
    folderId?: string
  }
) {
  const folders = useSheets((s) => s.folders)
  const [pick, setPick] = useState<TemplateId | null>(null)
  const [title, setTitle] = useState("")
  const [folder, setFolder] = useState<string>("")
  const t = pick ?? value ?? "profit"
  const def = TEMPLATES.find((x) => x.id === t)!
  const close = () => {
    setPick(null)
    setTitle("")
    setFolder("")
    onClose()
  }
  return (
    <FormDialog
      open={value !== null}
      onOpenChange={(v) => !v && close()}
      title="Nieuw rekenblad"
      primaryLabel="Rekenblad maken"
      width={560}
      onSubmit={() => {
        const s = useSheets.getState().create(
          title.trim() || (t === "blank" ? "Naamloos rekenblad" : def.title),
          t,
          ME,
          folder || folderId || undefined
        )
        close()
        onCreated(s)
      }}
    >
      <div role="radiogroup" aria-label="Sjabloon" className="grid grid-cols-3 gap-2">
        {TEMPLATES.map((x) => (
          <button
            key={x.id}
            type="button"
            role="radio"
            aria-checked={t === x.id}
            onClick={() => setPick(x.id)}
            className={cn(
              "flex flex-col gap-2 rounded-lg p-2 text-left transition-colors",
              t === x.id ? "bg-arc-tint" : "hover:bg-ink/5"
            )}
          >
            <TemplateMark id={x.id} />
            <span className={cn("font-medium text-sm", t === x.id ? "text-arc-ink" : "text-ink")}>{x.title}</span>
          </button>
        ))}
      </div>
      <p className="text-ink-2 text-sm">{def.body}</p>
      <div className="grid grid-cols-[minmax(0,1fr)_180px] gap-3">
        <Field label="Naam">
          <TextField value={title} onChange={setTitle} placeholder={t === "blank" ? "Naamloos rekenblad" : def.title} />
        </Field>
        <Field label="Map">
          <select
            value={folder || folderId || ""}
            onChange={(e) => setFolder(e.target.value)}
            className="field h-9 w-full rounded-md px-2.5 text-base text-ink outline-none focus:bg-paper"
          >
            <option value="">Geen map</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </FormDialog>
  )
}
