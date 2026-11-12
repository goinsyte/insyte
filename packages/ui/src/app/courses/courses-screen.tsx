import { useNavigate, useSearch } from "@tanstack/react-router"
import { Reorder, useDragControls } from "motion/react"
import { type ReactNode, useCallback, useMemo, useState } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "../../components/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "../../components/popover"
import { suppliers } from "../../data-source"
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Bell,
  Copy,
  Edit3,
  Eye,
  GripVertical,
  MoreHorizontal,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  Upload
} from "../../icons"
import { Gate } from "../access/gate"
import { useMyName, useNow } from "../ask/agent-parts"
import { EmptyPage } from "../common/empty-page"
import { EmptyState } from "../common/empty-state"
import { Field, FormDialog, TextField } from "../common/form-dialog"
import { PageGuide } from "../common/page-guide"
import { PageHeader } from "../common/page-header"
import { ME } from "../lib/assignees"
import { audienceLine, blockers, type Course, dayLabel, minutesOf, reaches, shareDone, stateOf } from "../lib/courses"
import { formatRelative } from "../lib/format"
import { undoable } from "../lib/undo"
import { cn } from "../lib/utils"
import { useGate } from "../stores/access-store"
import { useCourses } from "../stores/courses-store"
import { useOnCreate } from "../stores/create-intent"
import { useWorkspace } from "../stores/workspace-store"
import { PersonDisc, Segmented } from "../team/bits"
import { CourseBadge, CourseStatusPill, Meter, PersonStatePill, plural } from "./parts"

export type CoursesSearch = { view?: string }

const GUIDE = [
  {
    title: "Hoofdstukken, modules, cursussen",
    body: "Een hoofdstuk is een onderwerp, een module een stuk ervan. Sleep cursussen om de volgorde te kiezen.",
    art: "knowledge"
  },
  {
    title: "Wie wat moet volgen",
    body:
      "Per cursus kies je het team, bepaalde rollen of leveranciers, en een deadline. Onder Team zie je wie klaar is.",
    art: "people"
  }
] as const

/**
 * Cursussen (`/courses`, PLAN 39). The area panel picks the view: every course by chapter, your own,
 * drafts, the archive, the team's progress and the questions asked.
 */
