import { useState } from "react"
import { BADGE_LABEL, minutesOf } from "../../fixtures/courses.ts"
import type { Block, Course } from "../../fixtures/courses.ts"
import { Link, navigate, paths, setQuery, useQuery } from "../../router.tsx"
import { Denied, useAccess } from "../../ui/access.tsx"
import { Button, ButtonLink } from "../../ui/button.tsx"
import { cx } from "../../ui/cx.ts"
import { Dialog } from "../../ui/dialog.tsx"
import { ArrowLeft, Check, Lock, MessageSquare, Play, X } from "../../ui/icons.tsx"
import { Field, Textarea } from "../../ui/input.tsx"
import { Page } from "../../ui/page.tsx"
import { ProgressBar } from "../../ui/progress.tsx"
import { Skeleton } from "../../ui/skeleton.tsx"
import { Spinner } from "../../ui/spinner.tsx"
import { EmptyState, ErrorState } from "../../ui/states.tsx"
import { toast } from "../../ui/toast.tsx"
import { dataState, setView, useView } from "../../view.ts"
import { BADGE_GLYPH } from "./parts.tsx"
import { ask, setRun, useCourses, useQuestions, useRun } from "./store.ts"
import type { Run } from "./store.ts"

/**
 * Following a course: one block at a time, questions checked as you go, a result at the end. Rebuilt
 * from `/app/courses/$id/learn` (`course-player.tsx`). With a fixed order, a block opens once the one
 * before it is done. Anyone with Cursussen · bekijken may follow a live course.
 */
export function LearnScreen({ id }: { readonly id: string }) {
  const access = useAccess("courses")
  const state = dataState(useView())
  const course = useCourses().find((c) => c.id === id)

  if (!access.view) {
    return (
      <Page width="text">
        <Denied area="courses" what="deze cursus" />
      </Page>
    )
  }
  if (state === "loading") {
    return (
      <Page width="record" label="Cursus laden">
        <div aria-busy="true" className="flex flex-col gap-4">
          <Skeleton className="h-6 w-80 max-w-full" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </Page>
    )
  }
  if (state === "error") {
    return (
      <Page width="record">
        <ErrorState
          title="Deze cursus kwam niet binnen"
          detail={`GET /v1/courses/${id}/learn · 503 · verzoek 9e04c2`}
          action={<Button onClick={() => setView({ staat: "gewoon" })}>Opnieuw proberen</Button>}
        />
      </Page>
    )
  }
  if (course === undefined || course.blocks.length === 0) {
    return (
      <Page width="text">
        <EmptyState
          title={course === undefined ? "Deze cursus bestaat niet (meer)" : "Deze cursus is nog leeg"}
          action={<Button onClick={() => navigate(paths.courses)}>Naar Cursussen</Button>}
        >
          {course === undefined ? "Misschien is hij verwijderd." : "Er staat nog geen blok in."}
        </EmptyState>
      </Page>
    )
  }
  return <Player key={course.id} course={course} />
}

