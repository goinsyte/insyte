import { useState } from "react"
import { audienceLabel, courseCounts, follows, minutesOf } from "../../fixtures/courses.ts"
import type { Course, Question } from "../../fixtures/courses.ts"
import { PEOPLE } from "../../fixtures/workspace.ts"
import { Link, navigate, paths, setQuery, useQuery } from "../../router.tsx"
import { Denied, ReadOnlyNotice, useAccess } from "../../ui/access.tsx"
import { Avatar } from "../../ui/avatar.tsx"
import { Status } from "../../ui/badge.tsx"
import { Button } from "../../ui/button.tsx"
import { Dialog } from "../../ui/dialog.tsx"
import { GraduationCap, Plus } from "../../ui/icons.tsx"
import { Field, Input, Select, Textarea } from "../../ui/input.tsx"
import { GlyphTile, List, ListRow } from "../../ui/list.tsx"
import { Page, PageHead, PageSection } from "../../ui/page.tsx"
import { Skeleton } from "../../ui/skeleton.tsx"
import { EmptyState, ErrorState } from "../../ui/states.tsx"
import { Table, TBody, Td, Th, THead, Tr } from "../../ui/table.tsx"
import { Tabs } from "../../ui/tabs.tsx"
import { toast } from "../../ui/toast.tsx"
import { dataState, setView, useView } from "../../view.ts"
import { BADGE_GLYPH, mine, personName, ProgressLabel } from "./parts.tsx"
import { answer, createCourse, useChapters, useCourses, useProgress, useQuestions, useRun } from "./store.ts"

export const COURSE_VIEWS = ["mijn", "alle", "team", "vragen", "concepten", "archief"] as const
export type CourseView = (typeof COURSE_VIEWS)[number]
/** The views that change courses, for those who may. */
const EDITOR_VIEWS: ReadonlySet<CourseView> = new Set(["team", "vragen", "concepten", "archief"])

/**
 * Cursussen: how Northwind teaches its team. Rebuilt from `/app/courses` (`courses-screen.tsx`): your
 * own courses, the library by chapter, the team's progress, questions asked inside a course, drafts
 * and the archive. Everyone with Cursussen · bekijken learns; editing needs Cursussen · wijzigen.
 */
export function CoursesList() {
  const access = useAccess("courses")
  const state = dataState(useView())
  const courses = useCourses()
  const questions = useQuestions()
  const asked = (useQuery("view") ?? "mijn") as CourseView
  const view = !access.edit && EDITOR_VIEWS.has(asked) ? "mijn" : asked
  const [creating, setCreating] = useState(false)
  const counts = courseCounts(courses, questions)

  if (!access.view) {
    return (
      <Page width="text">
        <PageHead title="Cursussen" />
        <Denied area="courses" what="de cursussen" />
      </Page>
    )
  }

  const tabs = [
    { value: "mijn" as const, label: "Mijn cursussen" },
    { value: "alle" as const, label: "Alle cursussen", count: counts.live },
    ...(access.edit
      ? [
        { value: "team" as const, label: "Voortgang van het team" },
        { value: "vragen" as const, label: "Vragen", count: counts.open },
        { value: "concepten" as const, label: "Concepten", count: counts.drafts },
        { value: "archief" as const, label: "Archief", count: counts.archived }
      ]
      : [])
  ]

  return (
    <Page>
      <PageHead
        title="Cursussen"
        meta={state === "ready" && courses.length > 0
          ? `${counts.live} live · ${counts.drafts} ${counts.drafts === 1 ? "concept" : "concepten"}${
            access.edit && counts.open > 0 ? ` · ${counts.open} open ${counts.open === 1 ? "vraag" : "vragen"}` : ""
          }`
          : undefined}
        actions={access.edit && state === "ready" && (
          <Button
            variant="primary"
            icon={<Plus />}
            onClick={() => setCreating(true)}
          >
            Nieuwe cursus
          </Button>
        )}
      />
      {!access.edit && state === "ready" && <ReadOnlyNotice area="courses" />}
      {state === "loading"
        ? (
          <div aria-busy="true" aria-label="Cursussen laden" className="flex flex-col gap-3">
            <Skeleton className="h-9 w-[28rem] max-w-full" />
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 py-2">
                <Skeleton className="size-8 rounded-md" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3 w-64 max-w-full" />
                  <Skeleton className="h-2.5 w-40" />
                </div>
              </div>
            ))}
          </div>
        )
        : state === "error"
        ? (
          <ErrorState
            title="De cursussen kwamen niet binnen"
            detail="GET /v1/courses · 503 · verzoek 3a71fe"
            action={<Button onClick={() => setView({ staat: "gewoon" })}>Opnieuw proberen</Button>}
          >
            Je voortgang is niet weg; dit scherm kon hem alleen niet ophalen.
          </ErrorState>
        )
        : courses.length === 0
        ? (
          <EmptyState
            glyph={GraduationCap}
            title="Nog geen cursussen"
            action={access.edit && (
              <Button variant="primary" onClick={() => setCreating(true)}>Eerste cursus maken</Button>
            )}
          >
            Schrijf op hoe Northwind werkt: de toon naar klanten, doorsturen naar de leverancier, chargebacks. Nieuwe
            mensen leren het in een paar blokken met een vraag erna, en jij ziet wie het gehaald heeft.
          </EmptyState>
        )
        : (
          <div className="flex flex-col gap-6">
            <Tabs
              label="Weergave"
              value={view}
              onChange={(next) => setQuery({ view: next === "mijn" ? null : next })}
              tabs={tabs}
            />
            {view === "mijn" && <Mine courses={courses} />}
            {view === "alle" && <Library courses={courses.filter((c) => c.status === "live")} />}
            {view === "team" && <Team courses={courses.filter((c) => c.status === "live")} />}
            {view === "vragen" && <Questions questions={questions} courses={courses} />}
            {(view === "concepten" || view === "archief") && (
              <CourseTable
                courses={courses.filter((c) => c.status === (view === "concepten" ? "concept" : "archief"))}
                empty={view}
              />
            )}
          </div>
        )}
      <NewCourse open={creating} onClose={() => setCreating(false)} />
    </Page>
  )
}

