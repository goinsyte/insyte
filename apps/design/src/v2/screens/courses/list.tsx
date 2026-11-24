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
import { DropdownItem, DropdownMenu } from "../../ui/dropdown.tsx"
import { Bell, Check, Edit, GraduationCap, MoreHorizontal, Plus } from "../../ui/icons.tsx"
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
import {
  addChapter,
  addModule,
  answer,
  createCourse,
  remind,
  rename,
  useChapters,
  useCourses,
  useProgress,
  useQuestions,
  useReminded,
  useRun
} from "./store.ts"

const COURSE_VIEWS = ["mijn", "alle", "team", "vragen", "concepten", "archief"] as const
type CourseView = (typeof COURSE_VIEWS)[number]
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
  const [creating, setCreating] = useState<{ readonly where?: string } | null>(null)
  const [naming, setNaming] = useState<Naming | null>(null)
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
            onClick={() => setCreating({})}
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
              <Button variant="primary" onClick={() => setCreating({})}>Eerste cursus maken</Button>
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
            {view === "alle" && (
              <Library
                courses={courses.filter((c) => c.status === "live")}
                edit={access.edit}
                onName={setNaming}
                onCreate={(where) => setCreating({ where })}
              />
            )}
            {view === "team" && <Team courses={courses.filter((c) => c.status === "live")} edit={access.edit} />}
            {view === "vragen" && <Questions questions={questions} courses={courses} />}
            {(view === "concepten" || view === "archief") && (
              <CourseTable
                courses={courses.filter((c) => c.status === (view === "concepten" ? "concept" : "archief"))}
                empty={view}
              />
            )}
          </div>
        )}
      <NewCourse key={creating?.where ?? "nieuw"} open={creating} onClose={() => setCreating(null)} />
      <NameDialog naming={naming} onClose={() => setNaming(null)} />
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

/** What is being named: a new chapter, a new module in a chapter, or a chapter or module renamed. */
type Naming =
  | { readonly kind: "chapter" }
  | { readonly kind: "module"; readonly chapterId: string; readonly chapter: string }
  | { readonly kind: "rename"; readonly id: string; readonly what: "hoofdstuk" | "module"; readonly title: string }

const more = (label: string) => (props: Record<string, unknown>) => (
  <button
    {...props}
    type="button"
    aria-label={label}
    className="inline-flex size-7 items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-ink pointer-coarse:size-11"
  >
    <MoreHorizontal size={15} />
  </button>
)

function Library({ courses, edit, onName, onCreate }: {
  readonly courses: ReadonlyArray<Course>
  readonly edit: boolean
  readonly onName: (n: Naming) => void
  readonly onCreate: (where: string) => void
}) {
  const chapters = useChapters()
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      {edit && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="max-w-[60ch] text-sm text-ink-2">
            Een hoofdstuk is een onderwerp, een module een stuk ervan. Elke cursus staat in één module.
          </p>
          <Button size="sm" icon={<Plus />} onClick={() => onName({ kind: "chapter" })}>Hoofdstuk toevoegen</Button>
        </div>
      )}
      {chapters.map((ch) => {
        const inChapter = courses.filter((c) => c.chapterId === ch.id)
        if (inChapter.length === 0 && !edit) return null
        return (
          <PageSection
            key={ch.id}
            id={ch.id}
            title={ch.title}
            meta={`${inChapter.length} ${inChapter.length === 1 ? "cursus" : "cursussen"}`}
            actions={edit && (
              <DropdownMenu
                label={`Hoofdstuk ${ch.title}`}
                placement="bottom-end"
                trigger={more(`Opties voor ${ch.title}`)}
              >
                <DropdownItem
                  glyph={Edit}
                  onSelect={() => onName({ kind: "rename", id: ch.id, what: "hoofdstuk", title: ch.title })}
                >
                  Hernoemen
                </DropdownItem>
                <DropdownItem
                  glyph={Plus}
                  onSelect={() => onName({ kind: "module", chapterId: ch.id, chapter: ch.title })}
                >
                  Module toevoegen
                </DropdownItem>
              </DropdownMenu>
            )}
          >
            {ch.modules.map((m) => {
              const inModule = inChapter.filter((c) => c.moduleId === m.id)
              if (inModule.length === 0 && !edit) return null
              return (
                <div key={m.id} className="flex flex-col gap-1 pb-3">
                  <div className="flex min-h-7 items-center justify-between gap-2">
                    <h3 className="text-xs font-medium text-ink-3">{m.title}</h3>
                    {edit && (
                      <span className="flex items-center gap-0.5">
                        <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => onCreate(`${ch.id}/${m.id}`)}>
                          Cursus
                        </Button>
                        <DropdownMenu
                          label={`Module ${m.title}`}
                          placement="bottom-end"
                          trigger={more(`Opties voor ${m.title}`)}
                        >
                          <DropdownItem
                            glyph={Edit}
                            onSelect={() => onName({ kind: "rename", id: m.id, what: "module", title: m.title })}
                          >
                            Hernoemen
                          </DropdownItem>
                        </DropdownMenu>
                      </span>
                    )}
                  </div>
                  {inModule.length === 0
                    ? <p className="py-2 text-sm text-ink-3">Nog geen live cursus in deze module.</p>
                    : <List label={m.title} divided>{inModule.map((c) => <CourseRow key={c.id} course={c} />)}</List>}
                </div>
              )
            })}
          </PageSection>
        )
      })}
    </div>
  )
}

