import { useNavigate, useParams, useSearch } from "@tanstack/react-router"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Edit3, Lock, MessageSquare, RotateCcw, X } from "../../icons"
import { Markdown } from "../ai/article-screen"
import { EmptyState } from "../common/empty-state"
import { Field, FormDialog, TextAreaField } from "../common/form-dialog"
import { PageHeader } from "../common/page-header"
import { ME } from "../lib/assignees"
import { type Block, BLOCK_LABEL, type Course, type Progress, quizzesOf, videoHost } from "../lib/courses"
import { undoable } from "../lib/undo"
import { cn } from "../lib/utils"
import { useCourses } from "../stores/courses-store"
import { useWorkspace } from "../stores/workspace-store"
import { VideoFrame } from "./course-editor"
import { BLOCK_GLYPH, CourseBadge, Meter, plural } from "./parts"

export type PlayerSearch = { preview?: string; block?: string }

/** `/courses/learn/$courseId`: the admin's own seat. The supplier portal mounts the same player. */
export function CoursePlayerPage() {
  const { courseId } = useParams({ strict: false }) as { courseId?: string }
  const { preview, block } = useSearch({ strict: false }) as PlayerSearch
  return (
    <CoursePlayer
      courseId={courseId ?? ""}
      memberId={ME}
      preview={preview === "1"}
      startAt={block}
      back={{ label: "Mijn cursussen", to: "/courses", search: { view: "mine" } }}
      crumbs={[{ label: "Cursussen", to: "/courses" }]}
    />
  )
}

type Back = { label: string; to: string; search?: Record<string, string> }

/**
 * A course, read. The outline on the left marks what is done and, in a fixed order, what is still
 * locked; the column reads one block at a time. A question is checked, not just picked, and says
 * why. The end is a plate: the badge, the score, and a title block with who, what and when.
 */