function CourseRow({ course }: { readonly course: Course }) {
  const run = useRun(course.id)
  const seeded = useProgress().find((p) => p.courseId === course.id && p.person === "elena")
  const me = mine(course, run, seeded)
  const G = BADGE_GLYPH[course.badge]
  const verb = me.kind === "nieuw" ? "Beginnen" : me.kind === "bezig" ? "Verder" : "Opnieuw"
  return (
    <ListRow
      lead={
        <GlyphTile>
          <G size={15} />
        </GlyphTile>
      }
      href={`${paths.course(course.id)}/leren`}
      title={course.title}
      meta={
        <>
          {minutesOf(course)} min · {course.blocks.length} blokken
          {course.deadline !== undefined && (
            <>· {course.overdue === true ? "deadline was" : "deadline"} {course.deadline}</>
          )}
        </>
      }
      trail={
        <>
          {me.kind === "gehaald" && (
            <Status tone="good">Gehaald{me.score === undefined ? "" : ` · ${me.score}%`}</Status>
          )}
          {me.kind === "niet-gehaald" && <Status tone="warn">Niet gehaald · {me.score}%</Status>}
          {me.kind === "bezig" && <span className="figure text-ink-3">{me.done} van {course.blocks.length}</span>}
          {me.kind === "nieuw" && course.overdue === true && <Status tone="bad">Te laat</Status>}
          <span className="hidden font-medium text-ink sm:inline">{verb}</span>
        </>
      }
    />
  )
}

function Mine({ courses }: { readonly courses: ReadonlyArray<Course> }) {
  const progress = useProgress()
  const mineAll = courses.filter((c) => follows(c, "elena", PEOPLE.elena.role))
  const done = (c: Course) =>
    progress.some((p) => p.courseId === c.id && p.person === "elena" && p.finished !== undefined)
  const todo = mineAll.filter((c) => !done(c))
  const finished = mineAll.filter(done)
  if (mineAll.length === 0) {
    return (
      <EmptyState size="sm" glyph={GraduationCap} title="Er staat nog niets voor je klaar">
        Als iemand een cursus voor je rol live zet, staat hij hier.
      </EmptyState>
    )
  }
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <PageSection id="te-doen" title="Te doen" meta={todo.length === 0 ? "Alles gehaald" : `${todo.length}`}>
        {todo.length === 0
          ? <p className="text-sm text-ink-2">Je hebt alles gehaald wat voor je klaarstaat.</p>
          : <List label="Te doen" divided>{todo.map((c) => <CourseRow key={c.id} course={c} />)}</List>}
      </PageSection>
      {finished.length > 0 && (
        <PageSection id="gehaald" title="Gehaald" meta={`${finished.length}`}>
          <List label="Gehaald" divided>{finished.map((c) => <CourseRow key={c.id} course={c} />)}</List>
        </PageSection>
      )}
    </div>
  )
}

