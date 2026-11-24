import { useMemo, useState } from "react"
import { BlockView } from "../charts/block-view.tsx"
import { formatValue } from "../charts/format.ts"
import { BLOCKS, BOARD_TEMPLATES, BOARDS, PERIOD } from "../fixtures/analytics.ts"
import type { Block, BlockId, BlockKind, Board, BoardTemplate, Placement, Width } from "../fixtures/analytics.ts"
import { DEMO_NOW, ME, TODAY } from "../fixtures/workspace.ts"
import { Link, navigate, paths, setQuery, useQuery } from "../router.tsx"
import { Denied, ReadOnlyNotice, useAccess } from "../ui/access.tsx"
import { Avatar } from "../ui/avatar.tsx"
import { Button, ButtonLink, IconButton } from "../ui/button.tsx"
import { RadioGroup } from "../ui/checkbox.tsx"
import { cx } from "../ui/cx.ts"
import { AlertDialog } from "../ui/dialog.tsx"
import { ArrowLeft, BarChart3, Check, Edit, Plus, RotateCcw, Trash, X } from "../ui/icons.tsx"
import { Field, Input } from "../ui/input.tsx"
import { Page, PageHead } from "../ui/page.tsx"
import { PeriodPicker } from "../ui/period.tsx"
import { Skeleton } from "../ui/skeleton.tsx"
import { EmptyState, ErrorState } from "../ui/states.tsx"
import { toast } from "../ui/toast.tsx"
import { Segmented } from "../ui/toggle.tsx"
import { dataState, setView, useView } from "../view.ts"
import { Ask } from "./analyse/ask.tsx"
import { ExplainDrawer } from "./analyse/drawer.tsx"
import { Findings } from "./analyse/findings.tsx"
import { blocksOf, contextOf } from "./analyse/model.ts"
import { periodQuery, TODAY_DATE, usePeriod } from "./analyse/period.ts"

/**
 * An Analyse board: the answer to "make it your own, but keep it consistent".
 *
 * What a person may change: which blocks, their order, and their width (one of four). What nobody
 * changes: the blocks' anatomy, the chart style, the colours, the height of a row. The period and
 * the comparison are chosen once for the whole board (in the address, `?periode=…&vergelijk=…`), so
 * every block, finding and answer on it agrees about the same days. So a board can be anything and
 * still look like Insyte.
 *
 * Every figure, point, bar and ranked row opens the explanation behind it (`?uitleg=…`): the drivers,
 * how it splits and the orders it counts. Above the blocks, what Magnus found in the period, each
 * with the proposal that acts on it, and a field to ask about the numbers.
 */

const SPAN: Record<Width, string> = {
  third: "col-span-12 md:col-span-6 xl:col-span-4",
  half: "col-span-12 md:col-span-6",
  "two-thirds": "col-span-12 xl:col-span-8",
  full: "col-span-12"
}

const WIDTHS: ReadonlyArray<{ value: Width; label: string }> = [
  { value: "third", label: "⅓" },
  { value: "half", label: "½" },
  { value: "two-thirds", label: "⅔" },
  { value: "full", label: "Vol" }
]

const KIND_LABEL: Record<BlockKind, string> = {
  figures: "Getallen",
  line: "Lijn",
  bar: "Staven",
  rank: "Ranglijst",
  funnel: "Trechter",
  table: "Tabel"
}

/** The width a block arrives at when added: what its form reads best at. */
const DEFAULT_WIDTH: Record<BlockKind, Width> = {
  figures: "full",
  line: "two-thirds",
  bar: "half",
  rank: "third",
  funnel: "half",
  table: "half"
}

const storageKey = (boardId: string) => `insyte:v2:board:${boardId}`

function load(boardId: string, fallback: ReadonlyArray<Placement>): ReadonlyArray<Placement> {
  try {
    const raw = window.localStorage.getItem(storageKey(boardId))
    if (raw === null) return fallback
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return fallback
    const valid = parsed.filter((p): p is Placement =>
      typeof p === "object" && p !== null && "block" in p && "width" in p && typeof p.block === "string" &&
      p.block in BLOCKS && WIDTHS.some((w) => w.value === p.width)
    )
    return valid.length > 0 ? valid : fallback
  } catch {
    return fallback
  }
}

function save(boardId: string, placements: ReadonlyArray<Placement> | null) {
  try {
    if (placements === null) window.localStorage.removeItem(storageKey(boardId))
    else window.localStorage.setItem(storageKey(boardId), JSON.stringify(placements))
  } catch {
    // Not remembered in this browser; the board still changes for this visit.
  }
}

