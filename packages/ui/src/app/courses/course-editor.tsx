import { useNavigate, useParams } from "@tanstack/react-router"
import { motion, Reorder, useDragControls, useReducedMotion } from "motion/react"
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "../../components/dropdown-menu"
import { Switch } from "../../components/switch"
import { suppliers } from "../../data-source"
import {
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  GripVertical,
  Hash,
  List,
  MoreHorizontal,
  Play,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X
} from "../../icons"
import { ReadOnlyNotice } from "../access/route-gate"
import { EmptyState } from "../common/empty-state"
import { PageHeader } from "../common/page-header"
import {
  BADGE_LABEL,
  BADGES,
  type Block,
  BLOCK_LABEL,
  blockers,
  type BlockKind,
  type Course,
  emptyBlock,
  minutesOf,
  newId,
  quizzesOf,
  suggestQuestions,
  videoHost
} from "../lib/courses"
import { formatRelative } from "../lib/format"
import { undoable } from "../lib/undo"
import { cn } from "../lib/utils"
import { UnsavedBar } from "../settings/form"
import { useGate } from "../stores/access-store"
import { useCourses } from "../stores/courses-store"
import { useWorkspace } from "../stores/workspace-store"
import { Segmented } from "../team/bits"
import { CourseMenu } from "./courses-screen"
import { BLOCK_GLYPH, CourseBadge, CourseStatusPill, plural } from "./parts"

type Quiz = Extract<Block, { kind: "quiz" }>

const SECTIONS = [
  { id: "over", label: "Over de cursus" },
  { id: "inhoud", label: "Inhoud" },
  { id: "instellingen", label: "Instellingen" }
] as const

/**
 * One course (`/courses/$courseId`), edited as one document rather than a wizard: what it is and
 * where it sits, the blocks in reading order, and the settings. The left column is the outline and
 * the list of what still stands between a draft and publishing it. Nothing is kept until it is
 * saved; a change raises the house's unsaved bar.
 */
export function CourseEditorPage() {
  const { courseId } = useParams({ strict: false }) as { courseId?: string }
  const c = useCourses((s) => s.courses.find((x) => x.id === courseId))
  if (!c) {
    return (
      <div className="flex min-w-0 flex-col">
        <PageHeader title="Cursus" crumbs={[{ label: "Cursussen", to: "/courses" }]} />
        <EmptyState kind="courses" title="Deze cursus bestaat niet (meer)." body="Ga terug naar Cursussen." />
      </div>
    )
  }
  return <Editor key={c.id} saved={c} />
}

