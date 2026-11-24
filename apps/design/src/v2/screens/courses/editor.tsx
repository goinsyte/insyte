import { useState } from "react"
import { ASSISTANT } from "../../assistant.ts"
import { audienceLabel, BADGE_LABEL, BLOCK_LABEL, minutesOf, suggestQuestions } from "../../fixtures/courses.ts"
import type { Badge, Block, BlockKind, Course, QuizBlock } from "../../fixtures/courses.ts"
import { SUPPLIERS } from "../../fixtures/records.ts"
import { Link, navigate, paths, setQuery, useQuery } from "../../router.tsx"
import { Denied, useAccess } from "../../ui/access.tsx"
import { Status } from "../../ui/badge.tsx"
import { Button, ButtonLink, IconButton } from "../../ui/button.tsx"
import { Checkbox } from "../../ui/checkbox.tsx"
import { cx } from "../../ui/cx.ts"
import { Sheet } from "../../ui/dialog.tsx"
import { DropdownItem, DropdownMenu, DropdownSeparator } from "../../ui/dropdown.tsx"
import { FileDrop } from "../../ui/file-drop.tsx"
import {
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Copy,
  Eye,
  FileText,
  Image,
  MessageSquare,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Sparkles,
  Trash,
  Undo,
  Video,
  X
} from "../../ui/icons.tsx"
import { Field, Input, Select, Textarea } from "../../ui/input.tsx"
import { MagnusMark } from "../../ui/magnus-mark.tsx"
import { Notice } from "../../ui/notice.tsx"
import { Page, PageHead } from "../../ui/page.tsx"
import { SettingRow, SettingsSection } from "../../ui/settings.tsx"
import { Skeleton } from "../../ui/skeleton.tsx"
import { EmptyState, ErrorState } from "../../ui/states.tsx"
import { Tabs } from "../../ui/tabs.tsx"
import { toast } from "../../ui/toast.tsx"
import { Segmented, Toggle } from "../../ui/toggle.tsx"
import { dataState, setView, useView } from "../../view.ts"
import { BADGE_GLYPH, personName } from "./parts.tsx"
import { duplicateCourse, patchCourse, removeCourse, setBlocks, useChapters, useCourses } from "./store.ts"

type Tab = "over" | "inhoud" | "instellingen"

const KIND_GLYPH = { text: FileText, video: Video, image: Image, quiz: MessageSquare } as const

/** What still stops a draft from going live, in words. */
function problems(c: Course): ReadonlyArray<string> {
  const out: Array<string> = []
  if (c.blocks.length === 0) out.push("Er staat nog geen blok in.")
  c.blocks.forEach((b, i) => {
    if (b.kind === "quiz" && (b.question.trim() === "" || b.options.some((o) => o.trim() === ""))) {
      out.push(`Blok ${i + 1} is een vraag zonder vraag of met lege antwoorden.`)
    }
  })
  if (c.description.trim() === "") out.push("Er staat nog geen omschrijving bij.")
  return out
}

/**
 * One course for the people who write it: about, content (blocks in order) and settings. Rebuilt from
 * `/app/courses/$id` (`course-editor.tsx`). A draft goes live once every question is filled in.
 */
export function CourseScreen({ id }: { readonly id: string }) {
  const access = useAccess("courses")
  const state = dataState(useView())
  const course = useCourses().find((c) => c.id === id)

  if (!access.view) {
    return (
      <Page width="text">
        <PageHead title="Cursus" />
        <Denied area="courses" what="deze cursus" />
      </Page>
    )
  }
  if (state === "loading") {
    return (
      <Page width="record" label="Cursus laden">
        <div aria-busy="true" className="flex flex-col gap-4">
          <Skeleton className="h-6 w-80 max-w-full" />
          <Skeleton className="h-9 w-72" />
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      </Page>
    )
  }
  if (state === "error") {
    return (
      <Page width="record">
        <ErrorState
          title="Deze cursus kwam niet binnen"
          detail={`GET /v1/courses/${id} · 503 · verzoek 5d12ab`}
          action={<Button onClick={() => setView({ staat: "gewoon" })}>Opnieuw proberen</Button>}
        />
      </Page>
    )
  }
  if (course === undefined) {
    return (
      <Page width="text">
        <EmptyState
          title="Deze cursus bestaat niet (meer)"
          action={<Button onClick={() => navigate(paths.courses)}>Naar Cursussen</Button>}
        >
          Misschien is hij verwijderd.
        </EmptyState>
      </Page>
    )
  }
  if (!access.edit) {
    return (
      <Page width="text">
        <PageHead title={course.title} />
        <Denied area="courses" need={2} what="deze cursus" />
        <div className="flex justify-center">
          <ButtonLink to={`${paths.course(course.id)}/leren`}>Cursus volgen</ButtonLink>
        </div>
      </Page>
    )
  }
  return <Editor key={course.id} course={course} canManage={access.manage} />
}