export function CoursesPage() {
  const { view } = useSearch({ strict: false }) as CoursesSearch
  const courses = useCourses((s) => s.courses)
  const [creating, setCreating] = useState<{ chapterId?: string; moduleId?: string } | null>(null)
  const [chapterDialog, setChapterDialog] = useState(false)
  useOnCreate("course", useCallback(() => setCreating({}), []))
  const manage = useGate("team", 2)
  const navigate = useNavigate()

  const body: ReactNode = view === "mine" ?
    <MyCourses /> :
    view === "team" ?
    <TeamMatrix /> :
    view === "questions" ?
    <Questions /> :
    (
      <Catalogue
        statuses={view === "drafts" ? ["draft"] : view === "archived" ? ["archived"] : ["live", "draft"]}
        onAdd={(chapterId, moduleId) => setCreating({ chapterId, moduleId })}
      />
    )

  const title = {
    mine: "Mijn cursussen",
    team: "Voortgang van het team",
    questions: "Vragen",
    drafts: "Concepten",
    archived: "Archief"
  }[view ?? ""] ?? "Cursussen"
  const live = courses.filter((c) => c.status === "live").length
  const drafts = courses.filter((c) => c.status === "draft").length
  const open = useCourses((s) => s.questions.filter((q) => !q.answer).length)

  if (courses.length === 0 && view !== "mine") {
    return (
      <div className="flex min-w-0 flex-col">
        <PageHeader title="Cursussen" />
        <EmptyPage
          kind="courses"
          count="0 cursussen"
          title="Nog geen cursussen"
          body="Leer het team hoe jullie werken: hoe je klanten antwoordt, hoe je een bestelling doorstuurt, wat een chargeback nodig heeft. Een cursus is een korte reeks blokken met tekst, video, beeld en quizvragen."
          action={manage.ok ? { label: "Eerste cursus maken", onClick: () => setCreating({}) } : undefined}
          secondary={manage.ok ? { label: "Hoofdstuk toevoegen", onClick: () => setChapterDialog(true) } : undefined}
          starts={[
            {
              id: "kb",
              label: "Begin bij de kennisbank",
              body: "Wat de klantagent weet, moet het team ook weten.",
              to: "/settings/ai/knowledge"
            },
            {
              id: "team",
              label: "Kijk wie er in het team zit",
              body: "Per cursus kies je het hele team of bepaalde rollen.",
              to: "/settings/team"
            }
          ]}
        />
        <NewCourseDialog value={creating} onClose={() => setCreating(null)} />
        <ChapterDialog open={chapterDialog} onClose={() => setChapterDialog(false)} />
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        title={title}
        crumbs={view ? [{ label: "Cursussen", to: "/courses" }] : []}
        meta={view
          ? undefined
          : `${live} live · ${plural(drafts, "concept", "concepten")}${
            open ? ` · ${plural(open, "open vraag", "open vragen")}` : ""
          }`}
        actions={view === "mine" ? null : (
          <>
            <Gate perm="team" arg={2}>
              <button
                type="button"
                onClick={() => setChapterDialog(true)}
                className="field flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-ink text-sm transition-colors hover:field-hover"
              >
                <Plus className="size-3.5" strokeWidth={1.75} />
                Hoofdstuk
              </button>
            </Gate>
            <Gate perm="team" arg={2}>
              <button
                type="button"
                onClick={() => setCreating({})}
                className="flex h-8 items-center gap-1.5 rounded-md bg-abyss px-3 font-medium text-mesh-ink text-sm shadow-primary transition-colors hover:bg-abyss-2"
              >
                <Plus className="size-3.5" strokeWidth={2} />
                Nieuwe cursus
              </button>
            </Gate>
          </>
        )}
      />
      <div className="min-w-0 px-5 pb-10">{body}</div>
      <NewCourseDialog
        value={creating}
        onClose={() => setCreating(null)}
        onCreated={(c) => void navigate({ to: "/courses/$courseId", params: { courseId: c.id } })}
      />
      <ChapterDialog open={chapterDialog} onClose={() => setChapterDialog(false)} />
      <PageGuide id="courses" title="Cursussen" steps={GUIDE} />
    </div>
  )
}

/* ── the catalogue ─────────────────────────────────────────────────────────────────────────── */

function Catalogue(
  { statuses, onAdd }: {
    statuses: ReadonlyArray<Course["status"]>
    onAdd: (chapterId: string, moduleId: string) => void
  }
) {
  const chapters = useCourses((s) => s.chapters)
  const courses = useCourses((s) => s.courses)
  const shown = courses.filter((c) => statuses.includes(c.status))
  const manage = useGate("team", 2).ok
  const full = statuses.includes("live")

  if (shown.length === 0) {
    return (
      <EmptyState
        kind="courses"
        title={statuses[0] === "draft" ? "Geen concepten." : "Niets in het archief."}
        body={statuses[0] === "draft"
          ? "Een nieuwe cursus begint als concept tot je hem publiceert."
          : "Een cursus die je archiveert, verdwijnt bij het team maar de voortgang blijft bewaard."}
      />
    )
  }

  return (
    <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-w-0 flex-col gap-8">
        {chapters.map((ch, ci) => {
          const inChapter = shown.filter((c) => c.chapterId === ch.id)
          if (!full && inChapter.length === 0) return null
          return (
            <section key={ch.id} aria-labelledby={`ch-${ch.id}`} className="flex flex-col gap-3">
              <header className="flex items-center gap-2">
                <h2 id={`ch-${ch.id}`} className="font-medium text-ink text-lg">
                  {ch.title}
                </h2>
                <span className="text-ink-3 text-sm tabular-nums">
                  {plural(inChapter.length, "cursus", "cursussen")}
                </span>
                <span className="flex-1" />
                {manage ? <ChapterMenu id={ch.id} first={ci === 0} last={ci === chapters.length - 1} /> : null}
              </header>
              {ch.modules.map((m) => {
                const list = inChapter.filter((c) => c.moduleId === m.id)
                if (!full && list.length === 0) return null
                return (
                  <div key={m.id} className="flex flex-col gap-1.5">
                    <div className="flex h-7 items-center gap-2">
                      <h3 className="text-ink-3 text-sm">{m.title}</h3>
                      <span className="flex-1" />
                      {manage && full ?
                        (
                          <button
                            type="button"
                            onClick={() => onAdd(ch.id, m.id)}
                            className="flex h-7 items-center gap-1 rounded-md px-2 text-ink-3 text-sm transition-colors hover:bg-ink/6 hover:text-ink"
                          >
                            <Plus className="size-3.5" strokeWidth={1.75} />
                            Cursus
                          </button>
                        ) :
                        null}
                    </div>
                    {list.length ?
                      <CourseRows courses={list} draggable={manage && full} /> :
                      (
                        <button
                          type="button"
                          disabled={!manage}
                          onClick={() => onAdd(ch.id, m.id)}
                          className="hatch flex h-12 items-center rounded-lg px-4 text-left text-ink-3 text-sm transition-colors enabled:hover:text-ink"
                        >
                          Nog geen cursussen in {m.title.toLowerCase()}
                          {manage ? " · een cursus toevoegen" : ""}
                        </button>
                      )}
                  </div>
                )
              })}
            </section>
          )
        })}
      </div>
      {full ? <Aside /> : null}
    </div>
  )
}

function CourseRows({ courses, draggable }: { courses: Course[]; draggable: boolean }) {
  const order = useCourses((s) => s.orderCourses)
  const ids = courses.map((c) => c.id)
  return (
    <Reorder.Group
      as="ul"
      axis="y"
      values={ids}
      onReorder={(next: string[]) => order(next)}
      className="flex flex-col overflow-hidden rounded-xl bg-paper shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--ink)_9%,transparent)]"
    >
      {courses.map((c) => <CourseRow key={c.id} c={c} draggable={draggable} />)}
    </Reorder.Group>
  )
}

function CourseRow({ c, draggable }: { c: Course; draggable: boolean }) {
  const navigate = useNavigate()
  const controls = useDragControls()
  const members = useWorkspace((s) => s.members)
  const progress = useCourses((s) => s.progress)
  const now = useNow(60_000)
  const reached = members.filter((m) => m.status === "active" && reaches(c, m))
  const done =
    reached.filter((m) => stateOf(c, progress.find((p) => p.courseId === c.id && p.memberId === m.id), now) === "done")
      .length
  const late = c.deadline && Date.parse(`${c.deadline}T23:59:59`) < now && done < reached.length
  const open = () => void navigate({ to: "/courses/$courseId", params: { courseId: c.id } })
  return (
    <Reorder.Item
      value={c.id}
      dragListener={false}
      dragControls={controls}
      as="li"
      className="group/row relative grid cursor-pointer grid-cols-[20px_36px_minmax(0,1fr)_auto] items-center gap-x-3 bg-paper px-2 py-2.5 transition-colors odd:bg-mist/60 hover:bg-arc-tint/50 md:grid-cols-[20px_36px_minmax(0,1fr)_88px_150px_84px_32px]"
      onClick={open}
    >
      <span
        onPointerDown={(e) => {
          if (!draggable) return
          e.stopPropagation()
          controls.start(e)
        }}
        onClick={(e) => e.stopPropagation()}
        aria-hidden
        className={cn(
          "flex h-8 items-center justify-center text-ink-4 opacity-0 transition-opacity",
          draggable && "cursor-grab touch-none group-hover/row:opacity-100 active:cursor-grabbing"
        )}
      >
        {draggable ? <GripVertical className="size-4" strokeWidth={1.75} /> : null}
      </span>
      <CourseBadge badge={c.badge} size={36} earned={c.status === "live"} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium text-base text-ink">{c.title}</span>
        <span className="truncate text-ink-3 text-sm">
          {plural(c.blocks.length, "blok", "blokken")} · {minutesOf(c)} min · {audienceLine(c.audience, c.suppliers)}
        </span>
      </span>
      <span className="hidden md:block">
        <CourseStatusPill status={c.status} />
      </span>
      <span className="hidden flex-col gap-1 md:flex">
        {c.status === "live" ?
          (
            <>
              <span className="text-ink-2 text-sm tabular-nums">
                {done} van {reached.length} klaar
              </span>
              <Meter
                value={reached.length ? done / reached.length : 0}
                tone={done === reached.length && reached.length > 0 ? "green" : "ink"}
                className="w-28"
              />
            </>
          ) :
          c.status === "draft" ?
          (
            <span className="text-ink-3 text-sm">
              {blockers(c).length ? plural(blockers(c).length, "punt open", "punten open") : "Klaar om te publiceren"}
            </span>
          ) :
          <span className="text-ink-3 text-sm">Bewerkt {formatRelative(c.updatedAt)}</span>}
      </span>
      <span className={cn("hidden text-sm tabular-nums md:block", late ? "font-medium text-signal-red" : "text-ink-3")}>
        {c.deadline ? dayLabel(c.deadline) : "—"}
      </span>
      <span onClick={(e) => e.stopPropagation()}>
        <CourseMenu c={c} />
      </span>
    </Reorder.Item>
  )
}

export function CourseMenu({ c, onRemoved }: { c: Course; onRemoved?: () => void }) {
  const navigate = useNavigate()
  const me = useMyName()
  const manage = useGate("team", 2).ok
  const store = useCourses.getState
  const ready = blockers(c).length === 0
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Opties voor ${c.title}`}
          className="flex size-8 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink"
        >
          <MoreHorizontal className="size-4" strokeWidth={1.75} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {c.status === "live" ?
          (
            <DropdownMenuItem
              onClick={() => void navigate({ to: "/courses/learn/$courseId", params: { courseId: c.id } })}
            >
              <Play className="size-3.5" strokeWidth={1.75} />
              Volgen
            </DropdownMenuItem>
          ) :
          (
            <DropdownMenuItem
              onClick={() =>
                void navigate({
                  to: "/courses/learn/$courseId",
                  params: { courseId: c.id },
                  search: { preview: "1" } as never
                })}
            >
              <Eye className="size-3.5" strokeWidth={1.75} />
              Voorbeeld
            </DropdownMenuItem>
          )}
        {manage ?
          (
            <>
              <DropdownMenuItem onClick={() => void navigate({ to: "/courses/$courseId", params: { courseId: c.id } })}>
                <Edit3 className="size-3.5" strokeWidth={1.75} />
                Bewerken
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  const copy = store().duplicate(c.id, me)
                  if (copy) {
                    undoable(
                      `“${copy.title}” gemaakt`,
                      store().remove([copy.id]),
                      "Als concept, met dezelfde blokken."
                    )
                  }
                }}
              >
                <Copy className="size-3.5" strokeWidth={1.75} />
                Dupliceren
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {c.status === "draft" ?
                (
                  <DropdownMenuItem
                    disabled={!ready}
                    onClick={() =>
                      undoable(
                        `“${c.title}” gepubliceerd`,
                        store().setStatus([c.id], "live"),
                        "Het team ziet hem nu onder Mijn cursussen."
                      )}
                  >
                    <Upload className="size-3.5" strokeWidth={1.75} />
                    {ready ? "Publiceren" : "Nog niet klaar om te publiceren"}
                  </DropdownMenuItem>
                ) :
                null}
              {c.status === "live" ?
                (
                  <DropdownMenuItem
                    onClick={() =>
                      undoable(
                        `“${c.title}” terug naar concept`,
                        store().setStatus([c.id], "draft"),
                        "Het team ziet hem niet meer. De voortgang blijft bewaard."
                      )}
                  >
                    <RotateCcw className="size-3.5" strokeWidth={1.75} />
                    Publicatie intrekken
                  </DropdownMenuItem>
                ) :
                null}
              {c.status === "archived" ?
                (
                  <DropdownMenuItem
                    onClick={() => undoable(`“${c.title}” teruggezet als concept`, store().setStatus([c.id], "draft"))}
                  >
                    <RotateCcw className="size-3.5" strokeWidth={1.75} />
                    Terugzetten
                  </DropdownMenuItem>
                ) :
                (
                  <DropdownMenuItem
                    onClick={() =>
                      undoable(
                        `“${c.title}” gearchiveerd`,
                        store().setStatus([c.id], "archived"),
                        "De voortgang van het team blijft bewaard."
                      )}
                  >
                    <Archive className="size-3.5" strokeWidth={1.75} />
                    Archiveren
                  </DropdownMenuItem>
                )}
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  undoable(`“${c.title}” verwijderd`, store().remove([c.id]))
                  onRemoved?.()
                }}
              >
                <Trash2 className="size-3.5" strokeWidth={1.75} />
                Verwijderen
              </DropdownMenuItem>
            </>
          ) :
          null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ChapterMenu({ id, first, last }: { id: string; first: boolean; last: boolean }) {
  const ch = useCourses((s) => s.chapters.find((c) => c.id === id))
  const [dialog, setDialog] = useState<"rename" | "module" | null>(null)
  const [name, setName] = useState("")
  if (!ch) return null
  const move = (d: -1 | 1) => {
    const ids = useCourses.getState().chapters.map((c) => c.id)
    const i = ids.indexOf(id)
    const j = i + d
    ;[ids[i], ids[j]] = [ids[j]!, ids[i]!]
    useCourses.getState().orderChapters(ids)
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Opties voor ${ch.title}`}
            className="flex size-7 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink"
          >
            <MoreHorizontal className="size-4" strokeWidth={1.75} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            onClick={() => {
              setName(ch.title)
              setDialog("rename")
            }}
          >
            <Edit3 className="size-3.5" strokeWidth={1.75} />
            Hernoemen
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setName("")
              setDialog("module")
            }}
          >
            <Plus className="size-3.5" strokeWidth={1.75} />
            Module toevoegen
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={first} onClick={() => move(-1)}>
            <ArrowUp className="size-3.5" strokeWidth={1.75} />
            Omhoog
          </DropdownMenuItem>
          <DropdownMenuItem disabled={last} onClick={() => move(1)}>
            <ArrowDown className="size-3.5" strokeWidth={1.75} />
            Omlaag
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <FormDialog
        open={dialog !== null}
        onOpenChange={(v) => !v && setDialog(null)}
        title={dialog === "rename" ? "Hoofdstuk hernoemen" : `Module in ${ch.title}`}
        primaryLabel={dialog === "rename" ? "Opslaan" : "Module toevoegen"}
        disabled={!name.trim()}
        width={440}
        onSubmit={() => {
          if (dialog === "rename") undoable("Hoofdstuk hernoemd", useCourses.getState().renameChapter(id, name.trim()))
          else undoable(`Module “${name.trim()}” toegevoegd`, useCourses.getState().addModule(id, name.trim()).undo)
          setDialog(null)
        }}
      >
        <Field label="Naam">
          <TextField
            value={name}
            onChange={setName}
            placeholder={dialog === "module" ? "Bijvoorbeeld: Lastige gesprekken" : ""}
          />
        </Field>
      </FormDialog>
    </>
  )
}