function Library({ courses }: { readonly courses: ReadonlyArray<Course> }) {
  const chapters = useChapters()
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      {chapters.map((ch) => {
        const inChapter = courses.filter((c) => c.chapterId === ch.id)
        if (inChapter.length === 0) return null
        return (
          <PageSection
            key={ch.id}
            id={ch.id}
            title={ch.title}
            meta={`${inChapter.length} ${inChapter.length === 1 ? "cursus" : "cursussen"}`}
          >
            {ch.modules.map((m) => {
              const inModule = inChapter.filter((c) => c.moduleId === m.id)
              if (inModule.length === 0) return null
              return (
                <div key={m.id} className="flex flex-col gap-1 pb-3">
                  <h3 className="text-xs font-medium text-ink-3">{m.title}</h3>
                  <List label={m.title} divided>{inModule.map((c) => <CourseRow key={c.id} course={c} />)}</List>
                </div>
              )
            })}
          </PageSection>
        )
      })}
    </div>
  )
}

function Team({ courses }: { readonly courses: ReadonlyArray<Course> }) {
  const progress = useProgress()
  const people = (Object.keys(PEOPLE) as Array<keyof typeof PEOPLE>).filter((p) => p !== "elena")
  return (
    <div className="flex flex-col gap-3">
      <p className="max-w-[68ch] text-sm text-ink-2">
        Wie wat gehaald heeft, per cursus. Een cursus met een verlopen deadline staat in rood bij wie hem nog niet
        haalde.
      </p>
      <Table label="Voortgang van het team" minWidth={200 + courses.length * 170}>
        <THead>
          <Th width="14rem">Persoon</Th>
          {courses.map((c) => (
            <Th key={c.id}>
              <Link to={paths.course(c.id)} className="line-clamp-2 hover:underline">{c.title}</Link>
            </Th>
          ))}
        </THead>
        <TBody>
          {people.map((p) => (
            <Tr key={p}>
              <Td header>
                <Link to={paths.person(PEOPLE[p].id)} className="flex min-h-11 items-center gap-2 hover:underline">
                  <Avatar name={PEOPLE[p].name} size={22} />
                  <span className="flex flex-col">
                    <span className="font-medium text-ink">{PEOPLE[p].name}</span>
                    <span className="text-xs text-ink-3">{PEOPLE[p].role}</span>
                  </span>
                </Link>
              </Td>
              {courses.map((c) => (
                <Td key={c.id}>
                  <ProgressLabel course={c} progress={progress.find((x) => x.courseId === c.id && x.person === p)} />
                </Td>
              ))}
            </Tr>
          ))}
        </TBody>
      </Table>
    </div>
  )
}

function Questions(
  { questions, courses }: { readonly questions: ReadonlyArray<Question>; readonly courses: ReadonlyArray<Course> }
) {
  const open = questions.filter((q) => q.answer === undefined)
  const answered = questions.filter((q) => q.answer !== undefined)
  if (questions.length === 0) {
    return (
      <EmptyState size="sm" glyph={GraduationCap} title="Nog geen vragen">
        Wie in een cursus iets niet snapt, kan het daar vragen. Het komt hier binnen.
      </EmptyState>
    )
  }
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <PageSection id="open" title="Open" meta={`${open.length}`}>
        {open.length === 0
          ? <p className="text-sm text-ink-2">Alle vragen zijn beantwoord.</p>
          : (
            <ul className="flex flex-col divide-y divide-line">
              {open.map((q) => <QuestionItem key={q.id} q={q} course={courses.find((c) => c.id === q.courseId)} />)}
            </ul>
          )}
      </PageSection>
      {answered.length > 0 && (
        <PageSection id="beantwoord" title="Beantwoord" meta={`${answered.length}`}>
          <ul className="flex flex-col divide-y divide-line">
            {answered.map((q) => <QuestionItem key={q.id} q={q} course={courses.find((c) => c.id === q.courseId)} />)}
          </ul>
        </PageSection>
      )}
    </div>
  )
}