function Editor({ course, canManage }: { readonly course: Course; readonly canManage: boolean }) {
  const tab = (useQuery("tab") ?? "over") as Tab
  const issues = problems(course)
  const status = course.status === "live"
    ? <Status tone="good">Live</Status>
    : course.status === "concept"
    ? <Status>Concept</Status>
    : <Status tone="warn">Gearchiveerd</Status>

  return (
    <Page width="record">
      <div className="flex flex-col gap-4">
        <Link
          to={course.status === "live"
            ? `${paths.courses}?view=alle`
            : `${paths.courses}?view=${course.status === "concept" ? "concepten" : "archief"}`}
          className="flex h-7 items-center gap-1 self-start rounded-sm pr-2 text-sm text-ink-3 hover:text-ink pointer-coarse:h-11"
        >
          <ArrowLeft size={14} />
          Cursussen
        </Link>
        <PageHead
          title={course.title}
          meta={
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {status}
              <span>
                {course.blocks.length} blokken · {minutesOf(course)} min · van {personName(course.author)} · bewerkt
                {" "}
                {course.updated}
              </span>
            </span>
          }
          actions={
            <>
              <ButtonLink to={`${paths.course(course.id)}/leren`} icon={<Eye />}>Bekijken</ButtonLink>
              {course.status === "concept" && (
                <Button
                  variant="primary"
                  disabled={issues.length > 0}
                  onClick={() => {
                    patchCourse(course.id, { status: "live" })
                    toast({
                      title: `${course.title} staat live`,
                      body: `${audienceLabel(course.audience, personName)} ziet hem bij Mijn cursussen.`,
                      tone: "good",
                      action: { label: "Ongedaan maken", onClick: () => patchCourse(course.id, { status: "concept" }) }
                    })
                  }}
                >
                  Live zetten
                </Button>
              )}
              <DropdownMenu
                label="Meer acties"
                placement="bottom-end"
                trigger={(props) => (
                  <IconButton label="Meer acties" tone="outline" {...props}>
                    <MoreHorizontal />
                  </IconButton>
                )}
              >
                <DropdownItem
                  glyph={Copy}
                  onSelect={() => {
                    const id = duplicateCourse(course)
                    toast({
                      title: `“${course.title} (kopie)” gemaakt`,
                      body: "Als concept, met dezelfde blokken en instellingen.",
                      tone: "good"
                    })
                    navigate(`${paths.course(id)}?tab=inhoud`)
                  }}
                >
                  Dupliceren
                </DropdownItem>
                {course.status === "live" && (
                  <DropdownItem
                    glyph={RotateCcw}
                    onSelect={() => {
                      patchCourse(course.id, { status: "concept" })
                      toast({
                        title: `“${course.title}” terug naar concept`,
                        body: "Het team ziet hem niet meer. De voortgang blijft bewaard.",
                        action: { label: "Ongedaan maken", onClick: () => patchCourse(course.id, { status: "live" }) }
                      })
                    }}
                  >
                    Publicatie intrekken
                  </DropdownItem>
                )}
                {canManage && (
                  <DropdownItem
                    glyph={course.status === "archief" ? Undo : Archive}
                    onSelect={() => {
                      const before = course.status
                      const next = course.status === "archief" ? "concept" : "archief"
                      patchCourse(course.id, { status: next })
                      toast({
                        title: next === "archief" ? "Gearchiveerd" : "Teruggezet als concept",
                        body: next === "archief" ? "De voortgang van het team blijft bewaard." : undefined,
                        action: { label: "Ongedaan maken", onClick: () => patchCourse(course.id, { status: before }) }
                      })
                    }}
                  >
                    {course.status === "archief" ? "Terugzetten" : "Archiveren"}
                  </DropdownItem>
                )}
                {canManage && (
                  <>
                    <DropdownSeparator />
                    <DropdownItem
                      glyph={Trash}
                      tone="danger"
                      onSelect={() => {
                        const undo = removeCourse(course.id)
                        navigate(paths.courses)
                        toast({
                          title: `“${course.title}” verwijderd`,
                          body: "Ook de voortgang en de vragen erbij.",
                          action: { label: "Ongedaan maken", onClick: undo }
                        })
                      }}
                    >
                      Verwijderen
                    </DropdownItem>
                  </>
                )}
              </DropdownMenu>
            </>
          }
        />
        {course.status === "concept" && issues.length > 0 && (
          <Notice tone="info" title="Nog niet klaar om live te zetten">
            <ul className="list-disc pl-4">{issues.map((x) => <li key={x}>{x}</li>)}</ul>
          </Notice>
        )}
        <Tabs
          label="Cursus"
          value={tab}
          onChange={(next) => setQuery({ tab: next === "over" ? null : next, blok: null })}
          tabs={[
            { value: "over", label: "Over de cursus" },
            { value: "inhoud", label: "Inhoud", count: course.blocks.length },
            { value: "instellingen", label: "Instellingen" }
          ]}
        />
      </div>
      <div className="pt-6">
        {tab === "over" && <About course={course} />}
        {tab === "inhoud" && <Content course={course} />}
        {tab === "instellingen" && <Settings course={course} />}
      </div>
    </Page>
  )
}