/* ── boards a person made: kept in this browser, beside the workspace's own ─────────────────────── */

const CUSTOM_KEY = "insyte:v2:boards"

function loadCustom(): ReadonlyArray<Board> {
  try {
    const raw = window.localStorage.getItem(CUSTOM_KEY)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((b): b is Board =>
      typeof b === "object" && b !== null && "id" in b && "name" in b && "placements" in b &&
      typeof b.id === "string" && typeof b.name === "string" && Array.isArray(b.placements)
    )
  } catch {
    return []
  }
}

function saveCustom(boards: ReadonlyArray<Board>) {
  try {
    window.localStorage.setItem(CUSTOM_KEY, JSON.stringify(boards))
  } catch {
    // Not remembered in this browser; the board still opens for this visit.
  }
}

const findBoard = (id: string) => BOARDS.find((b) => b.id === id) ?? loadCustom().find((b) => b.id === id)

/**
 * `/v2/analyse/:boardId`, and its two pages that are not boards: `nieuw` (make one) and `sjablonen`
 * (start from a template). Analyse needs the analytics permission; a role that may read it but not
 * change it sees the boards without "Bord aanpassen".
 */
export function BoardScreen({ boardId }: { readonly boardId: string }) {
  const view = useView()
  const access = useAccess("analytics")
  const state = dataState(view)
  if (!access.view) {
    return (
      <Page>
        <PageHead title="Analyse" meta="Borden met de cijfers van de winkel, per week." />
        <Denied area="analytics" what="de borden van Analyse" />
      </Page>
    )
  }
  if (boardId === "nieuw") return <NewBoard canEdit={access.edit} />
  if (boardId === "sjablonen") return <Templates canEdit={access.edit} />
  if (state === "loading") return <BoardLoading />
  if (state === "error") return <BoardError />
  if (state === "empty") return <BoardEmpty />
  const board = findBoard(boardId)
  if (board === undefined) {
    return (
      <Page width="text">
        <h1 className="sr-only">Analyse</h1>
        <EmptyState
          glyph={BarChart3}
          title="Dit bord bestaat niet meer"
          action={<ButtonLink to={paths.board("week")}>Naar het Weekoverzicht</ButtonLink>}
        >
          Het is verwijderd of het adres klopt niet. Je borden staan in het menu van Analyse.
        </EmptyState>
      </Page>
    )
  }
  return <BoardView board={board} custom={!BOARDS.some((b) => b.id === board.id)} canEdit={access.edit} />
}