function Player({ course }: { readonly course: Course }) {
  const run = useRun(course.id)
  const asked = useQuery("blok")
  const at = Math.max(0, course.blocks.findIndex((b) => b.id === asked))
  const block = course.blocks[at]
  const [asking, setAsking] = useState(false)
  const result = useQuery("resultaat") === "1"
  const G = BADGE_GLYPH[course.badge]

  const locked = (i: number) =>
    course.order === "vast" && i > 0 && !course.blocks.slice(0, i).every((b) => run.done.includes(b.id))
  const go = (i: number) => setQuery({ blok: course.blocks[i]?.id ?? null, resultaat: null })
  const markDone = (b: Block, next?: Partial<Run>) => {
    if (run.done.includes(b.id) && next === undefined) return
    setRun(course.id, { ...run, ...next, done: run.done.includes(b.id) ? run.done : [...run.done, b.id] })
  }
  const quizzes = course.blocks.filter((b): b is Extract<Block, { kind: "quiz" }> => b.kind === "quiz")
  const finish = () => {
    const right = quizzes.filter((q) => run.answers[q.id] === q.correct).length
    const score = quizzes.length === 0 ? 100 : Math.round((right / quizzes.length) * 100)
    setRun(course.id, { ...run, finished: { score, passed: score >= course.passMark } })
    setQuery({ resultaat: "1", blok: null })
  }

  if (block === undefined) return null
  const isLast = at === course.blocks.length - 1
  const ready = block.kind === "quiz" ? run.answers[block.id] !== undefined : true

  return (
    <Page width="record">
      <div className="flex flex-col gap-3">
        <Link
          to={paths.courses}
          className="flex h-7 items-center gap-1 self-start rounded-sm pr-2 text-sm text-ink-3 hover:text-ink pointer-coarse:h-11"
        >
          <ArrowLeft size={14} />
          Mijn cursussen
        </Link>
        <h1 className="text-xl font-semibold text-balance text-ink">{course.title}</h1>
        <ProgressBar
          value={result ? course.blocks.length : run.done.length}
          max={course.blocks.length}
          label="Voortgang"
          detail={`${result ? course.blocks.length : run.done.length} van ${course.blocks.length} blokken · ${
            minutesOf(course)
          } min${course.deadline === undefined ? "" : ` · deadline ${course.deadline}`}`}
        />
      </div>

      {result && run.finished !== undefined
        ? (
          <section className="flex flex-col items-center gap-4 py-12 text-center" aria-live="polite">
            <span
              className={cx(
                "flex size-14 items-center justify-center rounded-full",
                run.finished.passed ? "bg-accent-tint text-accent-ink" : "bg-well text-ink-3"
              )}
            >
              <G size={24} />
            </span>
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold text-ink">
                {run.finished.passed ? "Cursus gehaald" : "Nog niet gehaald"}
              </h2>
              <p className="max-w-[48ch] text-sm text-pretty text-ink-2">
                <span className="figure">{run.finished.score}%</span> van de vragen goed; {course.passMark}% was nodig.
                {" "}
                {run.finished.passed
                  ? `De badge ${BADGE_LABEL[course.badge]} staat op je profiel.`
                  : "Lees de blokken nog eens en probeer het opnieuw."}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {!run.finished.passed && (
                <Button
                  variant="primary"
                  onClick={() => {
                    setRun(course.id, { done: [], answers: {} })
                    go(0)
                  }}
                >
                  Opnieuw
                </Button>
              )}
              <ButtonLink to={paths.courses} variant={run.finished.passed ? "primary" : "secondary"}>
                Naar mijn cursussen
              </ButtonLink>
            </div>
          </section>
        )
        : (
          <div className="grid gap-8 pt-8 md:grid-cols-[14rem_1fr]">
            <nav aria-label="Blokken" className="hidden md:block">
              <ol className="flex flex-col gap-0.5">
                {course.blocks.map((b, i) => {
                  const done = run.done.includes(b.id)
                  const shut = locked(i)
                  return (
                    <li key={b.id}>
                      <button
                        type="button"
                        disabled={shut}
                        aria-current={i === at ? "step" : undefined}
                        onClick={() => go(i)}
                        className={cx(
                          "flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors disabled:cursor-not-allowed",
                          i === at ? "bg-selected font-medium text-ink" : "text-ink-2 hover:bg-hover",
                          shut && "text-ink-4 hover:bg-transparent"
                        )}
                      >
                        <span className="flex size-4 shrink-0 items-center justify-center text-ink-3">
                          {done
                            ? <Check size={13} className="text-accent" />
                            : shut
                            ? <Lock size={12} />
                            : <span className="figure text-2xs">{i + 1}</span>}
                        </span>
                        <span className="truncate">{b.kind === "quiz" ? "Vraag" : b.title}</span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            </nav>

            <article className="flex min-w-0 flex-col gap-6">
              <p className="text-xs text-ink-3 md:hidden">Blok {at + 1} van {course.blocks.length}</p>
              <BlockView key={block.id} block={block} run={run} onDone={(next) => markDone(block, next)} />
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                {course.questions
                  ? (
                    <Button variant="ghost" icon={<MessageSquare />} onClick={() => setAsking(true)}>
                      Stel een vraag
                    </Button>
                  )
                  : <span />}
                <div className="flex gap-2">
                  {at > 0 && <Button onClick={() => go(at - 1)}>Vorige</Button>}
                  <Button
                    variant="primary"
                    disabled={!ready}
                    onClick={() => {
                      markDone(block)
                      if (isLast) finish()
                      else go(at + 1)
                    }}
                  >
                    {isLast ? "Afronden" : "Volgende"}
                  </Button>
                </div>
              </div>
              <AskedHere course={course} blockId={block.id} />
            </article>
          </div>
        )}
      <AskDialog open={asking} onClose={() => setAsking(false)} course={course} block={block} />
    </Page>
  )
}

/** A text body: paragraphs, and lines that start with "- " as a list. */
function Body({ text }: { readonly text: string }) {
  return (
    <div className="flex max-w-[64ch] flex-col gap-3 text-md text-pretty text-ink">
      {text.split("\n\n").map((para, i) =>
        para.startsWith("- ")
          ? (
            <ul key={i} className="flex list-disc flex-col gap-1 pl-5">
              {para.split("\n").filter((l) => l.startsWith("- ")).map((l) => <li key={l}>{l.slice(2)}</li>)}
              {para.split("\n").filter((l) => !l.startsWith("- ") && l.trim() !== "").map((l) => (
                <p key={l} className="-ml-5 pt-2">{l}</p>
              ))}
            </ul>
          )
          : <p key={i}>{para}</p>
      )}
    </div>
  )
}

function BlockView(
  { block, run, onDone }: { readonly block: Block; readonly run: Run; readonly onDone: (next?: Partial<Run>) => void }
) {
  const [picked, setPicked] = useState<number | null>(block.kind === "quiz" ? (run.answers[block.id] ?? null) : null)
  const [playing, setPlaying] = useState(false)
  const checked = block.kind === "quiz" && run.answers[block.id] !== undefined

  if (block.kind === "text") {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-ink">{block.title}</h2>
        <Body text={block.body} />
      </section>
    )
  }
  if (block.kind === "video") {
    const seen = run.done.includes(block.id)
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-ink">{block.title}</h2>
        <div className="relative flex aspect-video w-full max-w-2xl flex-col items-center justify-center gap-3 overflow-hidden rounded-lg bg-well">
          {playing
            ? (
              <>
                <Spinner />
                <p className="text-sm text-ink-2" aria-live="polite">Speelt af…</p>
              </>
            )
            : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setPlaying(true)
                    window.setTimeout(() => {
                      setPlaying(false)
                      onDone()
                    }, 2200)
                  }}
                  className="flex size-14 items-center justify-center rounded-full bg-canvas text-ink shadow-sm transition-transform hover:scale-105"
                  aria-label={`${block.title} afspelen`}
                >
                  <Play size={22} />
                </button>
                <p className="text-sm text-ink-2">{seen ? "Bekeken · " : ""}{block.minutes} min</p>
              </>
            )}
        </div>
      </section>
    )
  }
  if (block.kind === "image") {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-ink">{block.title}</h2>
        <figure className="flex max-w-2xl flex-col gap-2">
          <div
            className="rounded-lg bg-well p-4 sm:p-8"
            role="img"
            aria-label="De bestelling met de sectie Verzending; de laatste scan staat bovenaan."
          >
            <div className="flex flex-col gap-4 rounded-md bg-canvas p-5">
              <div className="flex flex-col gap-0.5">
                <p className="text-md font-medium text-ink">Bestelling #5309</p>
                <p className="text-xs text-ink-3">Track & trace 3SNWD0012844921</p>
              </div>
              <p className="text-sm font-medium text-ink">Verzending</p>
              <ol className="flex flex-col gap-3 text-sm">
                <li className="flex gap-3 rounded-md bg-accent-tint px-3 py-2">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" />
                  <span className="flex flex-col">
                    <span className="font-medium text-ink">Bij sorteercentrum Nieuwegein</span>
                    <span className="text-xs text-ink-3">Vandaag 06:14 · laatste scan</span>
                  </span>
                </li>
                {[["Onderweg naar Nederland", "Gisteren 22:40"], ["Opgehaald bij de leverancier", "Maandag 15:02"], [
                  "Label aangemaakt",
                  "Maandag 11:30"
                ]].map(([t, w]) => (
                  <li key={t} className="flex gap-3 px-3">
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-line-strong" />
                    <span className="flex flex-col">
                      <span className="text-ink-2">{t}</span>
                      <span className="text-xs text-ink-3">{w}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <figcaption className="text-sm text-ink-2">{block.caption}</figcaption>
        </figure>
      </section>
    )
  }
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-balance text-ink">{block.question}</h2>
      <div role="radiogroup" aria-label={block.question} className="flex max-w-xl flex-col gap-2">
        {block.options.map((o, i) => {
          const right = checked && i === block.correct
          const wrong = checked && i === picked && i !== block.correct
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={picked === i}
              disabled={checked}
              onClick={() => setPicked(i)}
              className={cx(
                "flex min-h-11 items-center justify-between gap-3 rounded-md px-3 text-left text-sm transition-colors",
                right
                  ? "bg-good-tint text-good-ink"
                  : wrong
                  ? "bg-bad-tint text-bad-ink"
                  : picked === i
                  ? "bg-accent-tint text-ink ring-2 ring-accent"
                  : "bg-well text-ink hover:bg-hover"
              )}
            >
              {o}
              {right && <Check size={15} />}
              {wrong && <X size={15} />}
            </button>
          )
        })}
      </div>
      {checked
        ? (
          <p className="max-w-[60ch] text-sm text-pretty text-ink-2" aria-live="polite">
            <span className="font-medium text-ink">
              {run.answers[block.id] === block.correct ? "Goed." : "Het goede antwoord staat groen."}
            </span>{" "}
            {block.explain}
          </p>
        )
        : (
          <div>
            <Button
              disabled={picked === null}
              onClick={() => picked !== null && onDone({ answers: { ...run.answers, [block.id]: picked } })}
            >
              Controleren
            </Button>
          </div>
        )}
    </section>
  )
}