function NameDialog({ naming, onClose }: { readonly naming: Naming | null; readonly onClose: () => void }) {
  const [name, setName] = useState("")
  const close = () => {
    setName("")
    onClose()
  }
  const title = naming === null
    ? ""
    : naming.kind === "chapter"
    ? "Nieuw hoofdstuk"
    : naming.kind === "module"
    ? `Module in ${naming.chapter}`
    : naming.what === "hoofdstuk"
    ? "Hoofdstuk hernoemen"
    : "Module hernoemen"
  const value = naming?.kind === "rename" && name === "" ? naming.title : name
  const save = () => {
    const t = value.trim()
    if (naming === null || t === "") return
    if (naming.kind === "chapter") {
      const undo = addChapter(t)
      toast({
        title: `Hoofdstuk “${t}” toegevoegd`,
        body: "Met een eerste module, Algemeen.",
        tone: "good",
        action: { label: "Ongedaan maken", onClick: undo }
      })
    } else if (naming.kind === "module") {
      const undo = addModule(naming.chapterId, t)
      toast({ title: `Module “${t}” toegevoegd`, tone: "good", action: { label: "Ongedaan maken", onClick: undo } })
    } else {
      if (t === naming.title) return close()
      const undo = rename(naming.id, t)
      toast({
        title: naming.what === "hoofdstuk" ? "Hoofdstuk hernoemd" : "Module hernoemd",
        body: `Heet nu “${t}”.`,
        action: { label: "Ongedaan maken", onClick: undo }
      })
    }
    close()
  }
  return (
    <Dialog
      open={naming !== null}
      onClose={close}
      size="sm"
      title={title}
      description={naming?.kind === "chapter"
        ? "Een onderwerp, zoals Klantenservice of Bestellingen. Het krijgt meteen een eerste module."
        : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={close}>Annuleren</Button>
          <Button variant="primary" disabled={value.trim() === ""} onClick={save}>
            {naming?.kind === "rename"
              ? "Opslaan"
              : naming?.kind === "module"
              ? "Module toevoegen"
              : "Hoofdstuk toevoegen"}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
      >
        <Field label="Naam">
          {(control) => (
            <Input
              {...control}
              value={value}
              placeholder={naming?.kind === "module" ? "Bijvoorbeeld: Lastige gesprekken" : "Bijvoorbeeld: Retouren"}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
      </form>
    </Dialog>
  )
}

function Team({ courses, edit }: { readonly courses: ReadonlyArray<Course>; readonly edit: boolean }) {
  const progress = useProgress()
  const reminded = useReminded()
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
              {courses.map((c) => {
                const pr = progress.find((x) => x.courseId === c.id && x.person === p)
                const key = `${c.id}:${p}`
                const done = pr?.finished !== undefined && (pr.score ?? 0) >= c.passMark
                const sent = reminded.includes(key)
                return (
                  <Td key={c.id}>
                    <span className="flex flex-col items-start gap-1">
                      <ProgressLabel course={c} progress={pr} />
                      {!done && edit && (
                        <button
                          type="button"
                          disabled={sent}
                          onClick={() => {
                            remind(c.id, p)
                            toast({
                              title: `Herinnering naar ${PEOPLE[p].name.split(" ")[0] ?? ""}`,
                              body: `Over ${c.title}, in de app en per e-mail.`,
                              tone: "good"
                            })
                          }}
                          aria-label={`${PEOPLE[p].name} herinneren aan ${c.title}`}
                          className="inline-flex h-6 items-center gap-1 rounded-xs text-xs text-ink-3 hover:text-ink disabled:text-good-ink pointer-coarse:h-11"
                        >
                          {sent ? <Check size={12} /> : <Bell size={12} />}
                          {sent ? "Herinnerd" : "Herinneren"}
                        </button>
                      )}
                    </span>
                  </Td>
                )
              })}
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

function NewCourse(
  { open, onClose }: { readonly open: { readonly where?: string } | null; readonly onClose: () => void }
) {
  const chapters = useChapters()
  const [title, setTitle] = useState("")
  const [where, setWhere] = useState(
    open?.where ?? `${chapters[0]?.id ?? ""}/${chapters[0]?.modules[0]?.id ?? ""}`
  )
  return (
    <Dialog
      open={open !== null}
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