function BoardView({ board, custom, canEdit }: {
  readonly board: Board
  /** Made by a person in this browser: it can be deleted. */
  readonly custom: boolean
  readonly canEdit: boolean
}) {
  const fresh = useQuery("aanpassen") === "1"
  const [placements, setPlacements] = useState(() => load(board.id, board.placements))
  const [editing, setEditing] = useState(fresh && canEdit)
  const [adding, setAdding] = useState(fresh && canEdit && board.placements.length === 0)
  const [confirm, setConfirm] = useState(false)
  const [remove, setRemove] = useState(false)
  const period = usePeriod()
  // The period is rebuilt from the address on every render; its days and comparison are what count.
  const [from, to, compare] = [period.range.from.getTime(), period.range.to.getTime(), period.compare]
  const ctx = useMemo(
    () => contextOf({ preset: "", range: { from: new Date(from), to: new Date(to) }, compare }),
    [from, to, compare]
  )
  const blocks = blocksOf(ctx)
  const explaining = useExplainKey()

  const update = (next: ReadonlyArray<Placement>) => {
    setPlacements(next)
    save(board.id, next)
  }
  const move = (i: number, by: -1 | 1) => {
    const j = i + by
    if (j < 0 || j >= placements.length) return
    const next = [...placements]
    const [item] = next.splice(i, 1)
    if (item !== undefined) next.splice(j, 0, item)
    update(next)
  }
  const onBoard: ReadonlySet<BlockId> = new Set(placements.map((p) => p.block))
  const available = (Object.values(BLOCKS) as ReadonlyArray<Block>).filter((block) => !onBoard.has(block.id as BlockId))

  return (
    <div className="pane-scroll flex-1">
      <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-8 px-4 py-6 sm:px-8 sm:py-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-xl font-semibold text-ink">{board.name}</h1>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
              <span className="flex items-center gap-1.5">
                <Avatar name={board.owner} size={16} />
                Van {board.owner}
              </span>
              <Link to={paths.live} className="hover:text-ink">
                Vandaag tot {DEMO_NOW.clock}:{" "}
                <span className="figure text-ink-2">{formatValue(TODAY.revenue, "euro")}</span> uit{" "}
                <span className="figure text-ink-2">{TODAY.orders}</span> bestellingen
              </Link>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!editing && (
              <span className="flex items-center gap-2">
                <PeriodPicker value={period} onChange={(next) => setQuery(periodQuery(next))} today={TODAY_DATE} />
                {ctx.cmpLabel !== "" && <span className="figure text-xs text-ink-3">tegen {ctx.cmpLabel}</span>}
              </span>
            )}
            {editing
              ? (
                <>
                  {custom
                    ? (
                      <Button variant="ghost" size="sm" icon={<Trash />} onClick={() => setRemove(true)}>
                        Bord verwijderen
                      </Button>
                    )
                    : (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<RotateCcw />}
                        onClick={() => setConfirm(true)}
                      >
                        Herstellen
                      </Button>
                    )}
                  <Button size="sm" icon={<Plus />} onClick={() => setAdding(!adding)} aria-expanded={adding}>
                    Blok toevoegen
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<Check />}
                    onClick={() => {
                      setEditing(false)
                      setAdding(false)
                    }}
                  >
                    Klaar
                  </Button>
                </>
              )
              : canEdit && <Button size="sm" icon={<Edit />} onClick={() => setEditing(true)}>Bord aanpassen</Button>}
          </div>
        </header>

        <AlertDialog
          open={confirm}
          title="Bord herstellen?"
          body={`${board.name} krijgt weer de blokken, volgorde en breedtes waarmee het begon. Wat je toevoegde of verschoof, gaat verloren.`}
          confirmLabel="Bord herstellen"
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            save(board.id, null)
            setPlacements(board.placements)
            setConfirm(false)
          }}
        />

        <AlertDialog
          open={remove}
          title="Bord verwijderen?"
          body={`${board.name} verdwijnt voor iedereen in deze browser. De cijfers zelf blijven gewoon in Analyse.`}
          confirmLabel="Bord verwijderen"
          onCancel={() => setRemove(false)}
          onConfirm={() => {
            saveCustom(loadCustom().filter((b) => b.id !== board.id))
            save(board.id, null)
            setRemove(false)
            toast({ title: `${board.name} verwijderd`, tone: "good" })
            navigate(paths.board("week"))
          }}
        />

        {!canEdit && <ReadOnlyNotice area="analytics" />}

        {editing && placements.length === 0 && !adding && (
          <EmptyState
            glyph={BarChart3}
            size="sm"
            title="Nog geen blokken op dit bord"
            action={<Button size="sm" icon={<Plus />} onClick={() => setAdding(true)}>Blok toevoegen</Button>}
          >
            Kies welke vragen dit bord beantwoordt. Elk blok heeft dezelfde periode en dezelfde vorm.
          </EmptyState>
        )}

        {editing && (
          <p className="text-xs text-ink-3">
            Kies welke blokken erop staan, hun volgorde en hun breedte. Vorm, kleuren en periode zijn voor elk blok
            gelijk, zodat alles wat je combineert bij elkaar past.
          </p>
        )}

        {adding && (
          <section aria-label="Blok toevoegen" className="animate-rise rounded-lg bg-panel p-4">
            {available.length === 0
              ? <p className="text-sm text-ink-3">Alle blokken staan al op dit bord.</p>
              : (
                <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {available.map((block) => (
                    <li key={block.id}>
                      <button
                        type="button"
                        onClick={() => {
                          update([...placements, { block: block.id as BlockId, width: DEFAULT_WIDTH[block.kind] }])
                          setAdding(false)
                        }}
                        className="flex w-full items-center gap-3 rounded-md bg-canvas px-3 py-2.5 text-left hover:bg-hover"
                      >
                        <span className="w-16 shrink-0 text-2xs font-medium text-ink-3">{KIND_LABEL[block.kind]}</span>
                        <span className="min-w-0 flex-1 truncate text-sm text-ink">{block.title}</span>
                        <Plus size={15} className="shrink-0 text-ink-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
          </section>
        )}

        {!editing && ctx.empty && (
          <EmptyState
            glyph={BarChart3}
            size="sm"
            title={`Nog geen cijfers voor ${ctx.label}`}
            action={
              <Button size="sm" onClick={() => setQuery({ periode: null, van: null, tot: null })}>
                Naar vorige week
              </Button>
            }
          >
            Northwind verkoopt sinds 3 februari 2025. Kies een periode vanaf die dag.
          </EmptyState>
        )}

        {!editing && !ctx.empty && placements.length > 0 && (
          <>
            <Ask key={`${ctx.label}:${ctx.cmpLabel}`} ctx={ctx} onExplain={explainIt} />
            <Findings ctx={ctx} onBoard={onBoard} onExplain={explainIt} canEdit={canEdit} />
          </>
        )}

        <div className={cx("grid grid-cols-12 gap-y-14 md:gap-x-10 xl:gap-x-12", ctx.empty && !editing && "hidden")}>
          {placements.map((placement, i) => {
            const block: Block = blocks[placement.block]
            return (
              <div
                key={placement.block}
                className={cx(
                  SPAN[placement.width],
                  "min-w-0",
                  // While arranging, each block shows its bounds; at rest the space between them does.
                  editing && "rounded-lg outline-1 outline-offset-8 outline-line-strong outline-dashed"
                )}
              >
                <BlockView
                  block={block}
                  size={placement.block === board.lead ? "lead" : "normal"}
                  compareLabel="was"
                  compare={ctx.cmp !== null}
                  keyLabels={KEY_LABELS[ctx.compare]}
                  onAsk={(title) => navigate(paths.newChat(`${title} (${ctx.label})`))}
                  {...(editing || !PICKABLE.has(block.kind)
                    ? {}
                    : {
                      onPick: (index: number) =>
                        explainIt(`${block.kind === "figures" ? "f" : "i"}.${block.id}.${index}`)
                    })}
                  actions={editing && (
                    <span className="flex shrink-0 items-center gap-0.5">
                      <span className="mr-1 hidden sm:inline-flex">
                        <Segmented
                          size="sm"
                          label={`Breedte van ${block.title}`}
                          value={placement.width}
                          options={WIDTHS}
                          onChange={(width) => update(placements.map((p, k) => (k === i ? { ...p, width } : p)))}
                        />
                      </span>
                      <IconButton label="Naar voren" size="sm" disabled={i === 0} onClick={() => move(i, -1)}>
                        <ArrowLeft />
                      </IconButton>
                      <IconButton
                        label="Naar achteren"
                        size="sm"
                        disabled={i === placements.length - 1}
                        onClick={() => move(i, 1)}
                      >
                        <ArrowLeft className="rotate-180" />
                      </IconButton>
                      <IconButton
                        label={`${block.title} weghalen`}
                        size="sm"
                        onClick={() => update(placements.filter((_, k) => k !== i))}
                      >
                        <X />
                      </IconButton>
                    </span>
                  )}
                />
              </div>
            )
          })}
        </div>
        <ExplainDrawer ctx={ctx} explainKey={explaining} onClose={() => setQuery({ uitleg: null, dag: null })} />
      </div>
    </div>
  )
}

/** Opens the explanation behind a figure, a point, a bar or a row, in the address. */
const explainIt = (key: string) => setQuery({ uitleg: key, dag: null })

/* ── what opens an explanation ──────────────────────────────────────────────────────────────────── */

/** The forms whose figures, points, bars and rows open an explanation; a funnel and a table do not. */
const PICKABLE: ReadonlySet<BlockKind> = new Set<BlockKind>(["figures", "line", "bar", "rank"])

/** The key's names for the period before, by what the board compares with. */
const KEY_LABELS = {
  periode: { current: "Deze periode", compare: "Periode ervoor" },
  jaar: { current: "Deze periode", compare: "Vorig jaar" },
  geen: { current: "Deze periode", compare: "" }
} as const

/**
 * The explanation the address names: `?uitleg=i.omzetPerDag.4`. An older link to one day's orders
 * (`?dag=4`, Monday 0) opens that day of "Omzet per dag".
 */
function useExplainKey(): string | null {
  const key = useQuery("uitleg")
  const day = useQuery("dag")
  if (key !== null) return key
  if (day === null) return null
  return `i.omzetPerDag.${Math.min(6, Math.max(0, Number.parseInt(day, 10) || 0))}`
}

/* ── the states ─────────────────────────────────────────────────────────────────────────────────── */

function BoardLoading() {
  const shape = BOARDS[0]?.placements ?? []
  return (
    <div className="pane-scroll flex-1">
      <div
        aria-busy="true"
        aria-label="Bord laden"
        className="mx-auto flex w-full max-w-[90rem] flex-col gap-8 px-4 py-6 sm:px-8 sm:py-8"
      >
        <h1 className="sr-only">Analyse</h1>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-3 w-80 max-w-full" />
        </div>
        <div className="grid grid-cols-12 gap-y-14 md:gap-x-10 xl:gap-x-12">
          {shape.map((p) => (
            <div key={p.block} className={cx(SPAN[p.width], "flex min-w-0 flex-col gap-4")}>
              <Skeleton className="h-3.5 w-2/5" />
              <Skeleton className={cx("w-full rounded-md", p.block === "kerncijfers" ? "h-16" : "h-48")} />
              <Skeleton className="h-2.5 w-1/3" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function BoardError() {
  return (
    <Page>
      <PageHead title="Analyse" meta={`${PERIOD.label} tegen ${PERIOD.compare}`} />
      <ErrorState
        title="Het bord laden lukte niet"
        detail="GET /analytics/boards/week · 504 · req_e3a960"
        action={<Button onClick={() => setView({ staat: "gewoon" })}>Opnieuw proberen</Button>}
      >
        De cijfers van deze week kwamen niet op tijd binnen. Je bord en je indeling zijn bewaard.
      </ErrorState>
    </Page>
  )
}

function BoardEmpty() {
  return (
    <Page>
      <PageHead title="Analyse" meta={`${PERIOD.label} tegen ${PERIOD.compare}`} />
      <EmptyState
        glyph={BarChart3}
        title="Nog geen cijfers voor deze week"
        action={<ButtonLink to={paths.settings("winkels")}>Winkel koppelen</ButtonLink>}
      >
        Analyse vult zich zodra je Shopify-winkel een week bestellingen heeft: omzet, retouren, levertijden en tickets,
        elk met wat Magnus erin zag. Je borden inrichten kan nu al.
      </EmptyState>
    </Page>
  )
}

/* ── a new board, and the templates to start one from ───────────────────────────────────────────── */

const slug = (name: string) =>
  name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(
    /^-|-$/g,
    ""
  ) || "bord"

/** The arrangement of a board, drawn small: each block a bar at its width on the 12 columns. */
function Schematic({ template }: { readonly template: BoardTemplate }) {
  if (template.placements.length === 0) {
    return (
      <span
        aria-hidden="true"
        className="flex h-[3.25rem] w-44 shrink-0 items-center justify-center rounded-sm bg-well text-ink-4"
      >
        <Plus size={16} />
      </span>
    )
  }
  return (
    <span aria-hidden="true" className="grid w-44 shrink-0 grid-cols-12 gap-1">
      {template.placements.map((p) => (
        <span
          key={p.block}
          className={cx("h-2.5 rounded-xs", p.block === template.lead ? "bg-accent-tint" : "bg-well")}
          style={{ gridColumn: `span ${COLS[p.width]} / span ${COLS[p.width]}` }}
        />
      ))}
    </span>
  )
}

const COLS: Record<Width, number> = { third: 4, half: 6, "two-thirds": 8, full: 12 }

function NewBoard({ canEdit }: { readonly canEdit: boolean }) {
  const preset = useQuery("sjabloon")
  const first = BOARD_TEMPLATES.find((t) => t.id === preset) ?? BOARD_TEMPLATES.at(-1)
  const [templateId, setTemplateId] = useState(first?.id ?? "leeg")
  const [name, setName] = useState(first === undefined || first.id === "leeg" ? "" : `${first.name} (kopie)`)
  const [tried, setTried] = useState(false)
  const template = BOARD_TEMPLATES.find((t) => t.id === templateId)

  if (!canEdit) {
    return (
      <Page width="text">
        <PageHead title="Nieuw bord" />
        <Denied area="analytics" need={2} what="een bord maken" />
      </Page>
    )
  }

  const create = () => {
    setTried(true)
    const clean = name.trim()
    if (clean === "" || template === undefined) return
    const id = `${slug(clean)}-${Date.now().toString(36)}`
    const lead = template.lead ?? template.placements[0]?.block ?? "kerncijfers"
    saveCustom([...loadCustom(), { id, name: clean, owner: ME.name, lead, placements: template.placements }])
    toast({ title: `${clean} gemaakt`, body: "Het staat bij je borden in deze browser.", tone: "good" })
    navigate(`${paths.board(id)}${template.placements.length === 0 ? "?aanpassen=1" : ""}`)
  }

  return (
    <Page width="text">
      <PageHead
        title="Nieuw bord"
        meta="Een bord is van jou: welke blokken, hun volgorde en hun breedte. Periode, vorm en kleuren zijn voor elk bord gelijk."
      />
      <form
        className="flex flex-col gap-8"
        onSubmit={(event) => {
          event.preventDefault()
          create()
        }}
      >
        <Field
          label="Naam"
          error={tried && name.trim() === "" ? "Geef het bord een naam." : undefined}
          hint="Zo staat het in het menu van Analyse."
        >
          {(control) => (
            <Input
              {...control}
              value={name}
              placeholder="Bijvoorbeeld Maandagoverleg"
              onChange={(event) => setName(event.target.value)}
              className="max-w-sm"
            />
          )}
        </Field>
        <div className="flex flex-col gap-3">
          <RadioGroup
            label="Begin met"
            value={templateId}
            onChange={(next) => {
              setTemplateId(next)
              const t = BOARD_TEMPLATES.find((x) => x.id === next)
              if (name.trim() === "" || BOARD_TEMPLATES.some((x) => name === `${x.name} (kopie)`)) {
                setName(t === undefined || t.id === "leeg" ? "" : `${t.name} (kopie)`)
              }
            }}
            options={BOARD_TEMPLATES.map((t) => ({ value: t.id, label: t.name, description: t.purpose }))}
          />
        </div>
        {template !== undefined && template.placements.length > 0 && (
          <section aria-labelledby="nieuw-blokken" className="flex flex-col gap-2">
            <h2 id="nieuw-blokken" className="text-xs font-medium text-ink">
              Blokken <span className="font-normal text-ink-3">· {template.placements.length}</span>
            </h2>
            <ol className="flex flex-col gap-1 text-sm text-ink-2">
              {template.placements.map((p) => <li key={p.block}>{BLOCKS[p.block].title}</li>)}
            </ol>
          </section>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary">Bord maken</Button>
          <ButtonLink to={paths.section("analyse", "sjablonen")} variant="ghost">Sjablonen bekijken</ButtonLink>
        </div>
      </form>
    </Page>
  )
}

function Templates({ canEdit }: { readonly canEdit: boolean }) {
  const state = dataState(useView())
  const head = (
    <PageHead
      title="Sjablonen voor borden"
      meta="Elk sjabloon is een bord om mee te beginnen; daarna is het van jou."
      actions={canEdit && (
        <ButtonLink to={paths.section("analyse", "nieuw")} size="sm" icon={<Plus />}>Nieuw bord</ButtonLink>
      )}
    />
  )
  if (state === "loading") {
    return (
      <Page width="record">
        {head}
        <div aria-busy="true" aria-label="Sjablonen laden" className="flex flex-col gap-7">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="flex flex-wrap items-start gap-5">
              <Skeleton className="h-[3.25rem] w-44" />
              <span className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </span>
            </span>
          ))}
        </div>
      </Page>
    )
  }
  if (state === "error") {
    return (
      <Page width="record">
        {head}
        <ErrorState
          title="Sjablonen laden lukte niet"
          detail="GET /analytics/templates · 503 · req_0b77d2"
          action={<Button onClick={() => setView({ staat: "gewoon" })}>Opnieuw proberen</Button>}
        >
          De verbinding met de server viel weg. Je eigen borden staan gewoon in het menu.
        </ErrorState>
      </Page>
    )
  }
  return (
    <Page width="record">
      {head}
      <ul className="flex flex-col gap-8">
        {BOARD_TEMPLATES.map((t) => (
          <li key={t.id} className="flex flex-wrap items-start gap-x-6 gap-y-3">
            <Schematic template={t} />
            <div className="flex min-w-0 flex-1 basis-72 flex-col gap-1">
              <h2 className="text-sm font-semibold text-ink">{t.name}</h2>
              <p className="text-sm text-pretty text-ink-2">{t.purpose}</p>
              {t.placements.length > 0 && (
                <p className="text-xs text-pretty text-ink-3">
                  {t.placements.map((p) => BLOCKS[p.block].title).join(" · ")}
                </p>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              {BOARDS.some((b) => b.id === t.id) && (
                <ButtonLink to={paths.board(t.id)} size="sm" variant="ghost">Bekijken</ButtonLink>
              )}
              {canEdit && (
                <ButtonLink to={`${paths.section("analyse", "nieuw")}?sjabloon=${t.id}`} size="sm">
                  Bord maken
                </ButtonLink>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Page>
  )
}