function QuestionItem({ q, course }: { readonly q: Question; readonly course: Course | undefined }) {
  const [draft, setDraft] = useState("")
  const block = course?.blocks.find((b) => b.id === q.blockId)
  const where = block === undefined ? "" : block.kind === "quiz" ? block.question : block.title
  return (
    <li className="flex gap-3 py-4">
      <Avatar name={personName(q.person)} size={28} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-xs text-ink-3">
          <span className="font-medium text-ink-2">{personName(q.person)}</span> · {q.at} · in {course === undefined ?
            "een cursus" :
            (
              <Link
                to={`${paths.course(course.id)}/leren?blok=${q.blockId}`}
                className="underline underline-offset-2 hover:text-ink"
              >
                {course.title}
                {where === "" ? "" : `, ${where}`}
              </Link>
            )}
        </p>
        <p className="text-sm text-pretty text-ink">{q.text}</p>
        {q.answer !== undefined
          ? (
            <p className="rounded-md bg-well px-3 py-2 text-sm text-pretty text-ink-2">
              <span className="font-medium text-ink">{q.answeredBy}:</span> {q.answer}
            </p>
          )
          : (
            <form
              className="flex flex-col gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                if (draft.trim() === "") return
                answer(q.id, draft.trim())
                toast({
                  title: "Antwoord verstuurd",
                  body: `${personName(q.person)} ziet het in de cursus.`,
                  tone: "good"
                })
              }}
            >
              <Textarea
                aria-label={`Antwoord aan ${personName(q.person)}`}
                rows={2}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Je antwoord"
              />
              <div>
                <Button size="sm" type="submit" disabled={draft.trim() === ""}>Beantwoorden</Button>
              </div>
            </form>
          )}
      </div>
    </li>
  )
}

function CourseTable(
  { courses, empty }: { readonly courses: ReadonlyArray<Course>; readonly empty: "concepten" | "archief" }
) {
  const chapters = useChapters()
  if (courses.length === 0) {
    return (
      <EmptyState
        size="sm"
        glyph={GraduationCap}
        title={empty === "concepten" ? "Geen concepten" : "Het archief is leeg"}
      >
        {empty === "concepten"
          ? "Een nieuwe cursus blijft hier tot je hem live zet."
          : "Een gearchiveerde cursus blijft hier staan tot je hem terugzet."}
      </EmptyState>
    )
  }
  return (
    <Table label={empty === "concepten" ? "Concepten" : "Archief"} minWidth={640}>
      <THead>
        <Th>Cursus</Th>
        <Th>Hoofdstuk</Th>
        <Th>Voor</Th>
        <Th>Gewijzigd</Th>
      </THead>
      <TBody>
        {courses.map((c) => (
          <Tr key={c.id} onOpen={() => navigate(paths.course(c.id))}>
            <Td header>
              <Link to={paths.course(c.id)} className="flex min-h-11 flex-col justify-center hover:underline">
                <span className="font-medium text-ink">{c.title}</span>
                <span className="text-xs text-ink-3">{c.blocks.length} blokken · van {personName(c.author)}</span>
              </Link>
            </Td>
            <Td muted>{chapters.find((ch) => ch.id === c.chapterId)?.title ?? "—"}</Td>
            <Td muted>{audienceLabel(c.audience, personName)}</Td>
            <Td muted className="whitespace-nowrap">{c.updated}</Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  )
}

function NewCourse({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }) {
  const chapters = useChapters()
  const [title, setTitle] = useState("")
  const [where, setWhere] = useState(`${chapters[0]?.id ?? ""}/${chapters[0]?.modules[0]?.id ?? ""}`)
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Nieuwe cursus"
      description="Hij begint als concept. Niemand ziet hem tot je hem live zet."
      footer={
        <>
          <Button onClick={onClose}>Annuleren</Button>
          <Button
            variant="primary"
            disabled={title.trim() === ""}
            onClick={() => {
              const [ch, md] = where.split("/")
              const id = createCourse(title.trim(), ch ?? "", md ?? "")
              setTitle("")
              onClose()
              navigate(`${paths.course(id)}?tab=inhoud`)
            }}
          >
            Cursus maken
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Titel">
          {(control) => (
            <Input
              {...control}
              value={title}
              placeholder="Bijvoorbeeld: Retouren beoordelen"
              onChange={(event) => setTitle(event.target.value)}
            />
          )}
        </Field>
        <Field label="Waar hij staat">
          {(control) => (
            <Select {...control} value={where} onChange={(event) => setWhere(event.target.value)}>
              {chapters.map((ch) => (
                <optgroup key={ch.id} label={ch.title}>
                  {ch.modules.map((m) => <option key={m.id} value={`${ch.id}/${m.id}`}>{m.title}</option>)}
                </optgroup>
              ))}
            </Select>
          )}
        </Field>
      </div>
    </Dialog>
  )
}