export function CoursePlayer(
  { courseId, memberId, name, preview, startAt, back, crumbs }: {
    courseId: string
    memberId: string
    name?: string
    preview: boolean
    startAt?: string
    back: Back
    crumbs: ReadonlyArray<{ label: string; to?: string }>
  }
) {
  const navigate = useNavigate()
  const c = useCourses((s) => s.courses.find((x) => x.id === courseId))
  const stored = useCourses((s) => s.progress.find((p) => p.courseId === courseId && p.memberId === memberId))
  const [local, setLocal] = useState<Progress>({
    courseId,
    memberId,
    done: [],
    answers: {},
    attempts: 0,
    startedAt: new Date().toISOString()
  })
  const p = preview ? local : stored
  const [at, setAt] = useState(() => {
    if (!c) return 0
    const want = startAt ? c.blocks.findIndex((b) => b.id === startAt) : -1
    if (want >= 0) return want
    const first = c.blocks.findIndex((b) => !stored?.done.includes(b.id))
    return first < 0 ? 0 : first
  })
  const [asking, setAsking] = useState(false)
  const [result, setResult] = useState<number | null>(null)
  const goBack = () => void navigate({ to: back.to, search: back.search as never })

  if (!c) {
    return (
      <div className="flex min-w-0 flex-col">
        <PageHeader title="Cursus" crumbs={crumbs} />
        <EmptyState
          kind="courses"
          title="Deze cursus bestaat niet (meer)."
          body="Kijk bij je cursussen wat er voor je klaarstaat."
        />
      </div>
    )
  }

  const step = (blockId: string, answer?: string) => {
    if (preview) {
      setLocal((l) => ({
        ...l,
        done: l.done.includes(blockId) ? l.done : [...l.done, blockId],
        answers: answer === undefined ? l.answers : { ...l.answers, [blockId]: answer }
      }))
    } else useCourses.getState().step(c.id, memberId, blockId, answer)
  }
  const finish = () => {
    let score: number
    if (preview) {
      const qs = quizzesOf(c)
      score = qs.length
        ? Math.round((qs.filter((q) => local.answers[q.id] === q.correct).length / qs.length) * 100)
        : 100
      setLocal((l) => ({ ...l, finishedAt: new Date().toISOString(), score, attempts: l.attempts + 1 }))
    } else score = useCourses.getState().finish(c.id, memberId)
    setResult(score)
  }
  const retake = () => {
    if (preview) setLocal((l) => ({ ...l, done: [], answers: {}, finishedAt: undefined }))
    else useCourses.getState().retake(c.id, memberId)
    setResult(null)
    setAt(0)
  }

  const done = new Set(p?.done ?? [])
  const unlocked = (i: number) => c.order === "free" || c.blocks.slice(0, i).every((b) => done.has(b.id))
  const block = c.blocks[at]
  const finished = !!p?.finishedAt
  const showResult = (result !== null && result >= 0) || (finished && result === null && !startAt && !preview)
  const allDone = c.blocks.every((b) => done.has(b.id))

  return (
    <div className="flex min-w-0 flex-col">
      <PageHeader
        title={c.title}
        crumbs={[...crumbs, { label: back.label, to: back.to }]}
        meta={
          <span className="text-ink-3 text-sm tabular-nums">
            {done.size} van {plural(c.blocks.length, "blok", "blokken")}
          </span>
        }
        actions={
          <>
            {c.questions && !preview ?
              (
                <button
                  type="button"
                  onClick={() => setAsking(true)}
                  className="field flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-ink text-sm transition-colors hover:field-hover"
                >
                  <MessageSquare className="size-3.5" strokeWidth={1.75} />
                  Stel een vraag
                </button>
              ) :
              null}
            <button
              type="button"
              onClick={goBack}
              aria-label="Sluiten"
              className="flex size-8 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink"
            >
              <X className="size-4" strokeWidth={1.75} />
            </button>
          </>
        }
      />
      {preview ?
        (
          <p className="mx-5 mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-arc-tint px-3.5 py-2 text-ink text-sm">
            <span className="min-w-0 flex-1">
              <span className="font-medium">Voorbeeld.</span>{" "}
              Zo ziet het team de cursus. Je voortgang wordt niet bewaard.
            </span>
            <button
              type="button"
              onClick={() => void navigate({ to: "/courses/$courseId", params: { courseId: c.id } })}
              className="flex h-7 items-center gap-1.5 rounded-md bg-paper px-2.5 font-medium text-arc-ink text-sm hover:bg-paper/80"
            >
              <Edit3 className="size-3.5" strokeWidth={1.75} />
              Terug naar bewerken
            </button>
          </p>
        ) :
        null}

      {c.blocks.length === 0 ?
        (
          <EmptyState
            kind="courses"
            title="Deze cursus heeft nog geen blokken."
            body="Voeg in de editor een tekst, video, afbeelding of quizvraag toe."
          />
        ) :
        showResult ?
        (
          <div className="px-5 pb-16">
            <Certificate
              c={c}
              name={name}
              score={result !== null && result >= 0 ? result : (p?.score ?? 100)}
              memberId={memberId}
              at={p?.finishedAt}
              onBack={goBack}
              onRetake={retake}
              onReview={() => setResult(-1)}
            />
          </div>
        ) :
        (
          <div className="grid grid-cols-1 gap-8 px-5 pb-16 lg:grid-cols-[240px_minmax(0,680px)] lg:gap-12">
            <nav aria-label="Blokken" className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
              <div className="flex flex-col gap-1.5">
                <Meter value={c.blocks.length ? done.size / c.blocks.length : 0} tone={allDone ? "green" : "arc"} />
                <span className="text-ink-3 text-xs tabular-nums">
                  {Math.round((done.size / c.blocks.length) * 100)}% ·{" "}
                  {c.order === "fixed" ? "blok voor blok" : "vrije volgorde"}
                </span>
              </div>
              <ol className="flex flex-col gap-0.5">
                {c.blocks.map((b, i) => {
                  const G = BLOCK_GLYPH[b.kind]
                  const open = unlocked(i)
                  const isDone = done.has(b.id)
                  return (
                    <li key={b.id}>
                      <button
                        type="button"
                        disabled={!open}
                        aria-current={i === at ? "step" : undefined}
                        onClick={() => setAt(i)}
                        className={cn(
                          "flex min-h-8 w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition-colors disabled:cursor-not-allowed",
                          i === at
                            ? "bg-arc-tint font-medium text-arc-ink"
                            : open
                            ? "text-ink-2 hover:bg-ink/5 hover:text-ink"
                            : "text-ink-3"
                        )}
                      >
                        <span className="flex size-4 shrink-0 items-center justify-center">
                          {isDone
                            ? <CheckCircle2 className="size-4 text-signal-green" strokeWidth={1.75} />
                            : open
                            ? <G className="size-3.5" strokeWidth={1.75} />
                            : <Lock className="size-3.5" strokeWidth={1.75} />}
                        </span>
                        <span className="line-clamp-2">
                          {(b.kind === "quiz" ? b.question : b.title) || BLOCK_LABEL[b.kind]}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            </nav>

            <div className="flex min-w-0 flex-col gap-8">
              <AnimatePresence mode="wait" initial={false}>
                {block ?
                  (
                    <BlockView
                      key={block.id}
                      b={block}
                      i={at}
                      n={c.blocks.length}
                      answer={p?.answers[block.id]}
                      done={done.has(block.id)}
                      onStep={(answer) => step(block.id, answer)}
                      courseId={c.id}
                    />
                  ) :
                  null}
              </AnimatePresence>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={at === 0}
                  onClick={() => setAt(at - 1)}
                  className="flex h-9 items-center gap-1.5 rounded-lg px-3 font-medium text-base text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink disabled:opacity-40"
                >
                  <ArrowLeft className="size-4" strokeWidth={1.75} />
                  Vorige
                </button>
                <span className="flex-1" />
                {block && block.kind === "quiz" && !done.has(block.id) ?
                  <span className="text-ink-3 text-sm">Controleer je antwoord om verder te gaan</span> :
                  at < c.blocks.length - 1 ?
                  (
                    <button
                      type="button"
                      disabled={block?.kind === "video" && !done.has(block.id) && c.order === "fixed"}
                      onClick={() => {
                        if (block && block.kind !== "quiz") step(block.id)
                        setAt(at + 1)
                      }}
                      className="flex h-9 items-center gap-1.5 rounded-lg bg-abyss px-3.5 font-medium text-base text-mesh-ink shadow-primary transition-colors hover:bg-abyss-2 disabled:opacity-45"
                    >
                      Volgende
                      <ArrowRight className="size-4" strokeWidth={1.75} />
                    </button>
                  ) :
                  (
                    <button
                      type="button"
                      disabled={!c.blocks.every((b) =>
                        done.has(b.id) || (b.id === block?.id && b.kind !== "quiz" && b.kind !== "video")
                      )}
                      onClick={() => {
                        if (block && block.kind !== "quiz") step(block.id)
                        finish()
                      }}
                      className="flex h-9 items-center gap-1.5 rounded-lg bg-abyss px-3.5 font-medium text-base text-mesh-ink shadow-primary transition-colors hover:bg-abyss-2 disabled:opacity-45"
                      title={allDone ? undefined : "Rond eerst elk blok af"}
                    >
                      <Check className="size-4" strokeWidth={2} />
                      Afronden
                    </button>
                  )}
              </div>
            </div>
          </div>
        )}
      <AskDialog open={asking} onClose={() => setAsking(false)} c={c} memberId={memberId} blockId={block?.id} />
    </div>
  )
}

function BlockView(
  { b, i, n, answer, done, onStep, courseId }: {
    b: Block
    i: number
    n: number
    answer?: string
    done: boolean
    onStep: (answer?: string) => void
    courseId: string
  }
) {
  const still = useReducedMotion()
  const questions = useCourses((s) => s.questions)
  const answers = useMemo(() => questions.filter((q) => q.courseId === courseId && q.blockId === b.id && q.answer), [
    questions,
    courseId,
    b.id
  ])
  const members = useWorkspace((s) => s.members)
  return (
    <motion.article
      initial={still ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={still ? undefined : { opacity: 0, y: -4 }}
      transition={{ duration: 0.16, ease: [0.25, 1, 0.5, 1] }}
      className="flex flex-col gap-5"
    >
      <span className="text-ink-3 text-sm tabular-nums">
        {BLOCK_LABEL[b.kind]} · {i + 1} van {n}
      </span>
      {b.kind === "text" ?
        (
          <>
            {b.title ? <h2 className="font-medium text-ink text-xl">{b.title}</h2> : null}
            <Markdown text={b.body} />
          </>
        ) :
        b.kind === "video" ?
        <VideoPlayer b={b} done={done} onDone={() => onStep()} /> :
        b.kind === "image" ?
        (
          <figure className="flex flex-col gap-3">
            {b.title ? <h2 className="font-medium text-ink text-xl">{b.title}</h2> : null}
            {b.src
              ? <img src={b.src} alt={b.title} className="w-full rounded-xl bg-mist object-cover" />
              : <div className="hatch aspect-video rounded-xl" />}
            {b.caption ? <figcaption className="text-ink-2 text-sm leading-[1.55]">{b.caption}</figcaption> : null}
          </figure>
        ) :
        <QuizView b={b} answer={answer} checked={done} onCheck={(a) => onStep(a)} />}
      {answers.length ?
        (
          <section aria-label="Vragen van het team" className="flex flex-col gap-2">
            <h3 className="font-medium text-ink-2 text-sm">Gevraagd bij dit blok</h3>
            {answers.map((q) => (
              <div key={q.id} className="flex flex-col gap-1 rounded-lg bg-mist px-3.5 py-2.5 text-sm">
                <span className="text-ink">
                  <span className="text-ink-3">
                    {members.find((m) =>
                      m.id === q.memberId
                    )?.name.split(" ")[0] ?? "Iemand"}:
                  </span>
                  {q.text}
                </span>
                <span className="text-ink-2">
                  <span className="text-ink-3">{q.answeredBy}:</span>
                  {q.answer}
                </span>
              </div>
            ))}
          </section>
        ) :
        null}
    </motion.article>
  )
}

/* The host's player is not embedded in the reference; playing runs the bar over a few seconds. */
function VideoPlayer({ b, done, onDone }: { b: Extract<Block, { kind: "video" }>; done: boolean; onDone: () => void }) {
  const [progress, setProgress] = useState(done ? 1 : 0)
  const [playing, setPlaying] = useState(false)
  const timer = useRef<number | null>(null)
  useEffect(() => () => (timer.current ? window.clearInterval(timer.current) : undefined), [])
  const play = () => {
    if (playing) {
      if (timer.current) window.clearInterval(timer.current)
      setPlaying(false)
      return
    }
    setPlaying(true)
    timer.current = window.setInterval(() => {
      setProgress((x) => {
        const next = Math.min(1, x + 0.04)
        if (next >= 1) {
          if (timer.current) window.clearInterval(timer.current)
          setPlaying(false)
          onDone()
        }
        return next
      })
    }, 160)
  }
  return (
    <div className="flex flex-col gap-3">
      {b.title ? <h2 className="font-medium text-ink text-xl">{b.title}</h2> : null}
      <VideoFrame
        title={b.title}
        host={videoHost(b.url)}
        minutes={b.minutes}
        playing={playing}
        progress={progress}
        onPlay={play}
      />
      <div className="flex items-center gap-3 text-sm">
        <a href={b.url} target="_blank" rel="noopener noreferrer" className="text-arc-ink hover:underline">
          Openen op {videoHost(b.url) || "de site"}
        </a>
        <span className="flex-1" />
        {done ?
          (
            <span className="flex items-center gap-1.5 text-ink-2">
              <CheckCircle2 className="size-3.5 text-signal-green" strokeWidth={1.75} />
              Bekeken
            </span>
          ) :
          (
            <button
              type="button"
              onClick={() => {
                setProgress(1)
                onDone()
              }}
              className="text-ink-2 hover:text-ink"
            >
              Al gezien
            </button>
          )}
      </div>
    </div>
  )
}

function QuizView(
  { b, answer, checked, onCheck }: {
    b: Extract<Block, { kind: "quiz" }>
    answer?: string
    checked: boolean
    onCheck: (a: string) => void
  }
) {
  const [pick, setPick] = useState<string | undefined>(answer)
  const right = checked && pick === b.correct
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-medium text-ink text-xl">{b.question}</h2>
      <div role="radiogroup" aria-label={b.question} className="flex flex-col gap-2">
        {b.options.map((o, i) => {
          const on = pick === o.id
          const isRight = o.id === b.correct
          const tone = checked
            ? (isRight ? "bg-signal-green-bg text-ink" : on ? "bg-signal-red-bg text-ink" : "bg-paper text-ink-3")
            : on
            ? "bg-arc-tint text-arc-ink"
            : "bg-paper text-ink hover:bg-ink/4"
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={checked}
              onClick={() => setPick(o.id)}
              className={cn(
                "flex min-h-12 items-center gap-3 rounded-lg px-4 py-2.5 text-left text-base shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--ink)_9%,transparent)] transition-colors",
                tone
              )}
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-md font-medium text-xs tabular-nums",
                  on ? "bg-abyss text-mesh-ink" : "bg-ink/6 text-ink-2"
                )}
              >
                {String.fromCharCode(65 + i)}
              </span>
              <span className="flex-1">{o.text}</span>
              {checked && isRight
                ? <span className="font-medium text-signal-green text-sm">Goed</span>
                : checked && on
                ? <span className="font-medium text-signal-red text-sm">Niet goed</span>
                : null}
            </button>
          )
        })}
      </div>
      {checked ?
        (
          <p
            className={cn(
              "rounded-lg px-4 py-3 text-base leading-[1.55]",
              right ? "bg-signal-green-bg text-ink" : "bg-mist text-ink"
            )}
          >
            <span className="font-medium">{right ? "Goed. " : "Het goede antwoord staat groen. "}</span>
            {b.explain}
          </p>
        ) :
        (
          <button
            type="button"
            disabled={!pick}
            onClick={() => pick && onCheck(pick)}
            className="flex h-9 w-fit items-center gap-1.5 rounded-lg bg-abyss px-3.5 font-medium text-base text-mesh-ink shadow-primary transition-colors hover:bg-abyss-2 disabled:opacity-45"
          >
            Controleren
          </button>
        )}
    </div>
  )
}

/* ── the end: a plate ─────────────────────────────────────────────────────────────────────── */

function Certificate(
  { c, name, score, memberId, at, onBack, onRetake, onReview }: {
    c: Course
    name?: string
    score: number
    memberId: string
    at?: string
    onBack: () => void
    onRetake: () => void
    onReview: () => void
  }
) {
  const still = useReducedMotion()
  const member = useWorkspace((s) => s.members.find((m) => m.id === memberId))
  const passed = score >= c.passMark || quizzesOf(c).length === 0
  const date = useMemo(
    () =>
      new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" }).format(
        at ? new Date(at) : new Date()
      ),
    [at]
  )
  const no = `CRS-${c.id.slice(-4).toUpperCase()}-${(member?.id ?? memberId).slice(-3).toUpperCase()}`
  return (
    <motion.section
      aria-label={passed ? "Cursus gehaald" : "Cursus niet gehaald"}
      initial={still ? false : { clipPath: "inset(0 0 0 100%)" }}
      animate={{ clipPath: "inset(0 0 0 0%)" }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      className="plate relative mx-auto flex max-w-[760px] flex-col overflow-hidden rounded-xl"
    >
      <span className="plate-scan" aria-hidden />
      <div className="flex flex-col items-center gap-5 px-6 pt-12 pb-10 text-center">
        <motion.span
          initial={still ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.22, type: "spring", stiffness: 380, damping: 22 }}
        >
          <CourseBadge badge={c.badge} size={112} onPlate className={passed ? "" : "opacity-40"} />
        </motion.span>
        <div className="flex flex-col gap-1.5">
          <span className="text-mesh-ink-2 text-sm">
            {passed ? "Gehaald" : `Niet gehaald · de grens is ${c.passMark}%`}
          </span>
          <h2 className="font-medium text-2xl text-mesh-ink">{c.title}</h2>
          {quizzesOf(c).length ? <span className="figure text-5xl text-mesh-ink">{score}%</span> : null}
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="flex h-9 items-center rounded-lg bg-paper px-3.5 font-medium text-abyss text-base hover:bg-paper/90"
          >
            Naar mijn cursussen
          </button>
          <button
            type="button"
            onClick={passed ? onReview : onRetake}
            className="flex h-9 items-center gap-1.5 rounded-lg px-3.5 font-medium text-base text-mesh-ink-2 hover:bg-mesh-ink/10 hover:text-mesh-ink"
          >
            <RotateCcw className="size-4" strokeWidth={1.75} />
            {passed ? "Nog eens bekijken" : "Opnieuw proberen"}
          </button>
        </div>
      </div>
      <dl className="grid grid-cols-2 border-mesh-hairline border-t text-left sm:grid-cols-5">
        {(
          [
            ["Cursus", c.title],
            ["Naam", name ?? member?.name ?? "—"],
            ["Datum", date],
            ["Score", quizzesOf(c).length ? `${score}% (grens ${c.passMark}%)` : "Geen quiz"],
            ["Nr.", no]
          ] as const
        ).map(([k, v], i) => (
          <div
            key={k}
            className={cn(
              "flex min-w-0 flex-col gap-0.5 px-4 py-3",
              i > 0 && "sm:border-mesh-hairline sm:border-l",
              i % 2 === 1 && "border-mesh-hairline border-l",
              i >= 2 && "border-mesh-hairline border-t sm:border-t-0"
            )}
          >
            <dt className="text-mesh-ink-2 text-xs">{k}</dt>
            <dd className="truncate text-mesh-ink text-sm tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
    </motion.section>
  )
}

function AskDialog(
  { open, onClose, c, memberId, blockId }: {
    open: boolean
    onClose: () => void
    c: Course
    memberId: string
    blockId?: string
  }
) {
  const [text, setText] = useState("")
  const author = useWorkspace((s) => s.members.find((m) => m.id === c.createdBy)?.name ?? "de beheerder")
  const block = c.blocks.find((b) => b.id === blockId)
  return (
    <FormDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setText("")
          onClose()
        }
      }}
      title="Stel een vraag"
      description={`Over ${
        block ? `“${(block.kind === "quiz" ? block.question : block.title) || BLOCK_LABEL[block.kind]}”` : "deze cursus"
      }. ${author} krijgt hem, en het antwoord blijft bij het blok staan.`}
      primaryLabel="Vraag sturen"
      disabled={!text.trim()}
      width={480}
      onSubmit={() => {
        undoable(
          "Vraag gestuurd",
          useCourses.getState().ask({ courseId: c.id, memberId, blockId, text: text.trim() }),
          `Naar ${author}.`
        )
        setText("")
        onClose()
      }}
    >
      <Field label="Je vraag">
        <TextAreaField value={text} onChange={setText} rows={4} placeholder="Wat is er niet duidelijk?" />
      </Field>
    </FormDialog>
  )
}