function Editor({ saved }: { saved: Course }) {
  const navigate = useNavigate()
  const gate = useGate("team", 2)
  const chapters = useCourses((s) => s.chapters)
  const savedKey = JSON.stringify(saved)
  const [draft, setDraft] = useState<Course>(saved)
  const last = useRef(savedKey)
  useEffect(() => {
    if (last.current !== savedKey) {
      last.current = savedKey
      setDraft(JSON.parse(savedKey) as Course)
    }
  }, [savedKey])
  const dirty = JSON.stringify(draft) !== savedKey
  const todo = blockers(draft)
  const chapter = chapters.find((c) => c.id === draft.chapterId)
  const [active, setActive] = useState<string>("over")
  const [proposal, setProposal] = useState<Quiz[] | null>(null)
  const set = (patch: Partial<Course>) => setDraft((d) => ({ ...d, ...patch }))
  const setBlock = (id: string, next: Block) =>
    setDraft((d) => ({ ...d, blocks: d.blocks.map((b) => (b.id === id ? next : b)) }))

  const save = () => {
    const undo = useCourses.getState().save(saved.id, draft)
    undoable(
      `“${draft.title}” opgeslagen`,
      undo,
      saved.status === "live"
        ? "Het team ziet de nieuwe versie meteen."
        : "Nog een concept: het team ziet hem pas na publiceren."
    )
  }
  const publish = () => {
    const store = useCourses.getState()
    const before = store.courses
    store.save(saved.id, { ...draft, status: "live", publishedAt: draft.publishedAt ?? new Date().toISOString() })
    undoable(
      `“${draft.title}” gepubliceerd`,
      () => useCourses.setState({ courses: before }),
      "Het team ziet hem nu onder Mijn cursussen."
    )
  }

  /* The outline follows the section being read: the last one whose top has passed a third of the window. */
  useEffect(() => {
    const on = () => {
      let current: string = SECTIONS[0].id
      for (const sec of SECTIONS) {
        const el = document.getElementById(`sec-${sec.id}`)
        if (el && el.getBoundingClientRect().top < window.innerHeight * 0.3) current = sec.id
      }
      setActive(current)
    }
    document.addEventListener("scroll", on, true)
    on()
    return () => document.removeEventListener("scroll", on, true)
  }, [])
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })

  const add = (kind: BlockKind) => {
    const b = emptyBlock(kind)
    setDraft((d) => ({ ...d, blocks: [...d.blocks, b] }))
    requestAnimationFrame(() => go(`blk-${b.id}`))
  }
  const propose = () => {
    const qs = suggestQuestions(draft)
    if (qs.length === 0) {
      toast("Geen vragen gevonden", {
        description:
          "Insyte maakt vragen van zinnen met een getal of een termijn erin. Schrijf er een in een tekstblok en probeer het opnieuw."
      })
      return
    }
    setProposal(qs)
    requestAnimationFrame(() => go("proposal"))
  }

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        title={draft.title || "Naamloze cursus"}
        crumbs={[
          { label: "Cursussen", to: "/courses" },
          ...(chapter ? [{ label: chapter.title, to: "/courses" }] : [])
        ]}
        meta={
          <span className="flex items-center gap-2">
            <CourseStatusPill status={saved.status} />
            <span className="text-ink-3 text-sm">Bewerkt {formatRelative(saved.updatedAt)}</span>
          </span>
        }
        actions={
          <>
            <button
              type="button"
              onClick={() =>
                void navigate({
                  to: "/courses/learn/$courseId",
                  params: { courseId: saved.id },
                  search: { preview: "1" } as never
                })}
              className="field flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-ink text-sm transition-colors hover:field-hover"
            >
              <Eye className="size-3.5" strokeWidth={1.75} />
              Voorbeeld
            </button>
            {saved.status !== "live" && gate.ok ?
              (
                <button
                  type="button"
                  disabled={todo.length > 0}
                  title={todo.length ? todo[0] : undefined}
                  onClick={publish}
                  className="flex h-8 items-center gap-1.5 rounded-md bg-abyss px-3 font-medium text-mesh-ink text-sm shadow-primary transition-colors hover:bg-abyss-2 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Upload className="size-3.5" strokeWidth={1.75} />
                  Publiceren
                </button>
              ) :
              null}
            <CourseMenu c={saved} onRemoved={() => void navigate({ to: "/courses" })} />
          </>
        }
      />

      <div className="grid grid-cols-1 gap-8 px-5 pb-16 lg:grid-cols-[220px_minmax(0,760px)] lg:gap-12">
        <nav aria-label="Onderdelen" className="hidden flex-col gap-6 lg:sticky lg:top-4 lg:flex lg:self-start">
          <ul className="flex flex-col gap-0.5">
            {SECTIONS.map((s) => (
              <li key={s.id} className="flex flex-col">
                <button
                  type="button"
                  onClick={() => go(`sec-${s.id}`)}
                  aria-current={active === s.id ? "true" : undefined}
                  className={cn(
                    "flex h-8 items-center justify-between rounded-md px-2.5 text-left text-base transition-colors",
                    active === s.id
                      ? "bg-arc-tint font-medium text-arc-ink"
                      : "text-ink-2 hover:bg-ink/5 hover:text-ink"
                  )}
                >
                  {s.label}
                  {s.id === "inhoud"
                    ? <span className="text-ink-3 text-sm tabular-nums">{draft.blocks.length}</span>
                    : null}
                </button>
                {s.id === "inhoud" && draft.blocks.length ?
                  (
                    <ul className="ml-2.5 flex flex-col py-1">
                      {draft.blocks.map((b) => {
                        const G = BLOCK_GLYPH[b.kind]
                        const label = b.kind === "quiz" ? b.question : b.title
                        return (
                          <li key={b.id}>
                            <button
                              type="button"
                              onClick={() => go(`blk-${b.id}`)}
                              className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-ink-3 text-sm transition-colors hover:bg-ink/5 hover:text-ink"
                            >
                              <G className="size-3.5 shrink-0" strokeWidth={1.75} />
                              <span className="truncate">{label || BLOCK_LABEL[b.kind]}</span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  ) :
                  null}
              </li>
            ))}
          </ul>
          <section aria-label="Klaar om te publiceren" className="flex flex-col gap-2 rounded-lg bg-mist p-3">
            <h2 className="font-medium text-ink text-sm">
              {saved.status === "live" ? "Live" : "Klaar om te publiceren"}
            </h2>
            {todo.length === 0 ?
              (
                <p className="flex items-start gap-2 text-ink-2 text-sm">
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-signal-green" strokeWidth={1.75} />
                  {saved.status === "live" ? "Het team volgt deze versie." : "Alles staat klaar."}
                </p>
              ) :
              (
                <ul className="flex flex-col gap-1.5">
                  {todo.map((t) => (
                    <li key={t} className="flex items-start gap-2 text-ink-2 text-sm">
                      <span aria-hidden className="mt-1.5 size-1.5 shrink-0 bg-signal-amber" />
                      {t}
                    </li>
                  ))}
                </ul>
              )}
            <p className="text-ink-3 text-xs tabular-nums">
              {plural(draft.blocks.length, "blok", "blokken")} · {minutesOf(draft)} min ·{" "}
              {plural(quizzesOf(draft).length, "vraag", "vragen")}
            </p>
          </section>
        </nav>

        <div className="flex min-w-0 flex-col gap-12">
          {gate.ok ? null : <ReadOnlyNotice reason={gate.reason} />}
          <fieldset disabled={!gate.ok} className="contents">
            {/* ── about ── */}
            <section id="sec-over" aria-labelledby="h-over" className="flex scroll-mt-4 flex-col gap-4">
              <h2 id="h-over" className="sr-only">
                Over de cursus
              </h2>
              <input
                value={draft.title}
                onChange={(e) => set({ title: e.target.value })}
                aria-label="Naam van de cursus"
                placeholder="Naam van de cursus"
                className="-mx-2 rounded-md bg-transparent px-2 py-1 font-medium text-2xl text-ink outline-none placeholder:text-ink-3 hover:bg-ink/4 focus:bg-paper"
              />
              <textarea
                value={draft.description}
                onChange={(e) => set({ description: e.target.value })}
                rows={2}
                aria-label="Wat iemand leert"
                placeholder="In één zin: wat iemand na deze cursus kan."
                className="-mx-2 resize-none rounded-md bg-transparent px-2 py-1 text-ink-2 text-md leading-[1.5] outline-none placeholder:text-ink-3 hover:bg-ink/4 focus:bg-paper"
              />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-ink-3 text-sm">Staat in</span>
                <select
                  aria-label="Hoofdstuk"
                  value={draft.chapterId}
                  onChange={(e) => {
                    const ch = chapters.find((c) => c.id === e.target.value)
                    set({ chapterId: e.target.value, moduleId: ch?.modules[0]?.id ?? "" })
                  }}
                  className="field h-8 rounded-md px-2 text-ink text-sm outline-none focus:bg-paper"
                >
                  {chapters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
                <span className="text-ink-4">/</span>
                <select
                  aria-label="Module"
                  value={draft.moduleId}
                  onChange={(e) => set({ moduleId: e.target.value })}
                  className="field h-8 rounded-md px-2 text-ink text-sm outline-none focus:bg-paper"
                >
                  {chapter?.modules.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </select>
              </div>
            </section>

            {/* ── content ── */}
            <section id="sec-inhoud" aria-labelledby="h-inhoud" className="flex scroll-mt-4 flex-col gap-4">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="h-inhoud" className="font-medium text-ink text-lg">
                  Inhoud
                </h2>
                <span className="text-ink-3 text-sm">
                  {draft.order === "fixed" ? "Vaste volgorde: blok voor blok" : "Vrije volgorde"}
                </span>
              </div>
              {draft.blocks.length ?
                (
                  <Reorder.Group
                    as="ol"
                    axis="y"
                    values={draft.blocks}
                    onReorder={(blocks: Block[]) => set({ blocks })}
                    className="flex flex-col gap-3"
                  >
                    {draft.blocks.map((b, i) => (
                      <BlockPanel
                        key={b.id}
                        b={b}
                        i={i}
                        n={draft.blocks.length}
                        onChange={(next) => setBlock(b.id, next)}
                        onMove={(d) =>
                          setDraft((x) => {
                            const blocks = [...x.blocks]
                            const j = i + d
                            ;[blocks[i], blocks[j]] = [blocks[j]!, blocks[i]!]
                            return { ...x, blocks }
                          })}
                        onCopy={() =>
                          setDraft((x) => ({
                            ...x,
                            blocks: [
                              ...x.blocks.slice(0, i + 1),
                              { ...b, id: newId("blk") } as Block,
                              ...x.blocks.slice(i + 1)
                            ]
                          }))}
                        onRemove={() => setDraft((x) => ({ ...x, blocks: x.blocks.filter((y) => y.id !== b.id) }))}
                      />
                    ))}
                  </Reorder.Group>
                ) :
                (
                  <p className="hatch rounded-xl px-5 py-8 text-ink-3 text-sm">
                    Nog geen blokken. Begin met een tekst: wat moet iemand weten, in korte zinnen.
                  </p>
                )}

              {proposal ?
                (
                  <Proposal
                    qs={proposal}
                    from={draft.blocks.filter((b) => b.kind === "text").length}
                    onTake={(q) => {
                      setDraft((d) => ({ ...d, blocks: [...d.blocks, q] }))
                      setProposal((p) => (p && p.length > 1 ? p.filter((x) => x.id !== q.id) : null))
                    }}
                    onDrop={(q) => setProposal((p) => (p && p.length > 1 ? p.filter((x) => x.id !== q.id) : null))}
                    onClose={() => setProposal(null)}
                  />
                ) :
                null}

              {gate.ok ?
                (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 text-ink-3 text-sm">Blok toevoegen</span>
                    {(["text", "video", "image", "quiz"] as const).map((k) => {
                      const G = BLOCK_GLYPH[k]
                      return (
                        <button
                          key={k}
                          type="button"
                          onClick={() => add(k)}
                          className="field flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-ink text-sm transition-colors hover:field-hover"
                        >
                          <G className="size-3.5" strokeWidth={1.75} />
                          {BLOCK_LABEL[k]}
                        </button>
                      )
                    })}
                    <span className="flex-1" />
                    <button
                      type="button"
                      onClick={propose}
                      disabled={!draft.blocks.some((b) => b.kind === "text")}
                      className="flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-arc-ink text-sm transition-colors hover:bg-arc-tint disabled:opacity-45"
                    >
                      <Sparkles className="size-3.5" strokeWidth={1.75} />
                      Vragen laten voorstellen
                    </button>
                  </div>
                ) :
                null}
            </section>

            {/* ── settings ── */}
            <section id="sec-instellingen" aria-labelledby="h-instellingen" className="flex scroll-mt-4 flex-col gap-2">
              <h2 id="h-instellingen" className="mb-2 font-medium text-ink text-lg">
                Instellingen
              </h2>
              <Settings draft={draft} set={set} />
            </section>
          </fieldset>
          <UnsavedBar visible={dirty && gate.ok} onDiscard={() => setDraft(saved)} onSave={save} />
        </div>
      </div>
    </div>
  )
}

/* ── one block ───────────────────────────────────────────────────────────────────────────── */

function BlockPanel(
  { b, i, n, onChange, onMove, onCopy, onRemove }: {
    b: Block
    i: number
    n: number
    onChange: (b: Block) => void
    onMove: (d: -1 | 1) => void
    onCopy: () => void
    onRemove: () => void
  }
) {
  const controls = useDragControls()
  const G = BLOCK_GLYPH[b.kind]
  return (
    <Reorder.Item
      value={b}
      dragListener={false}
      dragControls={controls}
      as="li"
      id={`blk-${b.id}`}
      className="scroll-mt-6 overflow-hidden rounded-xl bg-paper shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--ink)_9%,transparent)]"
    >
      <div className="flex items-center gap-2 bg-mist py-1.5 pr-1.5 pl-1">
        <span
          onPointerDown={(e) => controls.start(e)}
          aria-hidden
          className="flex h-7 w-6 cursor-grab touch-none items-center justify-center text-ink-4 active:cursor-grabbing"
        >
          <GripVertical className="size-4" strokeWidth={1.75} />
        </span>
        <G className="size-3.5 text-ink-3" strokeWidth={1.75} />
        <span className="font-medium text-ink-2 text-sm">{BLOCK_LABEL[b.kind]}</span>
        <span className="text-ink-3 text-sm tabular-nums">
          {i + 1} van {n}
        </span>
        <span className="flex-1" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Opties voor blok ${i + 1}`}
              className="flex size-7 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink"
            >
              <MoreHorizontal className="size-4" strokeWidth={1.75} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem disabled={i === 0} onClick={() => onMove(-1)}>
              <ArrowUp className="size-3.5" strokeWidth={1.75} />
              Omhoog
            </DropdownMenuItem>
            <DropdownMenuItem disabled={i === n - 1} onClick={() => onMove(1)}>
              <ArrowDown className="size-3.5" strokeWidth={1.75} />
              Omlaag
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onCopy}>
              <Copy className="size-3.5" strokeWidth={1.75} />
              Dupliceren
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onRemove}>
              <Trash2 className="size-3.5" strokeWidth={1.75} />
              Verwijderen
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex flex-col gap-3 p-4">
        {b.kind === "text"
          ? <TextBlock b={b} onChange={onChange} />
          : b.kind === "video"
          ? <VideoBlock b={b} onChange={onChange} />
          : b.kind === "image"
          ? <ImageBlock b={b} onChange={onChange} />
          : <QuizBlock b={b} onChange={onChange} />}
      </div>
    </Reorder.Item>
  )
}

const TITLE =
  "w-full rounded-md bg-transparent px-2 py-1 font-medium text-ink text-md outline-none placeholder:text-ink-3 hover:bg-ink/4 focus:bg-mist"
const WELL = "field w-full rounded-md px-3 text-base text-ink outline-none placeholder:text-ink-3 focus:bg-paper"

function TextBlock({ b, onChange }: { b: Extract<Block, { kind: "text" }>; onChange: (b: Block) => void }) {
  const area = useRef<HTMLTextAreaElement>(null)
  const mark = (prefix: string) => {
    const el = area.current
    if (!el) return
    const start = b.body.lastIndexOf("\n", el.selectionStart - 1) + 1
    onChange({ ...b, body: b.body.slice(0, start) + prefix + b.body.slice(start) })
    requestAnimationFrame(() => el.focus())
  }
  return (
    <>
      <input
        value={b.title}
        onChange={(e) => onChange({ ...b, title: e.target.value })}
        aria-label="Kop van het blok"
        placeholder="Kop"
        className={cn(TITLE, "-mx-2")}
      />
      <div className="overflow-hidden rounded-md">
        <div className="flex items-center gap-1 bg-ink/4 px-1.5 py-1">
          <button
            type="button"
            onClick={() => mark("## ")}
            className="flex h-6 items-center gap-1 rounded px-1.5 text-ink-2 text-xs hover:bg-ink/6 hover:text-ink"
          >
            <Hash className="size-3" strokeWidth={1.75} />
            Kop
          </button>
          <button
            type="button"
            onClick={() => mark("- ")}
            className="flex h-6 items-center gap-1 rounded px-1.5 text-ink-2 text-xs hover:bg-ink/6 hover:text-ink"
          >
            <List className="size-3" strokeWidth={1.75} />
            Lijst
          </button>
          <span className="flex-1" />
          <span className="px-1 text-ink-3 text-xs tabular-nums">
            {b.body.split(/\s+/).filter(Boolean).length} woorden
          </span>
        </div>
        <textarea
          ref={area}
          value={b.body}
          onChange={(e) => onChange({ ...b, body: e.target.value })}
          rows={Math.min(14, Math.max(4, b.body.split("\n").length + 1))}
          aria-label="Tekst"
          placeholder="Wat iemand moet weten, in korte zinnen. ## voor een kop, - voor een lijst."
          className="field block w-full resize-y rounded-none px-3 py-2.5 text-base text-ink leading-[1.65] outline-none placeholder:text-ink-3 focus:bg-paper"
        />
      </div>
    </>
  )
}

function VideoBlock({ b, onChange }: { b: Extract<Block, { kind: "video" }>; onChange: (b: Block) => void }) {
  const host = videoHost(b.url)
  return (
    <>
      <input
        value={b.title}
        onChange={(e) => onChange({ ...b, title: e.target.value })}
        aria-label="Titel van de video"
        placeholder="Titel van de video"
        className={cn(TITLE, "-mx-2")}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_110px]">
        <input
          value={b.url}
          onChange={(e) => onChange({ ...b, url: e.target.value })}
          aria-label="Link"
          placeholder="https://www.loom.com/share/… of YouTube, Vimeo"
          className={cn(WELL, "h-9")}
          inputMode="url"
        />
        <label className="field flex h-9 items-center gap-2 rounded-md px-3 focus-within:bg-paper">
          <input
            type="number"
            min={1}
            max={120}
            value={b.minutes}
            onChange={(e) => onChange({ ...b, minutes: Math.max(1, Number(e.target.value) || 1) })}
            aria-label="Minuten"
            className="w-full bg-transparent text-base text-ink tabular-nums outline-none"
          />
          <span className="text-ink-3 text-sm">min</span>
        </label>
      </div>
      <VideoFrame title={b.title} host={host} minutes={b.minutes} />
    </>
  )
}

/** A video drawn as a plate: where it plays, how long, and the button. The player itself is the host's. */
export function VideoFrame(
  { title, host, minutes, playing, progress, onPlay }: {
    title: string
    host: string
    minutes: number
    playing?: boolean
    progress?: number
    onPlay?: () => void
  }
) {
  return (
    <div className="plate relative flex aspect-video w-full flex-col justify-between overflow-hidden rounded-lg p-4">
      <span className="flex items-center justify-between text-mesh-ink-2 text-xs">
        <span>{host || "Nog geen link"}</span>
        <span className="tabular-nums">{minutes} min</span>
      </span>
      <button
        type="button"
        onClick={onPlay}
        disabled={!onPlay}
        aria-label={playing ? "Wordt afgespeeld" : `${title || "Video"} afspelen`}
        className="mx-auto flex size-14 items-center justify-center rounded-full bg-paper text-abyss transition-transform enabled:hover:scale-105 disabled:cursor-default"
      >
        {playing
          ? (
            <span className="flex gap-1">
              <span className="h-4 w-1 bg-abyss" />
              <span className="h-4 w-1 bg-abyss" />
            </span>
          )
          : <Play className="ml-0.5 size-5" strokeWidth={2} />}
      </button>
      <span className="flex flex-col gap-2">
        <span className="truncate font-medium text-mesh-ink text-sm">{title || "Naamloze video"}</span>
        <span className="block h-1 overflow-hidden rounded-full bg-mesh-ink/15">
          <span
            className="block h-full bg-mesh-ink transition-[width] duration-200"
            style={{ width: `${Math.round((progress ?? 0) * 100)}%` }}
          />
        </span>
      </span>
    </div>
  )
}

function ImageBlock({ b, onChange }: { b: Extract<Block, { kind: "image" }>; onChange: (b: Block) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const pick = (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith("image/")) {
      return void toast("Dat is geen afbeelding", { description: "Kies een PNG, JPG of WebP." })
    }
    if (file.size > 1_500_000) {
      return void toast("Die afbeelding is te groot", { description: "Kies er een tot 1,5 MB, of verklein hem eerst." })
    }
    const r = new FileReader()
    r.onload = () => onChange({ ...b, src: String(r.result) })
    r.readAsDataURL(file)
  }
  return (
    <>
      <input
        value={b.title}
        onChange={(e) => onChange({ ...b, title: e.target.value })}
        aria-label="Titel van de afbeelding"
        placeholder="Wat de afbeelding laat zien"
        className={cn(TITLE, "-mx-2")}
      />
      {b.src ?
        (
          <figure className="group/img relative overflow-hidden rounded-lg bg-mist">
            <img src={b.src} alt={b.title} className="max-h-[360px] w-full object-cover" />
            <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/img:opacity-100">
              <button
                type="button"
                onClick={() => input.current?.click()}
                className="flex h-8 items-center rounded-md bg-paper px-2.5 font-medium text-ink text-sm shadow-sm"
              >
                Vervangen
              </button>
              <button
                type="button"
                aria-label="Afbeelding weghalen"
                onClick={() => onChange({ ...b, src: undefined })}
                className="flex size-8 items-center justify-center rounded-md bg-paper text-ink shadow-sm"
              >
                <X className="size-3.5" strokeWidth={1.75} />
              </button>
            </div>
          </figure>
        ) :
        (
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              pick(e.dataTransfer.files[0])
            }}
            className="hatch flex h-40 flex-col items-center justify-center gap-1 rounded-lg text-ink-3 transition-colors hover:text-ink"
          >
            <Upload className="size-4" strokeWidth={1.75} />
            <span className="text-sm">Sleep een afbeelding hierheen of kies er een</span>
            <span className="text-xs">PNG, JPG of WebP, tot 1,5 MB</span>
          </button>
        )}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0])}
      />
      <input
        value={b.caption}
        onChange={(e) => onChange({ ...b, caption: e.target.value })}
        aria-label="Onderschrift"
        placeholder="Onderschrift: waar iemand op moet letten"
        className={cn(WELL, "h-9")}
      />
    </>
  )
}

function QuizBlock({ b, onChange }: { b: Quiz; onChange: (b: Block) => void }) {
  return (
    <>
      <input
        value={b.question}
        onChange={(e) => onChange({ ...b, question: e.target.value })}
        aria-label="Vraag"
        placeholder="De vraag"
        className={cn(TITLE, "-mx-2")}
      />
      <div role="radiogroup" aria-label="Antwoorden; kies het goede" className="flex flex-col gap-1.5">
        {b.options.map((o, i) => {
          const right = o.id === b.correct
          return (
            <div
              key={o.id}
              className={cn(
                "flex items-center gap-2 rounded-md p-1 pr-1.5 transition-colors",
                right ? "bg-signal-green-bg" : "bg-ink/4"
              )}
            >
              <button
                type="button"
                role="radio"
                aria-checked={right}
                aria-label={`Antwoord ${i + 1} is het goede`}
                onClick={() => onChange({ ...b, correct: o.id })}
                className={cn(
                  "flex h-7 shrink-0 items-center gap-1 rounded px-2 font-medium text-xs transition-colors",
                  right ? "bg-paper text-signal-green" : "text-ink-3 hover:bg-paper hover:text-ink"
                )}
              >
                {right ? <Check className="size-3" strokeWidth={2.25} /> : null}
                {right ? "Goed" : "Fout"}
              </button>
              <input
                value={o.text}
                onChange={(e) =>
                  onChange({
                    ...b,
                    options: b.options.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x))
                  })}
                aria-label={`Antwoord ${i + 1}`}
                placeholder={`Antwoord ${i + 1}`}
                className="h-7 min-w-0 flex-1 rounded bg-transparent px-1.5 text-base text-ink outline-none placeholder:text-ink-3 focus:bg-paper"
              />
              {b.options.length > 2 ?
                (
                  <button
                    type="button"
                    aria-label={`Antwoord ${i + 1} weghalen`}
                    onClick={() => {
                      const options = b.options.filter((x) => x.id !== o.id)
                      onChange({ ...b, options, correct: right ? (options[0]?.id ?? "") : b.correct })
                    }}
                    className="flex size-6 items-center justify-center rounded text-ink-3 hover:bg-ink/6 hover:text-ink"
                  >
                    <X className="size-3.5" strokeWidth={1.75} />
                  </button>
                ) :
                null}
            </div>
          )
        })}
      </div>
      {b.options.length < 5 ?
        (
          <button
            type="button"
            onClick={() => onChange({ ...b, options: [...b.options, { id: newId("opt"), text: "" }] })}
            className="flex h-7 w-fit items-center gap-1 rounded-md px-2 text-ink-3 text-sm hover:bg-ink/6 hover:text-ink"
          >
            <Plus className="size-3.5" strokeWidth={1.75} />
            Antwoord toevoegen
          </button>
        ) :
        null}
      <input
        value={b.explain}
        onChange={(e) => onChange({ ...b, explain: e.target.value })}
        aria-label="Uitleg na het antwoord"
        placeholder="Uitleg na het antwoord: waarom dit het goede is"
        className={cn(WELL, "h-9")}
      />
    </>
  )
}

/* ── Insyte's proposal, on a plate ───────────────────────────────────────────────────────── */

function Proposal(
  { qs, from, onTake, onDrop, onClose }: {
    qs: Quiz[]
    from: number
    onTake: (q: Quiz) => void
    onDrop: (q: Quiz) => void
    onClose: () => void
  }
) {
  const still = useReducedMotion()
  return (
    <motion.section
      id="proposal"
      aria-label="Voorstel van Insyte"
      initial={still ? false : { clipPath: "inset(0 0 0 100%)" }}
      animate={{ clipPath: "inset(0 0 0 0%)" }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      className="plate relative scroll-mt-6 overflow-hidden rounded-xl"
    >
      <span className="plate-scan" aria-hidden />
      <div className="flex items-start gap-3 p-5 pb-3">
        <Sparkles className="mt-0.5 size-4 text-mesh-ink" strokeWidth={1.75} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="font-medium text-md text-mesh-ink">
            Insyte stelt {plural(qs.length, "vraag", "vragen")} voor
          </h3>
          <p className="text-mesh-ink-2 text-sm">
            Gemaakt van zinnen in je tekst met een getal of een termijn. De foute antwoorden zijn dezelfde zin met een
            ander getal.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Voorstel sluiten"
          className="flex size-7 items-center justify-center rounded-md text-mesh-ink-2 hover:bg-mesh-ink/10 hover:text-mesh-ink"
        >
          <X className="size-4" strokeWidth={1.75} />
        </button>
      </div>
      <ul className="flex flex-col gap-2 px-5 pb-4">
        {qs.map((q) => (
          <li
            key={q.id}
            className="flex flex-col gap-2 rounded-lg bg-mesh-ink/[0.06] p-3 shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--mesh-ink)_12%,transparent)]"
          >
            <span className="text-mesh-ink-2 text-xs">{q.question} Goed antwoord:</span>
            <span className="text-mesh-ink text-sm leading-[1.5]">{q.explain}</span>
            <span className="flex gap-1.5">
              <button
                type="button"
                onClick={() => onTake(q)}
                className="flex h-8 items-center gap-1.5 rounded-md bg-paper px-3 font-medium text-abyss text-sm hover:bg-paper/90"
              >
                <Plus className="size-3.5" strokeWidth={2} />
                Toevoegen
              </button>
              <button
                type="button"
                onClick={() => onDrop(q)}
                className="flex h-8 items-center rounded-md px-3 font-medium text-mesh-ink-2 text-sm hover:bg-mesh-ink/10 hover:text-mesh-ink"
              >
                Weggooien
              </button>
            </span>
          </li>
        ))}
      </ul>
      <footer className="flex flex-wrap items-center gap-x-6 gap-y-1 bg-mesh-ink/[0.05] px-5 py-2 text-mesh-ink-2 text-xs">
        <span>Voorstel · quizvragen</span>
        <span>Bron: {plural(from, "tekstblok", "tekstblokken")}</span>
        <span>Staat nog niet in de cursus</span>
      </footer>
    </motion.section>
  )
}

/* ── settings ────────────────────────────────────────────────────────────────────────────── */

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-start gap-x-8 gap-y-2 py-3 sm:grid-cols-[180px_minmax(0,1fr)]">
      <span className="flex flex-col gap-0.5 sm:pt-1.5">
        <span className="font-medium text-ink text-sm">{label}</span>
        {hint ? <span className="text-ink-3 text-sm">{hint}</span> : null}
      </span>
      <div className="flex min-w-0 flex-col items-start gap-2">{children}</div>
    </div>
  )
}

const CHIP = "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-sm leading-none transition-colors"

function Chips<T extends string>(
  { items, picked, onToggle, label }: {
    items: ReadonlyArray<{ id: T; label: string }>
    picked: ReadonlyArray<T>
    onToggle: (id: T) => void
    label: string
  }
) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {items.map((it) => {
        const on = picked.includes(it.id)
        return (
          <button
            key={it.id}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(it.id)}
            className={cn(CHIP, on ? "bg-arc-tint text-arc-ink" : "field text-ink-2 hover:field-hover hover:text-ink")}
          >
            {on ? <Check className="size-3.5" strokeWidth={2.25} /> : null}
            {it.label}
          </button>
        )
      })}
    </div>
  )
}

const toggle = <T>(xs: ReadonlyArray<T>, x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x])

function Settings({ draft, set }: { draft: Course; set: (p: Partial<Course>) => void }) {
  const allMembers = useWorkspace((s) => s.members)
  const members = useMemo(() => allMembers.filter((m) => m.status === "active"), [allMembers])
  const roles = useMemo(
    () => [
      ...new Set([...allMembers.map((m) => m.role), ...(draft.audience.kind === "some" ? draft.audience.roles : [])])
    ],
    [allMembers, draft.audience]
  )
  const a = draft.audience
  const sup = draft.suppliers
  const hasQuiz = quizzesOf(draft).length > 0
  return (
    <div className="flex flex-col">
      <Row
        label="Volgorde"
        hint={draft.order === "fixed"
          ? "Het volgende blok gaat open als het vorige klaar is."
          : "Iemand kiest zelf waar hij begint."}
      >
        <Segmented
          label="Volgorde"
          value={draft.order}
          onChange={(order) => set({ order })}
          options={[{ id: "free", label: "Vrij" }, { id: "fixed", label: "Blok voor blok" }]}
        />
      </Row>
      <Row label="Wie volgt hem">
        <Segmented
          label="Wie volgt hem"
          value={a.kind}
          onChange={(kind) =>
            set({
              audience: kind === "some"
                ? { kind, roles: a.kind === "some" ? a.roles : [], members: a.kind === "some" ? a.members : [] }
                : { kind }
            })}
          options={[{ id: "all", label: "Hele team" }, { id: "some", label: "Bepaalde rollen of mensen" }, {
            id: "none",
            label: "Niemand"
          }]}
        />
        {a.kind === "some" ?
          (
            <>
              <Chips
                label="Rollen"
                items={roles.map((r) => ({ id: r, label: r }))}
                picked={a.roles}
                onToggle={(r) => set({ audience: { ...a, roles: toggle(a.roles, r) } })}
              />
              <Chips
                label="Mensen"
                items={members.map((m) => ({ id: m.id, label: m.name }))}
                picked={a.members}
                onToggle={(id) => set({ audience: { ...a, members: toggle(a.members, id) } })}
              />
            </>
          ) :
          null}
      </Row>
      <Row label="Leveranciers" hint="Ze volgen hem in hun eigen portaal, onder Training.">
        <Segmented
          label="Leveranciers"
          value={sup.kind}
          onChange={(kind) =>
            set({ suppliers: kind === "some" ? { kind, ids: sup.kind === "some" ? sup.ids : [] } : { kind } })}
          options={[{ id: "none", label: "Geen" }, { id: "all", label: "Alle" }, { id: "some", label: "Bepaalde" }]}
        />
        {sup.kind === "some"
          ? (
            <Chips
              label="Leveranciers"
              items={suppliers.map((s) => ({ id: s.id, label: s.name }))}
              picked={sup.ids}
              onToggle={(id) => set({ suppliers: { kind: "some", ids: toggle(sup.ids, id) } })}
            />
          )
          : null}
      </Row>
      <Row label="Deadline" hint="Wie hem dan nog niet af heeft, staat bij Voortgang als te laat.">
        <span className="flex items-center gap-2">
          <input
            type="date"
            value={draft.deadline}
            onChange={(e) => set({ deadline: e.target.value })}
            aria-label="Deadline"
            className="field h-9 rounded-md px-3 text-base text-ink tabular-nums outline-none focus:bg-paper"
          />
          {draft.deadline ?
            (
              <button
                type="button"
                onClick={() => set({ deadline: "" })}
                className="flex h-8 items-center rounded-md px-2.5 text-ink-2 text-sm hover:bg-ink/6 hover:text-ink"
              >
                Geen deadline
              </button>
            ) :
            null}
        </span>
      </Row>
      {hasQuiz ?
        (
          <Row label="Slagingsgrens" hint="Het deel van de quizvragen dat goed moet zijn.">
            <Segmented
              label="Slagingsgrens"
              value={draft.passMark}
              onChange={(passMark) => set({ passMark })}
              options={[50, 60, 70, 80, 90, 100].map((n) => ({ id: n, label: `${n}%` }))}
            />
          </Row>
        ) :
        null}
      <Row label="Badge" hint="Wat iemand krijgt als hij hem afrondt.">
        <div role="radiogroup" aria-label="Badge" className="flex flex-wrap gap-2">
          {BADGES.map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={draft.badge === id}
              onClick={() => set({ badge: id })}
              className={cn(
                "flex w-[76px] flex-col items-center gap-1.5 rounded-lg p-2 text-xs transition-colors",
                draft.badge === id ? "bg-arc-tint font-medium text-arc-ink" : "text-ink-2 hover:bg-ink/5"
              )}
            >
              <CourseBadge badge={id} size={44} />
              {BADGE_LABEL[id]}
            </button>
          ))}
        </div>
      </Row>
      <Row label="Vragen stellen" hint="Een vraag bij een blok komt bij Cursussen → Vragen binnen.">
        <label className="flex items-center gap-2.5 sm:pt-1.5">
          <Switch checked={draft.questions} onCheckedChange={(questions) => set({ questions })} />
          <span className="text-ink text-sm">{draft.questions ? "Het team kan vragen stellen" : "Uit"}</span>
        </label>
      </Row>
    </div>
  )
}