function About({ course }: { readonly course: Course }) {
  const chapters = useChapters()
  return (
    <div className="flex max-w-xl flex-col gap-5">
      <Field label="Titel">
        {(control) => (
          <Input
            {...control}
            value={course.title}
            onChange={(event) => patchCourse(course.id, { title: event.target.value })}
          />
        )}
      </Field>
      <Field label="Omschrijving" hint="Eén zin: wat iemand na deze cursus kan.">
        {(control) => (
          <Textarea
            {...control}
            rows={3}
            value={course.description}
            onChange={(event) => patchCourse(course.id, { description: event.target.value })}
          />
        )}
      </Field>
      <Field label="Waar hij staat">
        {(control) => (
          <Select
            {...control}
            value={`${course.chapterId}/${course.moduleId}`}
            onChange={(event) => {
              const [chapterId, moduleId] = event.target.value.split("/")
              patchCourse(course.id, { chapterId: chapterId ?? "", moduleId: moduleId ?? "" })
            }}
          >
            {chapters.map((ch) => (
              <optgroup key={ch.id} label={ch.title}>
                {ch.modules.map((m) => <option key={m.id} value={`${ch.id}/${m.id}`}>{m.title}</option>)}
              </optgroup>
            ))}
          </Select>
        )}
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="pb-2 text-sm font-medium text-ink">Badge</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(BADGE_LABEL) as Array<Badge>).map((b) => {
            const G = BADGE_GLYPH[b]
            const on = course.badge === b
            return (
              <button
                key={b}
                type="button"
                aria-pressed={on}
                onClick={() => patchCourse(course.id, { badge: b })}
                className={cx(
                  "flex size-11 items-center justify-center rounded-md transition-colors",
                  on ? "bg-accent-tint text-accent-ink ring-2 ring-accent" : "bg-well text-ink-2 hover:bg-hover"
                )}
              >
                <G size={18} />
                <span className="sr-only">{BADGE_LABEL[b]}</span>
              </button>
            )
          })}
        </div>
        <p className="text-xs text-ink-3">Wie de cursus haalt, krijgt hem op zijn profiel.</p>
      </fieldset>
    </div>
  )
}

const blank = (kind: BlockKind, id: string): Block =>
  kind === "text"
    ? { id, kind, title: "", body: "" }
    : kind === "video"
    ? { id, kind, title: "", minutes: 3 }
    : kind === "image"
    ? { id, kind, title: "", caption: "" }
    : { id, kind, question: "", options: ["", "", ""], correct: 0, explain: "" }

const titleOf = (b: Block) => (b.kind === "quiz" ? b.question : b.title)