/* ── the aside: what needs the owner ───────────────────────────────────────────────────────── */

function Aside() {
  const navigate = useNavigate()
  const allQuestions = useCourses((s) => s.questions)
  const questions = useMemo(() => allQuestions.filter((q) => !q.answer), [allQuestions])
  const courses = useCourses((s) => s.courses)
  const progress = useCourses((s) => s.progress)
  const members = useWorkspace((s) => s.members)
  const now = useNow(60_000)
  const behind = useMemo(
    () =>
      courses
        .filter((c) => c.status === "live" && c.deadline)
        .flatMap((c) =>
          members
            .filter((m) => m.status === "active" && reaches(c, m))
            .map((m) => ({
              m,
              c,
              state: stateOf(c, progress.find((p) => p.courseId === c.id && p.memberId === m.id), now)
            }))
            .filter((x) =>
              x.state === "late" ||
              (x.state !== "done" && Date.parse(`${x.c.deadline}T23:59:59`) - now < 3 * 86_400_000)
            )
        )
        .slice(0, 6),
    [courses, members, progress, now]
  )
  return (
    <aside className="flex flex-col gap-6 xl:sticky xl:top-4 xl:self-start">
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-base text-ink">Open vragen</h2>
          <button
            type="button"
            onClick={() => void navigate({ to: "/courses", search: { view: "questions" } as never })}
            className="text-arc-ink text-sm hover:underline"
          >
            Alle vragen
          </button>
        </div>
        {questions.length ?
          (
            <ul className="flex flex-col gap-1">
              {questions.slice(0, 3).map((q) => {
                const m = members.find((x) => x.id === q.memberId)
                const c = courses.find((x) => x.id === q.courseId)
                return (
                  <li key={q.id}>
                    <button
                      type="button"
                      onClick={() => void navigate({ to: "/courses", search: { view: "questions" } as never })}
                      className="flex w-full gap-2.5 rounded-lg bg-paper px-3 py-2.5 text-left transition-colors hover:bg-arc-tint/50"
                    >
                      <PersonDisc seed={q.memberId} name={m?.name ?? "?"} size={24} />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="line-clamp-2 text-ink text-sm">{q.text}</span>
                        <span className="truncate text-ink-3 text-xs">
                          {m?.name.split(" ")[0]} · {c?.title} · {formatRelative(q.at)}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) :
          <p className="rounded-lg bg-mist px-3 py-2.5 text-ink-3 text-sm">Geen open vragen.</p>}
      </section>
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-base text-ink">Deadline in zicht</h2>
          <button
            type="button"
            onClick={() => void navigate({ to: "/courses", search: { view: "team" } as never })}
            className="text-arc-ink text-sm hover:underline"
          >
            Voortgang
          </button>
        </div>
        {behind.length ?
          (
            <ul className="flex flex-col">
              {behind.map(({ m, c, state }) => (
                <li key={`${m.id}${c.id}`} className="flex items-center gap-2.5 rounded-lg px-1 py-1.5">
                  <PersonDisc seed={m.id} name={m.name} size={24} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-ink text-sm">{m.name}</span>
                    <span className="truncate text-ink-3 text-xs">
                      {c.title} · {dayLabel(c.deadline)}
                    </span>
                  </span>
                  {state === "late" ? <PersonStatePill state="late" /> : null}
                  <RemindButton name={m.name} course={c.title} />
                </li>
              ))}
            </ul>
          ) :
          <p className="rounded-lg bg-mist px-3 py-2.5 text-ink-3 text-sm">Niemand loopt achter.</p>}
      </section>
    </aside>
  )
}

function RemindButton({ name, course }: { name: string; course: string }) {
  const [sent, setSent] = useState(false)
  return (
    <button
      type="button"
      aria-label={`${name} herinneren aan ${course}`}
      title={sent ? "Herinnering gestuurd" : "Herinneren"}
      disabled={sent}
      onClick={() => {
        setSent(true)
        undoable(`Herinnering naar ${name.split(" ")[0]}`, () =>
          setSent(false), `Over “${course}”, in de app en per mail.`)
      }}
      className="flex size-7 shrink-0 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink disabled:text-signal-green"
    >
      <Bell className="size-3.5" strokeWidth={1.75} />
    </button>
  )
}

/* ── my courses ───────────────────────────────────────────────────────────────────────────── */

function MyCourses() {
  const navigate = useNavigate()
  const me = useWorkspace((s) => s.members.find((m) => m.id === ME))
  const courses = useCourses((s) => s.courses)
  const progress = useCourses((s) => s.progress)
  const now = useNow(60_000)
  const mine = useMemo(() => (me ? courses.filter((c) => reaches(c, me)) : []), [courses, me])
  const rows = mine.map((c) => {
    const p = progress.find((x) => x.courseId === c.id && x.memberId === ME)
    return { c, p, state: stateOf(c, p, now) }
  })
  const rank = { late: 0, busy: 1, todo: 2, failed: 3, done: 4 } as const
  const todo = rows.filter((r) => r.state !== "done").sort((a, b) => rank[a.state] - rank[b.state])
  const done = rows.filter((r) => r.state === "done")
  const next = todo[0]
  const learn = (id: string) => void navigate({ to: "/courses/learn/$courseId", params: { courseId: id } })

  if (rows.length === 0) {
    return (
      <EmptyState
        kind="courses"
        title="Er staat nog niets voor je klaar."
        body="Zodra een cursus voor jou gepubliceerd is, staat hij hier."
      />
    )
  }

  return (
    <div className="flex max-w-[880px] flex-col gap-8">
      {next ?
        (
          <section
            aria-label="Ga verder"
            className="plate relative flex flex-col gap-5 overflow-hidden rounded-xl p-6 sm:flex-row sm:items-center"
          >
            <span className="plate-scan" aria-hidden />
            <CourseBadge badge={next.c.badge} size={72} onPlate />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-mesh-ink-2 text-sm">
                {next.state === "busy"
                  ? "Ga verder waar je was"
                  : next.state === "late"
                  ? "Over de deadline"
                  : "Hierna"}
              </span>
              <h2 className="font-medium text-mesh-ink text-xl">{next.c.title}</h2>
              <p className="text-mesh-ink-2 text-sm">
                {next.p?.done.length ?? 0} van {plural(next.c.blocks.length, "blok", "blokken")} · {minutesOf(next.c)}
                {" "}
                min{next.c.deadline ? ` · deadline ${dayLabel(next.c.deadline)}` : ""}
              </p>
              <span className="mt-1 block h-1 w-full max-w-xs overflow-hidden rounded-full bg-mesh-ink/15">
                <span
                  className="block h-full rounded-full bg-mesh-ink"
                  style={{ width: `${Math.round(shareDone(next.c, next.p) * 100)}%` }}
                />
              </span>
            </div>
            <button
              type="button"
              onClick={() => learn(next.c.id)}
              className="flex h-10 items-center gap-2 self-start rounded-lg bg-paper px-4 font-medium text-abyss text-base transition-colors hover:bg-paper/90 sm:self-center"
            >
              <Play className="size-4" strokeWidth={1.75} />
              {next.state === "busy" ? "Verder" : "Beginnen"}
            </button>
          </section>
        ) :
        null}

      {todo.length > (next ? 1 : 0) ?
        (
          <section className="flex flex-col gap-2">
            <h2 className="font-medium text-base text-ink">Nog te doen</h2>
            <ul className="flex flex-col overflow-hidden rounded-xl bg-paper shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--ink)_9%,transparent)]">
              {todo.slice(next ? 1 : 0).map(({ c, p, state }) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => learn(c.id)}
                    className="grid w-full grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-arc-tint/50"
                  >
                    <CourseBadge badge={c.badge} size={36} earned={false} />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium text-base text-ink">{c.title}</span>
                      <span className="truncate text-ink-3 text-sm">
                        {minutesOf(c)} min{c.deadline ? ` · deadline ${dayLabel(c.deadline)}` : ""}
                      </span>
                    </span>
                    <PersonStatePill
                      state={state}
                      extra={state === "busy"
                        ? `${Math.round(shareDone(c, p) * 100)}%`
                        : state === "failed"
                        ? `${p?.score}%`
                        : undefined}
                    />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) :
        null}

      <section className="flex flex-col gap-3">
        <h2 className="font-medium text-base text-ink">
          Behaalde badges <span className="font-normal text-ink-3 tabular-nums">{done.length}</span>
        </h2>
        {done.length ?
          (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {done.map(({ c, p }) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => learn(c.id)}
                    className="flex w-full flex-col items-start gap-3 rounded-xl bg-paper p-4 text-left shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--ink)_9%,transparent)] transition-colors hover:bg-arc-tint/40"
                  >
                    <CourseBadge badge={c.badge} size={56} />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="line-clamp-2 font-medium text-ink text-sm">{c.title}</span>
                      <span className="text-ink-3 text-xs tabular-nums">
                        {p?.finishedAt ? dayLabel(p.finishedAt) : ""}
                        {p?.score !== undefined ? ` · ${p.score}%` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) :
          (
            <p className="hatch rounded-lg px-4 py-6 text-ink-3 text-sm">
              Rond een cursus af en zijn badge komt hier te staan.
            </p>
          )}
      </section>
    </div>
  )
}

/* ── the team ─────────────────────────────────────────────────────────────────────────────── */

function TeamMatrix() {
  const allCourses = useCourses((s) => s.courses)
  const courses = useMemo(() => allCourses.filter((c) => c.status === "live"), [allCourses])
  const progress = useCourses((s) => s.progress)
  const allMembers = useWorkspace((s) => s.members)
  /* The team, then any supplier a live course is open to: their progress is kept under their own id. */
  const members = useMemo(() => {
    const team = allMembers.filter((m) => m.status === "active").map((m) => ({
      id: m.id,
      name: m.name,
      role: m.role,
      reach: (c: Course) => reaches(c, m)
    }))
    const open = (c: Course, id: string) =>
      c.status === "live" &&
      (c.suppliers.kind === "all" || (c.suppliers.kind === "some" && c.suppliers.ids.includes(id)))
    const partners = suppliers.filter((sp) => allCourses.some((c) => open(c, sp.id))).map((sp) => ({
      id: sp.id,
      name: sp.name,
      role: "Leverancier",
      reach: (c: Course) => open(c, sp.id)
    }))
    return [...team, ...partners]
  }, [allMembers, allCourses])
  const now = useNow(60_000)
  if (courses.length === 0) {
    return (
      <EmptyState
        kind="courses"
        title="Nog geen live cursussen."
        body="Publiceer een cursus, dan zie je hier wie hem gevolgd heeft."
      />
    )
  }
  const totals = courses.map((c) => {
    const reached = members.filter((m) => m.reach(c))
    const done = reached.filter((m) =>
      stateOf(
        c,
        progress.find((p) => p.courseId === c.id && p.memberId === m.id),
        now
      ) === "done"
    ).length
    return { done, of: reached.length }
  })
  return (
    <div className="table-scroll rounded-xl bg-paper shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--ink)_9%,transparent)]">
      <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
        <thead>
          <tr className="align-bottom">
            <th
              scope="col"
              className="sticky left-0 z-10 min-w-[220px] bg-mist px-3 py-2 text-left font-medium text-ink-3 text-xs"
            >
              Naam
            </th>
            <th scope="col" className="bg-mist px-3 py-2 text-left font-medium text-ink-3 text-xs">
              Klaar
            </th>
            {courses.map((c, i) => (
              <th key={c.id} scope="col" className="w-[150px] bg-mist px-3 py-2 text-left font-medium text-xs">
                <span className="line-clamp-2 text-ink-2" title={c.title}>
                  {c.title}
                </span>
                <span className="font-normal text-ink-3 tabular-nums">
                  {totals[i]!.done} van {totals[i]!.of}
                  {c.deadline ? ` · ${dayLabel(c.deadline)}` : ""}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {members.map((m, row) => {
            const mine = courses.filter((c) => m.reach(c))
            const doneN = mine.filter((c) =>
              stateOf(
                c,
                progress.find((p) => p.courseId === c.id && p.memberId === m.id),
                now
              ) === "done"
            ).length
            const band = row % 2 ? "bg-mist/60" : "bg-paper"
            return (
              <tr key={m.id}>
                <th scope="row" className={cn("sticky left-0 z-10 px-3 py-2 text-left font-normal", band)}>
                  <span className="flex items-center gap-2.5">
                    <PersonDisc seed={m.id} name={m.name} size={26} />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-ink">{m.name}</span>
                      <span className="truncate text-ink-3 text-xs">{m.role}</span>
                    </span>
                  </span>
                </th>
                <td className={cn("px-3 py-2", band)}>
                  <span className="flex flex-col gap-1">
                    <span className="text-ink-2 tabular-nums">
                      {doneN} van {mine.length}
                    </span>
                    <Meter
                      value={mine.length ? doneN / mine.length : 0}
                      tone={doneN === mine.length && mine.length > 0 ? "green" : "ink"}
                      className="w-16"
                    />
                  </span>
                </td>
                {courses.map((c) =>
                  m.reach(c) ?
                    (
                      <td key={c.id} className={cn("px-2 py-1.5", band)}>
                        <ProgressCell c={c} memberId={m.id} name={m.name} />
                      </td>
                    ) :
                    (
                      <td key={c.id} className={cn("px-2 py-1.5", band)}>
                        <span
                          className="hatch block h-8 rounded-md"
                          title="Niet voor deze persoon"
                          aria-label="Niet voor deze persoon"
                        />
                      </td>
                    )
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ProgressCell({ c, memberId, name }: { c: Course; memberId: string; name: string }) {
  const p = useCourses((s) => s.progress.find((x) => x.courseId === c.id && x.memberId === memberId))
  const now = useNow(60_000)
  const state = stateOf(c, p, now)
  const extra = state === "busy"
    ? `${Math.round(shareDone(c, p) * 100)}%`
    : state === "failed" || (state === "done" && p?.score !== undefined && p.score < 100)
    ? `${p?.score}%`
    : undefined
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${name}, ${c.title}`}
          className="flex h-8 w-full items-center rounded-md px-1.5 transition-colors hover:bg-ink/5"
        >
          {state === "todo" ? <span className="text-ink-3">—</span> : <PersonStatePill state={state} extra={extra} />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-2.5">
            <PersonDisc seed={memberId} name={name} size={28} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium text-ink text-sm">{name}</span>
              <span className="truncate text-ink-3 text-xs">{c.title}</span>
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-ink-3">Blokken</dt>
            <dd className="text-ink tabular-nums">
              {p?.done.length ?? 0} van {c.blocks.length}
            </dd>
            <dt className="text-ink-3">Pogingen</dt>
            <dd className="text-ink tabular-nums">{p?.attempts ?? 0}</dd>
            <dt className="text-ink-3">Score</dt>
            <dd className="text-ink tabular-nums">
              {p?.score !== undefined ? `${p.score}% (grens ${c.passMark}%)` : "—"}
            </dd>
            <dt className="text-ink-3">{p?.finishedAt ? "Klaar op" : "Begonnen"}</dt>
            <dd className="text-ink tabular-nums">
              {p?.finishedAt ? dayLabel(p.finishedAt) : p ? dayLabel(p.startedAt) : "Nog niet"}
            </dd>
          </dl>
        </div>
        <div className="flex items-center gap-1 bg-mist px-2 py-2">
          {state !== "done" ? <RemindButtonWide name={name} course={c.title} /> : null}
          {p ?
            (
              <Gate perm="team" arg={2}>
                <button
                  type="button"
                  onClick={() =>
                    undoable(
                      `Voortgang van ${name.split(" ")[0]} gewist`,
                      useCourses.getState().reset(c.id, memberId),
                      "Hij of zij begint opnieuw bij het eerste blok."
                    )}
                  className="flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-ink-2 text-sm transition-colors hover:bg-ink/6 hover:text-ink"
                >
                  <RotateCcw className="size-3.5" strokeWidth={1.75} />
                  Opnieuw laten doen
                </button>
              </Gate>
            ) :
            null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function RemindButtonWide({ name, course }: { name: string; course: string }) {
  const [sent, setSent] = useState(false)
  return (
    <button
      type="button"
      disabled={sent}
      onClick={() => {
        setSent(true)
        undoable(`Herinnering naar ${name.split(" ")[0]}`, () =>
          setSent(false), `Over “${course}”, in de app en per mail.`)
      }}
      className="flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-ink-2 text-sm transition-colors hover:bg-ink/6 hover:text-ink disabled:text-ink-3"
    >
      <Bell className="size-3.5" strokeWidth={1.75} />
      {sent ? "Herinnerd" : "Herinneren"}
    </button>
  )
}

/* ── questions ───────────────────────────────────────────────────────────────────────────── */

function Questions() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<"open" | "answered">("open")
  const questions = useCourses((s) => s.questions)
  const courses = useCourses((s) => s.courses)
  const members = useWorkspace((s) => s.members)
  const me = useMyName()
  const manage = useGate("team", 2).ok
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const list = questions.filter((q) => (tab === "open" ? !q.answer : !!q.answer))
  return (
    <div className="flex max-w-[760px] flex-col gap-4">
      <Segmented
        label="Vragen"
        value={tab}
        onChange={setTab}
        options={[
          { id: "open", label: `Open · ${questions.filter((q) => !q.answer).length}` },
          { id: "answered", label: `Beantwoord · ${questions.filter((q) => q.answer).length}` }
        ]}
      />
      {list.length === 0 ?
        (
          <EmptyState
            kind="courses"
            title={tab === "open" ? "Geen open vragen." : "Nog niets beantwoord."}
            body={tab === "open"
              ? "Vragen die het team stelt bij een blok komen hier binnen."
              : "Een antwoord blijft bij het blok staan voor wie de cursus later volgt."}
          />
        ) :
        (
          <ul className="flex flex-col gap-3">
            {list.map((q) => {
              const m = members.find((x) => x.id === q.memberId)
              const c = courses.find((x) => x.id === q.courseId)
              const block = c?.blocks.find((b) => b.id === q.blockId)
              const blockTitle = block ? (block.kind === "quiz" ? block.question : block.title) : undefined
              const draft = drafts[q.id] ?? ""
              return (
                <li
                  key={q.id}
                  className="flex flex-col gap-3 rounded-xl bg-paper p-4 shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--ink)_9%,transparent)]"
                >
                  <div className="flex items-start gap-3">
                    <PersonDisc seed={q.memberId} name={m?.name ?? "?"} size={30} />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="text-ink-3 text-sm">
                        <span className="font-medium text-ink">{m?.name ?? "Iemand"}</span> bij{" "}
                        <button
                          type="button"
                          onClick={() =>
                            c &&
                            navigate({
                              to: "/courses/learn/$courseId",
                              params: { courseId: c.id },
                              search: { preview: "1", block: q.blockId } as never
                            })}
                          className="text-arc-ink hover:underline"
                        >
                          {c?.title ?? "een verwijderde cursus"}
                        </button>
                        {blockTitle ? ` · ${blockTitle}` : ""} · {formatRelative(q.at)}
                      </span>
                      <p className="text-base text-ink leading-[1.55]">{q.text}</p>
                    </div>
                  </div>
                  {q.answer ?
                    (
                      <div className="ml-[42px] rounded-lg bg-mist px-3.5 py-2.5">
                        <span className="text-ink-3 text-xs">{q.answeredBy} antwoordde</span>
                        <p className="text-ink text-sm leading-[1.55]">{q.answer}</p>
                      </div>
                    ) :
                    manage ?
                    (
                      <div className="ml-[42px] flex flex-col gap-2">
                        <textarea
                          value={draft}
                          onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: e.target.value }))}
                          rows={2}
                          aria-label={`Antwoord aan ${m?.name ?? "teamlid"}`}
                          placeholder="Je antwoord. Het blijft bij het blok staan voor wie de cursus later volgt."
                          className="field w-full resize-y rounded-md px-3 py-2 text-base text-ink outline-none placeholder:text-ink-3 focus:bg-paper"
                        />
                        <div className="flex justify-end">
                          <button
                            type="button"
                            disabled={!draft.trim()}
                            onClick={() => {
                              undoable(
                                `Antwoord naar ${m?.name.split(" ")[0] ?? "teamlid"}`,
                                useCourses.getState().answer(q.id, draft.trim(), me)
                              )
                              setDrafts((d) => ({ ...d, [q.id]: "" }))
                            }}
                            className="flex h-8 items-center rounded-md bg-abyss px-3 font-medium text-mesh-ink text-sm shadow-primary transition-colors hover:bg-abyss-2 disabled:opacity-45"
                          >
                            Antwoorden
                          </button>
                        </div>
                      </div>
                    ) :
                    null}
                </li>
              )
            })}
          </ul>
        )}
    </div>
  )
}

/* ── dialogs ─────────────────────────────────────────────────────────────────────────────── */

function NewCourseDialog(
  { value, onClose, onCreated }: {
    value: { chapterId?: string; moduleId?: string } | null
    onClose: () => void
    onCreated?: (c: Course) => void
  }
) {
  const chapters = useCourses((s) => s.chapters)
  const me = useMyName()
  const navigate = useNavigate()
  const [title, setTitle] = useState("")
  const [chapterId, setChapterId] = useState("")
  const [moduleId, setModuleId] = useState("")
  const [newChapter, setNewChapter] = useState("")
  const open = value !== null
  const ch = chapters.find((c) => c.id === (chapterId || value?.chapterId)) ?? chapters[0]
  const mod = ch?.modules.find((m) => m.id === (moduleId || value?.moduleId)) ?? ch?.modules[0]
  const needsChapter = chapters.length === 0
  const reset = () => {
    setTitle("")
    setChapterId("")
    setModuleId("")
    setNewChapter("")
  }
  return (
    <FormDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          reset()
          onClose()
        }
      }}
      title="Nieuwe cursus"
      description="Een naam en een plek. De inhoud schrijf je daarna."
      primaryLabel="Cursus maken"
      disabled={!title.trim() || (needsChapter ? !newChapter.trim() : !ch || !mod)}
      width={480}
      onSubmit={() => {
        const store = useCourses.getState()
        let cid: string | undefined = ch?.id
        let mid: string | undefined = mod?.id
        if (needsChapter) {
          cid = store.addChapter(newChapter.trim()).id
          mid = useCourses.getState().chapters.find((c) => c.id === cid)?.modules[0]?.id
        }
        if (!cid || !mid) return
        const c = store.create({ title: title.trim(), chapterId: cid, moduleId: mid }, me)
        reset()
        onClose()
        if (onCreated) onCreated(c)
        else void navigate({ to: "/courses/$courseId", params: { courseId: c.id } })
      }}
    >
      <Field label="Naam">
        <TextField value={title} onChange={setTitle} placeholder="Bijvoorbeeld: Zo antwoorden we klanten" />
      </Field>
      {needsChapter ?
        (
          <Field label="Hoofdstuk">
            <TextField value={newChapter} onChange={setNewChapter} placeholder="Bijvoorbeeld: Klantenservice" />
          </Field>
        ) :
        (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hoofdstuk">
              <select
                value={ch?.id ?? ""}
                onChange={(e) => {
                  setChapterId(e.target.value)
                  setModuleId("")
                }}
                className="field h-9 w-full rounded-md px-2.5 text-base text-ink outline-none focus:bg-paper"
              >
                {chapters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Module">
              <select
                value={mod?.id ?? ""}
                onChange={(e) => setModuleId(e.target.value)}
                className="field h-9 w-full rounded-md px-2.5 text-base text-ink outline-none focus:bg-paper"
              >
                {ch?.modules.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
    </FormDialog>
  )
}

function ChapterDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
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
      title="Nieuw hoofdstuk"
      description="Een onderwerp, zoals Klantenservice of Bestellingen. Het krijgt meteen een eerste module."
      primaryLabel="Hoofdstuk toevoegen"
      disabled={!name.trim()}
      width={440}
      onSubmit={() => {
        undoable(`Hoofdstuk “${name.trim()}” toegevoegd`, useCourses.getState().addChapter(name.trim()).undo)
        setName("")
        onClose()
      }}
    >
      <Field label="Naam">
        <TextField value={name} onChange={setName} placeholder="Bijvoorbeeld: Klantenservice" />
      </Field>
    </FormDialog>
  )
}