function AskedHere({ course, blockId }: { readonly course: Course; readonly blockId: string }) {
  const mineHere = useQuestions().filter((q) =>
    q.courseId === course.id && q.blockId === blockId && (q.person === "elena" || q.answer !== undefined)
  )
  if (mineHere.length === 0) return null
  return (
    <section className="flex flex-col gap-2 border-t border-line pt-4">
      <h3 className="text-xs font-medium text-ink-3">Gevraagd bij dit blok</h3>
      {mineHere.map((q) => (
        <div key={q.id} className="flex flex-col gap-1 text-sm">
          <p className="text-ink">{q.text}</p>
          <p className="text-ink-2">
            {q.answer === undefined ? "Nog geen antwoord." : (
              <>
                <span className="font-medium text-ink">{q.answeredBy}:</span> {q.answer}
              </>
            )}
          </p>
        </div>
      ))}
    </section>
  )
}

function AskDialog(
  { open, onClose, course, block }: {
    readonly open: boolean
    readonly onClose: () => void
    readonly course: Course
    readonly block: Block
  }
) {
  const [text, setText] = useState("")
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Stel een vraag"
      description={`Over ‘${block.kind === "quiz" ? block.question : block.title}’. ${
        course.author === "elena"
          ? "Jij schreef deze cursus; de vraag komt bij Vragen."
          : "De schrijver van de cursus krijgt hem."
      }`}
      footer={
        <>
          <Button onClick={onClose}>Annuleren</Button>
          <Button
            variant="primary"
            disabled={text.trim() === ""}
            onClick={() => {
              ask(course.id, block.id, text.trim())
              setText("")
              onClose()
              toast({ title: "Vraag gesteld", body: "Het antwoord verschijnt bij dit blok.", tone: "good" })
            }}
          >
            Vraag stellen
          </Button>
        </>
      }
    >
      <Field label="Je vraag">
        {(control) => <Textarea {...control} rows={3} value={text} onChange={(event) => setText(event.target.value)} />}
      </Field>
    </Dialog>
  )
}