function Content({ course }: { readonly course: Course }) {
  const open = useQuery("blok")
  const block = course.blocks.find((b) => b.id === open)
  const [proposal, setProposal] = useState<ReadonlyArray<QuizBlock> | null>(null)
  const texts = course.blocks.filter((b) => b.kind === "text").length
  const propose = () => {
    const qs = suggestQuestions(course)
    if (qs.length === 0) {
      toast({
        title: "Geen vragen gevonden",
        body:
          "Magnus maakt vragen van zinnen met een getal of een termijn erin. Schrijf er een in een tekstblok en probeer het opnieuw."
      })
      return
    }
    setProposal(qs)
  }
  const take = (q: QuizBlock) => {
    const id = `${course.id}-${crypto.randomUUID().slice(0, 8)}`
    setBlocks(course.id, [...course.blocks, { ...q, id }])
    const rest = (proposal ?? []).filter((x) => x.id !== q.id)
    setProposal(rest.length === 0 ? null : rest)
    toast({
      title: "Vraag toegevoegd",
      body: `Als blok ${course.blocks.length + 1}. Je kunt hem nog aanpassen.`,
      tone: "good",
      action: { label: "Ongedaan maken", onClick: () => setBlocks(course.id, course.blocks) }
    })
  }
  const drop = (q: QuizBlock) => {
    const rest = (proposal ?? []).filter((x) => x.id !== q.id)
    setProposal(rest.length === 0 ? null : rest)
  }

  const move = (i: number, by: number) => {
    const next = [...course.blocks]
    const [b] = next.splice(i, 1)
    if (b === undefined) return
    next.splice(i + by, 0, b)
    setBlocks(course.id, next)
  }
  const add = (kind: BlockKind) => {
    const b = blank(kind, `${course.id}-${crypto.randomUUID().slice(0, 8)}`)
    setBlocks(course.id, [...course.blocks, b])
    setQuery({ blok: b.id })
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {course.blocks.length === 0
        ? <p className="text-sm text-ink-2">Nog leeg. Begin met een tekstblok en zet er een vraag achter.</p>
        : (
          <ol className="flex flex-col divide-y divide-line" aria-label="Blokken">
            {course.blocks.map((b, i) => {
              const G = KIND_GLYPH[b.kind]
              const t = titleOf(b)
              return (
                <li key={b.id} className="flex items-center gap-3 py-2">
                  <span className="figure w-5 shrink-0 text-right text-xs text-ink-3">{i + 1}</span>
                  <button
                    type="button"
                    onClick={() => setQuery({ blok: b.id })}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md px-2 text-left hover:bg-hover"
                  >
                    <G size={15} className="shrink-0 text-ink-3" />
                    <span className="flex min-w-0 flex-col">
                      <span className={cx("truncate text-sm", t === "" ? "text-ink-3 italic" : "text-ink")}>
                        {t === "" ? "Nog zonder titel" : t}
                      </span>
                      <span className="text-xs text-ink-3">
                        {BLOCK_LABEL[b.kind]}
                        {b.kind === "video" ? ` · ${b.minutes} min` : ""}
                        {b.kind === "quiz" ? ` · ${b.options.length} antwoorden` : ""}
                      </span>
                    </span>
                  </button>
                  <IconButton
                    label="Omhoog"
                    size="sm"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    className="pointer-coarse:size-11"
                  >
                    <ArrowUp />
                  </IconButton>
                  <IconButton
                    label="Omlaag"
                    size="sm"
                    disabled={i === course.blocks.length - 1}
                    onClick={() => move(i, 1)}
                    className="pointer-coarse:size-11"
                  >
                    <ArrowDown />
                  </IconButton>
                </li>
              )
            })}
          </ol>
        )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 pr-1 text-sm text-ink-3">
          <Plus size={14} />Blok toevoegen
        </span>
        {(["text", "video", "image", "quiz"] as const).map((k) => {
          const G = KIND_GLYPH[k]
          return <Button key={k} size="sm" icon={<G />} onClick={() => add(k)}>{BLOCK_LABEL[k]}</Button>
        })}
        <span className="flex-1" />
        <Button size="sm" variant="ghost" icon={<Sparkles />} disabled={texts === 0} onClick={propose}>
          Vragen laten voorstellen
        </Button>
      </div>
      {proposal !== null && (
        <section
          aria-label={`Voorstel van ${ASSISTANT}`}
          className="grid gap-x-3 pt-2 sm:grid-cols-[28px_minmax(0,1fr)]"
        >
          <span className="hidden pt-0.5 sm:flex">
            <MagnusMark size={22} />
          </span>
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex items-start gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="text-xs text-ink-3">
                  <span className="font-medium text-ink-2">{ASSISTANT}</span> · voorstel · staat nog niet in de cursus
                </p>
                <p className="text-sm font-semibold text-ink">
                  {proposal.length === 1 ? "Eén vraag" : `${proposal.length} vragen`} bij deze cursus
                </p>
                <p className="text-sm text-pretty text-ink-2">
                  Gemaakt van zinnen in je tekst met een getal of een termijn. De foute antwoorden zijn dezelfde zin met
                  een ander getal.
                </p>
              </div>
              <IconButton label="Voorstel sluiten" size="sm" onClick={() => setProposal(null)}>
                <X />
              </IconButton>
            </div>
            <ul className="flex flex-col divide-y divide-line">
              {proposal.map((q) => (
                <li key={q.id} className="flex flex-col gap-2 py-3">
                  <p className="text-xs text-ink-3">{q.question} Goed antwoord:</p>
                  <p className="text-sm text-pretty text-ink">{q.explain}</p>
                  <p className="text-xs text-ink-3">
                    Fout: {q.options.filter((_, i) => i !== q.correct).map((o) => `‘${o}’`).join(" en ")}
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" icon={<Plus />} onClick={() => take(q)}>Toevoegen</Button>
                    <Button size="sm" variant="ghost" onClick={() => drop(q)}>Weggooien</Button>
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-xs text-ink-3">
              Bron: {texts === 1 ? "1 tekstblok" : `${texts} tekstblokken`}
            </p>
          </div>
        </section>
      )}
      <BlockSheet course={course} block={block} onClose={() => setQuery({ blok: null })} />
    </div>
  )
}

function BlockSheet(
  { course, block, onClose }: {
    readonly course: Course
    readonly block: Block | undefined
    readonly onClose: () => void
  }
) {
  const put = (next: Block) => setBlocks(course.id, course.blocks.map((b) => (b.id === next.id ? next : b)))
  const i = block === undefined ? -1 : course.blocks.findIndex((b) => b.id === block.id)
  return (
    <Sheet
      open={block !== undefined}
      onClose={onClose}
      title={block === undefined ? "" : `Blok ${i + 1} · ${BLOCK_LABEL[block.kind]}`}
      footer={block !== undefined && (
        <div className="flex w-full justify-between gap-2">
          <Button
            variant="ghost"
            icon={<Trash />}
            onClick={() => {
              const before = course.blocks
              setBlocks(course.id, course.blocks.filter((b) => b.id !== block.id))
              onClose()
              toast({
                title: "Blok verwijderd",
                action: { label: "Ongedaan maken", onClick: () => setBlocks(course.id, before) }
              })
            }}
          >
            Verwijderen
          </Button>
          <Button variant="primary" onClick={onClose}>Klaar</Button>
        </div>
      )}
    >
      {block !== undefined && (
        <div className="flex flex-col gap-5">
          {block.kind === "quiz"
            ? (
              <>
                <Field label="Vraag">
                  {(control) => (
                    <Input
                      {...control}
                      value={block.question}
                      onChange={(event) => put({ ...block, question: event.target.value })}
                    />
                  )}
                </Field>
                <fieldset className="flex flex-col gap-2">
                  <legend className="pb-1 text-sm font-medium text-ink">Antwoorden</legend>
                  <p className="text-xs text-ink-3">Vink het goede antwoord aan.</p>
                  {block.options.map((o, n) => (
                    <div key={n} className="flex items-center gap-2">
                      <Checkbox
                        checked={block.correct === n}
                        onChange={() => put({ ...block, correct: n })}
                        label={`Antwoord ${n + 1} is goed`}
                      />
                      <Input
                        aria-label={`Antwoord ${n + 1}`}
                        value={o}
                        className="flex-1"
                        onChange={(event) =>
                          put({ ...block, options: block.options.map((x, k) => (k === n ? event.target.value : x)) })}
                      />
                      <IconButton
                        label={`Antwoord ${n + 1} weghalen`}
                        size="sm"
                        disabled={block.options.length <= 2}
                        onClick={() =>
                          put({
                            ...block,
                            options: block.options.filter((_, k) => k !== n),
                            correct: block.correct >= n && block.correct > 0 ? block.correct - 1 : block.correct
                          })}
                      >
                        <Trash />
                      </IconButton>
                    </div>
                  ))}
                  <div>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Plus />}
                      disabled={block.options.length >= 5}
                      onClick={() => put({ ...block, options: [...block.options, ""] })}
                    >
                      Antwoord
                    </Button>
                  </div>
                </fieldset>
                <Field label="Uitleg na het antwoord">
                  {(control) => (
                    <Textarea
                      {...control}
                      rows={2}
                      value={block.explain}
                      onChange={(event) => put({ ...block, explain: event.target.value })}
                    />
                  )}
                </Field>
              </>
            )
            : (
              <Field label="Titel">
                {(control) => (
                  <Input
                    {...control}
                    value={block.title}
                    onChange={(event) => put({ ...block, title: event.target.value })}
                  />
                )}
              </Field>
            )}
          {block.kind === "text" && (
            <Field label="Tekst" hint="Een regel die met - begint wordt een opsomming.">
              {(control) => (
                <Textarea
                  {...control}
                  rows={8}
                  value={block.body}
                  onChange={(event) => put({ ...block, body: event.target.value })}
                />
              )}
            </Field>
          )}
          {block.kind === "video" && (
            <Field label="Lengte in minuten">
              {(control) => (
                <Input
                  {...control}
                  inputMode="numeric"
                  value={String(block.minutes)}
                  onChange={(event) =>
                    put({ ...block, minutes: Math.max(1, Number(event.target.value.replace(/\D/g, "")) || 1) })}
                />
              )}
            </Field>
          )}
          {block.kind === "image" && <ImageUpload block={block} onChange={put} />}
          {block.kind === "image" && (
            <Field label="Onderschrift">
              {(control) => (
                <Input
                  {...control}
                  value={block.caption}
                  onChange={(event) => put({ ...block, caption: event.target.value })}
                />
              )}
            </Field>
          )}
        </div>
      )}
    </Sheet>
  )
}

function Settings({ course }: { readonly course: Course }) {
  const roles = ["Klantenservice", "CX-lead", "Operations", "Eigenaar", "Teamlid"]
  const audience = course.audience
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <SettingsSection id="volgen" title="Wie volgt hem">
        <SettingRow
          title="Voor"
          stack
          control={
            <div className="flex flex-col gap-3">
              <Segmented
                label="Voor wie"
                value={audience.kind}
                onChange={(kind) =>
                  patchCourse(course.id, {
                    audience: kind === "all" ? { kind } : { kind, roles: ["Klantenservice"], people: [] }
                  })}
                options={[{ value: "all", label: "Iedereen" }, { value: "some", label: "Bepaalde rollen" }]}
              />
              {audience.kind === "some" && (
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {roles.map((r) => (
                    <Checkbox
                      key={r}
                      label={r}
                      checked={audience.roles.includes(r)}
                      onChange={(on) =>
                        patchCourse(course.id, {
                          audience: {
                            ...audience,
                            roles: on ? [...audience.roles, r] : audience.roles.filter((x) => x !== r)
                          }
                        })}
                    />
                  ))}
                </div>
              )}
            </div>
          }
        />
        <SettingRow
          title="Leveranciers"
          description="Een leverancier volgt hem in zijn eigen portaal."
          stack
          control={
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {SUPPLIERS.map((s) => (
                <Checkbox
                  key={s.id}
                  label={s.name}
                  checked={course.suppliers.includes(s.id)}
                  onChange={(on) =>
                    patchCourse(course.id, {
                      suppliers: on ? [...course.suppliers, s.id] : course.suppliers.filter((x) => x !== s.id)
                    })}
                />
              ))}
            </div>
          }
        />
        <SettingRow
          title="Deadline"
          description={course.overdue === true
            ? "Verlopen. Wie hem nog niet haalde, staat in rood bij de voortgang."
            : "Optioneel. Insyte herinnert twee dagen ervoor."}
          control={
            <Select
              aria-label="Deadline"
              value={course.deadline ?? ""}
              onChange={(event) =>
                patchCourse(
                  course.id,
                  event.target.value === ""
                    ? { deadline: undefined, overdue: false }
                    : { deadline: event.target.value, overdue: false }
                )}
              className="w-36"
            >
              <option value="">Geen</option>
              {course.deadline !== undefined && <option value={course.deadline}>{course.deadline}</option>}
              {["30 nov", "2 dec", "7 dec", "14 dec"].filter((d) => d !== course.deadline).map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </Select>
          }
        />
      </SettingsSection>
      <SettingsSection id="leren" title="Leren">
        <SettingRow
          title="Volgorde"
          description={course.order === "vast"
            ? "Blok voor blok; het volgende opent als het vorige klaar is."
            : "Elk blok is meteen open."}
          control={
            <Segmented
              label="Volgorde"
              value={course.order}
              onChange={(order) => patchCourse(course.id, { order })}
              options={[{ value: "vrij", label: "Vrij" }, { value: "vast", label: "Vast" }]}
            />
          }
        />
        <SettingRow
          title="Slagingsgrens"
          description="Het deel van de vragen dat goed moet zijn."
          control={
            <Select
              aria-label="Slagingsgrens"
              value={String(course.passMark)}
              onChange={(event) => patchCourse(course.id, { passMark: Number(event.target.value) })}
              className="w-28"
            >
              {[50, 60, 70, 80, 90, 100].map((n) => <option key={n} value={n}>{n}%</option>)}
            </Select>
          }
        />
        <SettingRow
          title="Vragen stellen"
          description="Wie de cursus volgt kan bij elk blok een vraag stellen; die komt bij Vragen binnen."
          control={
            <Toggle
              label="Vragen stellen"
              on={course.questions}
              onChange={(questions) => patchCourse(course.id, { questions })}
            />
          }
        />
      </SettingsSection>
    </div>
  )
}

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"]

/** The picture of an image block: dropped or picked, checked for kind and size, shown with a way to swap it. */
function ImageUpload(
  { block, onChange }: {
    readonly block: Extract<Block, { kind: "image" }>
    readonly onChange: (b: Block) => void
  }
) {
  const [error, setError] = useState<string | undefined>(undefined)
  const pick = (file: File | undefined) => {
    if (file === undefined) return
    if (!IMAGE_TYPES.includes(file.type)) {
      setError("Dat is geen afbeelding. Kies een PNG, JPG of WebP.")
      return
    }
    if (file.size > 1_500_000) {
      setError("Die afbeelding is te groot. Kies er een tot 1,5 MB, of verklein hem eerst.")
      return
    }
    setError(undefined)
    const reader = new FileReader()
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        onChange({ ...block, src: reader.result })
        toast({ title: `${file.name} toegevoegd`, tone: "good" })
      }
    })
    reader.readAsDataURL(file)
  }
  if (block.src !== undefined) {
    return (
      <figure className="flex flex-col gap-2">
        <img src={block.src} alt={block.title} className="max-h-72 w-full rounded-md bg-well object-contain" />
        <div className="flex gap-2">
          <label className="inline-flex h-8 cursor-pointer items-center rounded-sm px-2.5 text-sm font-medium text-ink ring-1 ring-line-strong hover:bg-hover focus-within:ring-2 focus-within:ring-accent pointer-coarse:h-11">
            Vervangen
            <input
              type="file"
              accept={IMAGE_TYPES.join(",")}
              className="sr-only"
              onChange={(event) => {
                pick(event.target.files?.[0])
                event.target.value = ""
              }}
            />
          </label>
          <Button
            variant="ghost"
            icon={<Trash />}
            onClick={() => onChange({ id: block.id, kind: "image", title: block.title, caption: block.caption })}
          >
            Weghalen
          </Button>
        </div>
      </figure>
    )
  }
  return (
    <FileDrop
      accept={IMAGE_TYPES.join(",")}
      label="Sleep een afbeelding hierheen of kies er een"
      hint="PNG, JPG of WebP, tot 1,5 MB"
      invalid={error}
      onFiles={(files) => pick(files[0])}
    />
  )
}
