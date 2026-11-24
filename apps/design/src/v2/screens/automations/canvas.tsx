import { useLayoutEffect, useRef, useState } from "react"
import type { DragEvent } from "react"
import { ASSISTANT } from "../../assistant.ts"
import { flatSteps, SCOPES, STEP_KIND, STEP_TYPES, stepType } from "../../fixtures/automations.ts"
import type { Automation, Run, Step, StepKind } from "../../fixtures/automations.ts"
import { Link, navigate, paths, setQuery, useQuery } from "../../router.tsx"
import { useAccess } from "../../ui/access.tsx"
import { Button, IconButton } from "../../ui/button.tsx"
import { cx } from "../../ui/cx.ts"
import { Dialog, Sheet } from "../../ui/dialog.tsx"
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  GripVertical,
  Maximize,
  Minus,
  Plus,
  Trash,
  X
} from "../../ui/icons.tsx"
import { Field, Input, SearchField } from "../../ui/input.tsx"
import { KeyValue } from "../../ui/key-value.tsx"
import { List, ListRow } from "../../ui/list.tsx"
import { MagnusMark } from "../../ui/magnus-mark.tsx"
import { Notice } from "../../ui/notice.tsx"
import { PageSection } from "../../ui/page.tsx"
import { ServiceLogo } from "../../ui/service-logo.tsx"
import { toast } from "../../ui/toast.tsx"
import {
  draftFromPrompt,
  findStep,
  insertStep,
  issuesOf,
  isTrigger,
  listAt,
  moveStep,
  nameOf,
  newStep,
  placeOf,
  PROMPTS,
  removeStep,
  updateStep
} from "./edits.ts"
import type { Lane, Place } from "./edits.ts"
import { KIND_GLYPH, RunStatusLabel, sentence } from "./parts.tsx"
import { patch, setSteps, useTest } from "./store.ts"

/** The fields of the record a step can write as `{{veld}}`, with the words the chip shows. */
const FIELDS: ReadonlyArray<readonly [string, string]> = [
  ["klant.voornaam", "Voornaam"],
  ["klant.e-mail", "E-mail klant"],
  ["bestelling.nummer", "Bestelnummer"],
  ["bestelling.totaal", "Totaal"],
  ["bestelling.vervoerder", "Vervoerder"]
]
const fieldLabel = (key: string) => FIELDS.find(([k]) => k === key)?.[1] ?? key

/** A field as a chip. */
function FieldChip({ name }: { readonly name: string }) {
  return (
    <span className="mx-px inline-flex h-[18px] items-center rounded-xs bg-accent-tint px-1 align-[1px] text-xs font-medium text-accent-ink">
      {fieldLabel(name)}
    </span>
  )
}

/** Text with `{{veld}}` read back as chips. */
function FieldText({ text, className }: { readonly text: string; readonly className?: string }) {
  const parts = text.split(/\{\{([^}]+)\}\}/g)
  return (
    <span className={className}>
      {parts.map((p, i) => (i % 2 === 1 ? <FieldChip key={`${i}-${p}`} name={p} /> : <span key={`${i}-t`}>{p}</span>))}
    </span>
  )
}

type Drag = { readonly kind: "move"; readonly id: string } | { readonly kind: "new"; readonly type: string } | null

const DRAG_TYPE = "application/x-insyte-step"
const CARD_W = 288
const LANE_GAP = 40

/**
 * The Workflow tab: the flow from the trigger down on a canvas, a + on every connector (click it to
 * pick a step, or drop a step on it), a Ja/nee-splitsing drawn as two lanes that meet again, zoom at
 * the foot, and a line where a sentence becomes steps. Rebuilt from `/app/automations/$id`
 * (`workflow-canvas.tsx`, `workflow-builder.tsx`) in this version's quieter hand.
 */
export function WorkflowTab({ flow, runs }: { readonly flow: Automation; readonly runs: ReadonlyArray<Run> }) {
  const access = useAccess("automations")
  const canEdit = access.edit
  const [adding, setAdding] = useState<Place | null>(null)
  const [drag, setDrag] = useState<Drag>(null)
  const openId = useQuery("stap")
  const step = findStep(flow.steps, openId)
  const test = useTest(flow.id)
  const issues = issuesOf(flow)
  const hasTrigger = isTrigger(flow.steps[0])

  const add = (type: string, place: Place) => {
    const t = stepType(type)
    if (t === undefined) return
    if (t.kind === "trigger" && place.lane !== undefined) return
    if (type === "branch" && place.lane !== undefined) {
      toast({
        title: "Een ja/nee-splitsing kan alleen in de hoofdlijn",
        body: "Zet hem boven of onder de splitsing die er al staat."
      })
      return
    }
    const st = newStep(type)
    const next = insertStep(flow.steps, st, place)
    if (next === null) return
    setSteps(flow.id, next)
    setAdding(null)
    if (t.kind === "trigger") toast({ title: `Trigger is nu ${t.label}` })
    setQuery({ stap: st.id })
  }

  const drop = (place: Place, d: Drag) => {
    setDrag(null)
    if (d === null || !canEdit) return
    if (d.kind === "new") return add(d.type, place)
    const next = moveStep(flow.steps, d.id, place)
    if (next === null) {
      const moving = findStep(flow.steps, d.id)
      if (moving?.branches !== undefined) {
        toast({ title: "Een splitsing kan niet in een andere splitsing", body: "Zet hem in de hoofdlijn." })
      }
      return
    }
    const before = flow.steps
    setSteps(flow.id, next)
    toast({ title: "Stap verplaatst", action: { label: "Ongedaan maken", onClick: () => setSteps(flow.id, before) } })
  }

  const drafted = (steps: ReadonlyArray<Step>) => {
    const before = flow.steps
    const name = flow.name
    const untitled = name === "Nieuwe automatisering"
    setSteps(flow.id, steps)
    if (untitled) patch(flow.id, { name: nameOf(steps) })
    const n = flatSteps(steps).length
    toast({
      title: `${ASSISTANT} zette ${n} stappen neer`,
      body: before.length > 0
        ? "Wat er stond, komt terug met Ongedaan maken."
        : "Klik een stap om hem aan te passen, test hem en publiceer als het klopt.",
      action: before.length > 0
        ? {
          label: "Ongedaan maken",
          onClick: () => {
            setSteps(flow.id, before)
            patch(flow.id, { name })
          }
        }
        : undefined
    })
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-10">
      <section aria-labelledby="flow-stappen" className="flex min-w-0 flex-col gap-4">
        <h2 id="flow-stappen" className="sr-only">Stappen</h2>
        {flow.unpublished === true && flow.version > 0 && (
          <Notice tone="info" title="Er zijn wijzigingen die nog niet live staan">
            Lopende runs gebruiken v{flow.version}. Publiceer om de nieuwe stappen live te zetten.
          </Notice>
        )}
        <p className="max-w-[64ch] text-sm text-pretty text-ink-2">{sentence(flow)}</p>
        {canEdit && <PromptBar onDraft={(text) => drafted(draftFromPrompt(text))} />}
        <FlowCanvas
          flow={flow}
          canEdit={canEdit}
          drag={drag}
          issues={issues}
          test={test}
          hasTrigger={hasTrigger}
          onAdd={setAdding}
          onDrop={drop}
          onDrag={setDrag}
        />
      </section>

      <aside aria-label="Bij deze flow" className="flex flex-col gap-8">
        {canEdit && <StepShelf onDrag={setDrag} onPick={(type) => add(type, { index: flow.steps.length })} />}
        <PageSection
          title="Laatste uitvoeringen"
          id="flow-laatst"
          actions={runs.length > 0 && (
            <Link
              to={`${paths.automation(flow.id)}?tab=uitvoeringen`}
              className="text-xs text-ink-3 underline-offset-2 hover:text-ink hover:underline"
            >
              Alle {runs.length}
            </Link>
          )}
        >
          {runs.length === 0
            ? (
              <p className="text-sm text-ink-3">
                {flow.version === 0
                  ? "Nog geen: publiceer de flow om hem te laten draaien."
                  : "De trigger is nog niet afgegaan."}
              </p>
            )
            : (
              <List label="Laatste uitvoeringen">
                {runs.slice(0, 5).map((r) => (
                  <ListRow
                    key={r.id}
                    title={r.record?.label ?? "Volgens schema"}
                    meta={[r.record?.who, r.at].filter(Boolean).join(" · ")}
                    trail={<RunStatusLabel status={r.status} />}
                    onClick={() => navigate(`${paths.automation(flow.id)}?tab=uitvoeringen&run=${r.id}`)}
                  />
                ))}
              </List>
            )}
        </PageSection>
        {flow.touches.length > 0 && (
          <PageSection title="Raakt aan" id="flow-raakt">
            <List label="Wat de flow aanraakt">
              {flow.touches.map((t) => <ListRow key={t.href + t.label} title={t.label} meta={t.meta} href={t.href} />)}
            </List>
          </PageSection>
        )}
      </aside>

      <StepSheet
        flow={flow}
        step={step}
        issues={step === undefined ? [] : issues.get(step.id) ?? []}
        onClose={() => setQuery({ stap: null })}
      />
      <Palette
        place={adding}
        trigger={!hasTrigger && adding?.index === 0 && adding.lane === undefined}
        onClose={() => setAdding(null)}
        onPick={(type) => adding !== null && add(type, adding)}
      />
    </div>
  )
}

/* ── the canvas ──────────────────────────────────────────────────────────────────────────────── */

function FlowCanvas({ flow, canEdit, drag, issues, test, hasTrigger, onAdd, onDrop, onDrag }: {
  readonly flow: Automation
  readonly canEdit: boolean
  readonly drag: Drag
  readonly issues: ReadonlyMap<string, ReadonlyArray<string>>
  readonly test: ReturnType<typeof useTest>
  readonly hasTrigger: boolean
  readonly onAdd: (place: Place) => void
  readonly onDrop: (place: Place, drag: Drag) => void
  readonly onDrag: (drag: Drag) => void
}) {
  const [zoom, setZoom] = useState(1)
  const scroller = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const steps = flow.steps

  const fit = () => {
    const box = scroller.current
    const el = content.current
    if (box === null || el === null) return
    const naturalW = el.scrollWidth
    const naturalH = el.scrollHeight
    const next = Math.min(1, (box.clientWidth - 64) / naturalW, (Math.max(box.clientHeight, 480) - 64) / naturalH)
    setZoom(Math.max(0.5, Math.floor(next * 20) / 20))
    box.scrollTo({ top: 0, left: 0 })
  }
  /* A wide flow (a splitsing) opens fitted to the width, once. */
  const fitted = useRef(false)
  useLayoutEffect(() => {
    if (fitted.current || steps.length === 0) return
    fitted.current = true
    const box = scroller.current
    const el = content.current
    if (box !== null && el !== null && el.scrollWidth > box.clientWidth - 64) {
      setZoom(Math.max(0.5, Math.floor(((box.clientWidth - 64) / el.scrollWidth) * 20) / 20))
    }
  }, [steps.length])

  const card = (st: Step, i: number) => (
    <StepCard
      key={st.id}
      step={st}
      index={i}
      canEdit={canEdit}
      issues={issues.get(st.id) ?? []}
      running={test?.at === st.id}
      done={test?.done.includes(st.id) === true}
      failed={test?.failed?.id === st.id ? test.failed.reason : undefined}
      onDrag={onDrag}
    />
  )

  const connector = (place: Place, props: { readonly end?: boolean; readonly label?: "yes" | "no" } = {}) => (
    <Connector
      key={`c-${place.lane?.branchId ?? "main"}-${place.lane?.side ?? ""}-${place.index}`}
      place={place}
      canEdit={canEdit}
      drag={drag}
      onAdd={onAdd}
      onDrop={onDrop}
      {...props}
    />
  )

  return (
    <div className="relative rounded-lg bg-well">
      <div ref={scroller} className="pane-scroll max-h-[72vh] min-h-[26rem] px-8 pt-8 pb-20">
        <div ref={content} className="mx-auto flex w-max min-w-full flex-col items-center" style={{ zoom }}>
          {steps.length === 0
            ? <EmptyCanvas canEdit={canEdit} onAdd={() => onAdd({ index: 0 })} />
            : (
              <>
                {!hasTrigger && (
                  <>
                    <MissingTrigger canEdit={canEdit} onAdd={() => onAdd({ index: 0 })} />
                    {connector({ index: 0 })}
                  </>
                )}
                {steps.map((st, i) => (
                  <div key={st.id} className="flex flex-col items-center">
                    {st.branches === undefined ? card(st, i) : (
                      <div className="flex flex-col items-center">
                        {card(st, i)}
                        <span className="h-3 w-px bg-line-strong" aria-hidden="true" />
                        <div className="relative flex" style={{ gap: LANE_GAP }}>
                          <span
                            aria-hidden="true"
                            className="absolute top-0 h-px bg-line-strong"
                            style={{ left: CARD_W / 2, right: CARD_W / 2 }}
                          />
                          <span
                            aria-hidden="true"
                            className="absolute bottom-0 h-px bg-line-strong"
                            style={{ left: CARD_W / 2, right: CARD_W / 2 }}
                          />
                          {(["yes", "no"] as const).map((side) => {
                            const lane: Lane = { branchId: st.id, side }
                            const list = st.branches?.[side] ?? []
                            return (
                              <div
                                key={side}
                                role="group"
                                aria-label={side === "yes" ? "Als het klopt" : "Als het niet klopt"}
                                className="flex flex-col items-center"
                                style={{ width: CARD_W }}
                              >
                                {connector({ lane, index: 0 }, { label: side })}
                                {list.length === 0 && (
                                  <span className="rounded-sm px-3 py-2 text-xs text-ink-3">
                                    Niets: de flow gaat hier meteen verder
                                  </span>
                                )}
                                {list.map((x, j) => (
                                  <div key={x.id} className="flex flex-col items-center">
                                    {card(x, j)}
                                    {connector({ lane, index: j + 1 })}
                                  </div>
                                ))}
                                <span className="min-h-3 w-px flex-1 bg-line-strong" aria-hidden="true" />
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    {connector({ index: i + 1 }, { end: i === steps.length - 1 })}
                  </div>
                ))}
                <span className="rounded-full px-2.5 py-1 text-xs text-ink-3">Einde</span>
              </>
            )}
        </div>
      </div>
      <div className="absolute bottom-3 left-3 flex items-center gap-0.5 rounded-md bg-canvas p-0.5 shadow-sm">
        <IconButton
          label="Uitzoomen"
          size="sm"
          disabled={zoom <= 0.5}
          onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 100) / 100))}
        >
          <Minus />
        </IconButton>
        <button
          type="button"
          onClick={() => setZoom(1)}
          aria-label={`Zoom ${Math.round(zoom * 100)}%, terug naar 100%`}
          className="figure h-7 min-w-12 rounded-sm px-1 text-xs text-ink-2 hover:bg-hover"
        >
          {Math.round(zoom * 100)}%
        </button>
        <IconButton
          label="Inzoomen"
          size="sm"
          disabled={zoom >= 1.5}
          onClick={() => setZoom((z) => Math.min(1.5, Math.round((z + 0.1) * 100) / 100))}
        >
          <Plus />
        </IconButton>
        <IconButton label="Passend maken" size="sm" onClick={fit}>
          <Maximize />
        </IconButton>
      </div>
    </div>
  )
}

function EmptyCanvas({ canEdit, onAdd }: { readonly canEdit: boolean; readonly onAdd: () => void }) {
  return (
    <div className="flex w-80 flex-col items-center gap-3 py-10 text-center">
      <span className="flex size-9 items-center justify-center rounded-full bg-canvas text-ink-3">
        <KIND_GLYPH.trigger size={16} />
      </span>
      <p className="text-sm font-medium text-ink">Waar begint deze flow?</p>
      <p className="text-xs text-pretty text-ink-3">
        Kies een trigger, sleep er een uit Stappen, of beschrijf de flow hierboven in een zin.
      </p>
      {canEdit && <Button size="sm" icon={<Plus />} onClick={onAdd}>Trigger kiezen</Button>}
    </div>
  )
}

function MissingTrigger({ canEdit, onAdd }: { readonly canEdit: boolean; readonly onAdd: () => void }) {
  return (
    <div className="flex w-72 items-start gap-3 rounded-md bg-canvas px-3 py-2.5 shadow-xs">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-warn-tint text-warn-ink">
        <KIND_GLYPH.trigger size={14} />
      </span>
      <div className="flex min-w-0 flex-col items-start gap-1.5">
        <p className="text-sm text-ink">Nog geen trigger</p>
        <p className="text-xs text-ink-3">Zonder trigger kan de flow niet draaien.</p>
        {canEdit && <Button size="sm" onClick={onAdd}>Trigger kiezen</Button>}
      </div>
    </div>
  )
}

function StepCard({ step, index, canEdit, issues, running, done, failed, onDrag }: {
  readonly step: Step
  readonly index: number
  readonly canEdit: boolean
  readonly issues: ReadonlyArray<string>
  readonly running: boolean
  readonly done: boolean
  readonly failed: string | undefined
  readonly onDrag: (drag: Drag) => void
}) {
  const t = stepType(step.type)
  const kind: StepKind = t?.kind ?? "actie"
  const G = KIND_GLYPH[kind]
  const movable = canEdit && kind !== "trigger"
  const shown = Object.entries(step.values ?? {}).filter(([, v]) => v.trim() !== "").slice(0, 2)
  return (
    <div
      draggable={movable}
      onDragStart={(e: DragEvent<HTMLDivElement>) => {
        e.dataTransfer.setData(DRAG_TYPE, step.id)
        e.dataTransfer.effectAllowed = "move"
        onDrag({ kind: "move", id: step.id })
      }}
      onDragEnd={() => onDrag(null)}
      className={cx(
        "group relative w-72 rounded-md bg-canvas shadow-xs transition-shadow",
        running && "ring-2 ring-accent",
        failed !== undefined && "ring-2 ring-bad-ink",
        !running && failed === undefined && "hover:shadow-sm"
      )}
      style={{ width: CARD_W }}
    >
      <button
        type="button"
        onClick={() => setQuery({ stap: step.id })}
        aria-label={`${STEP_KIND[kind]}, stap ${index + 1}: ${step.summary}`}
        className="flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left"
      >
        {kind === "actie" && t?.via !== undefined
          ? <ServiceLogo service={t.via} name={t.via} size={28} />
          : (
            <span
              className={cx(
                "flex size-7 shrink-0 items-center justify-center rounded-full",
                kind === "trigger" ? "bg-ink text-on-ink" : kind === "ai" ? "ai-fill text-on-ink" : "bg-well text-ink-2"
              )}
            >
              <G size={14} />
            </span>
          )}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-xs text-ink-3">
            {STEP_KIND[kind]} · {t?.label ?? "Onbekende stap"}
          </span>
          <span className="text-sm text-ink">{step.summary}</span>
          {shown.length > 0 && (
            <span className="line-clamp-2 text-xs text-ink-3">
              {shown.map(([k, v], i) => (
                <span key={k}>
                  {i > 0 && " · "}
                  {t?.fields.find((x) => x.key === k)?.label ?? k}: <FieldText text={v} />
                </span>
              ))}
            </span>
          )}
          {failed !== undefined
            ? (
              <span className="mt-1 flex items-start gap-1.5 text-xs text-bad-ink">
                <X size={13} className="mt-px shrink-0" />
                {failed}
              </span>
            )
            : done
            ? (
              <span className="mt-1 flex items-center gap-1.5 text-xs text-good-ink">
                <Check size={13} className="shrink-0" />
                Zou hier slagen
              </span>
            )
            : issues.length > 0 && (
              <span className="mt-1 flex items-start gap-1.5 text-xs text-warn-ink">
                <AlertTriangle size={13} className="mt-px shrink-0" />
                {issues[0]}
                {issues.length > 1 ? ` (+${issues.length - 1})` : ""}
              </span>
            )}
        </span>
      </button>
      {movable && (
        <span
          aria-hidden="true"
          className="absolute top-2.5 right-1.5 cursor-grab text-ink-4 opacity-0 transition-opacity group-hover:opacity-100"
        >
          <GripVertical size={14} />
        </span>
      )}
    </div>
  )
}

/**
 * A connector with a + on it. While a step is dragged every + is a target and lights up as the step
 * passes over it; at rest the + is quiet and a click picks a step for that place.
 */
function Connector({ place, canEdit, drag, onAdd, onDrop, end = false, label }: {
  readonly place: Place
  readonly canEdit: boolean
  readonly drag: Drag
  readonly onAdd: (place: Place) => void
  readonly onDrop: (place: Place, drag: Drag) => void
  readonly end?: boolean
  readonly label?: "yes" | "no"
}) {
  const [over, setOver] = useState(false)
  const line = cx("w-px flex-1", over ? "bg-accent" : "bg-line-strong")
  return (
    <div
      className={cx("relative flex w-16 flex-col items-center", end ? "h-8" : "h-10")}
      onDragOver={(e) => {
        if (drag === null || !canEdit) return
        e.preventDefault()
        e.dataTransfer.dropEffect = drag.kind === "move" ? "move" : "copy"
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        onDrop(place, drag)
      }}
    >
      {label !== undefined && (
        <span
          className={cx(
            "absolute top-1/2 right-[calc(50%+16px)] -translate-y-1/2 rounded-full px-2 py-0.5 text-xs font-medium",
            label === "yes" ? "bg-good-tint text-good-ink" : "bg-canvas text-ink-2"
          )}
        >
          {label === "yes" ? "Ja" : "Nee"}
        </span>
      )}
      <span className={line} aria-hidden="true" />
      {canEdit
        ? (
          <button
            type="button"
            aria-label={label === undefined ? "Stap toevoegen" : `Stap toevoegen bij ${label === "yes" ? "Ja" : "Nee"}`}
            onClick={() => onAdd(place)}
            className={cx(
              "flex shrink-0 items-center justify-center rounded-full transition-[background-color,color,transform] duration-150 pointer-coarse:size-11",
              over
                ? "size-6 scale-110 bg-accent text-on-accent"
                : drag !== null
                ? "size-6 bg-accent-tint text-accent-ink"
                : "size-5 bg-canvas text-ink-3 ring-1 ring-line-strong hover:bg-ink hover:text-on-ink"
            )}
          >
            <Plus size={12} />
          </button>
        )
        : <span className="size-1.5 rounded-full bg-line-strong" aria-hidden="true" />}
      <span className={line} aria-hidden="true" />
    </div>
  )
}

/* ── the prompt bar: a sentence becomes steps ────────────────────────────────────────────────── */

function PromptBar({ onDraft }: { readonly onDraft: (text: string) => void }) {
  const [text, setText] = useState("")
  const [focused, setFocused] = useState(false)
  const send = (value: string) => {
    if (value.trim() === "") return
    onDraft(value)
    setText("")
    setFocused(false)
  }
  return (
    <div className="relative max-w-2xl">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          send(text)
        }}
        className="ai-ring flex h-11 items-center gap-2.5 rounded-lg pr-1.5 pl-3"
      >
        <MagnusMark size={18} />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 120)}
          placeholder={`Beschrijf de flow en ${ASSISTANT} zet de stappen neer`}
          aria-label="Beschrijf de flow"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
        />
        <Button type="submit" size="sm" variant="primary" disabled={text.trim() === ""}>Opstellen</Button>
      </form>
      {focused && text.trim() === "" && (
        <ul
          aria-label="Voorbeelden"
          className="absolute inset-x-0 top-12 z-20 flex flex-col rounded-md bg-canvas p-1 shadow-pop ring-1 ring-line"
        >
          <li className="px-2 pt-1 pb-1 text-2xs font-medium text-ink-3">Bijvoorbeeld</li>
          {PROMPTS.map((p) => (
            <li key={p}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => send(p)}
                className="flex w-full rounded-sm px-2 py-1.5 text-left text-sm text-ink-2 hover:bg-hover hover:text-ink"
              >
                {p}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ── the steps to drag in ────────────────────────────────────────────────────────────────────── */

function StepShelf({ onDrag, onPick }: {
  readonly onDrag: (drag: Drag) => void
  readonly onPick: (type: string) => void
}) {
  const [search, setSearch] = useState("")
  const q = search.trim().toLowerCase()
  const kinds: ReadonlyArray<StepKind> = ["voorwaarde", "wachten", "ai", "actie"]
  return (
    <PageSection title="Stappen" id="flow-stappenkast" className="hidden lg:flex">
      <p className="text-xs text-pretty text-ink-3">
        Sleep een stap op een plus in de flow, of klik om hem onderaan te zetten.
      </p>
      <SearchField value={search} onChange={setSearch} label="Zoek een stap" placeholder="Zoek een stap" />
      <div className="pane-scroll flex max-h-80 flex-col gap-3">
        {kinds.map((kind) => {
          const items = STEP_TYPES.filter((t) => t.kind === kind)
            .filter((t) => q === "" || `${t.label} ${t.detail}`.toLowerCase().includes(q))
          if (items.length === 0) return null
          const G = KIND_GLYPH[kind]
          return (
            <div key={kind} className="flex flex-col">
              <p className="pb-1 text-2xs font-medium text-ink-3">{STEP_KIND[kind]}</p>
              {items.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DRAG_TYPE, t.id)
                    e.dataTransfer.effectAllowed = "copy"
                    onDrag({ kind: "new", type: t.id })
                  }}
                  onDragEnd={() => onDrag(null)}
                  onClick={() => onPick(t.id)}
                  title={t.detail}
                  className="flex h-8 cursor-grab items-center gap-2 rounded-sm px-1.5 text-left text-sm text-ink-2 hover:bg-hover hover:text-ink"
                >
                  {t.via === undefined
                    ? <G size={14} className="shrink-0 text-ink-3" />
                    : <ServiceLogo service={t.via} name={t.via} size={16} bare />}
                  <span className="min-w-0 flex-1 truncate">{t.label}</span>
                </button>
              ))}
            </div>
          )
        })}
      </div>
    </PageSection>
  )
}

/* ── one step, opened ────────────────────────────────────────────────────────────────────────── */

/** A step opened from the flow: what it does, its fields with the record's fields as chips, its right; move or remove it. */
function StepSheet({ flow, step, issues, onClose }: {
  readonly flow: Automation
  readonly step: Step | undefined
  readonly issues: ReadonlyArray<string>
  readonly onClose: () => void
}) {
  const access = useAccess("automations")
  const [summary, setSummary] = useState(step?.summary ?? "")
  const [values, setValues] = useState<Record<string, string>>({ ...step?.values })
  const [stepId, setStepId] = useState(step?.id)
  const [focus, setFocus] = useState<string | null>(null)
  const inputs = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({})
  if (step?.id !== stepId) {
    setStepId(step?.id)
    setSummary(step?.summary ?? "")
    setValues({ ...step?.values })
  }
  if (step === undefined) return null
  const t = stepType(step.type)
  const kind = t?.kind ?? "actie"
  const place = placeOf(flow.steps, step.id)
  const list = listAt(flow.steps, place?.lane)
  const at = place?.index ?? 0
  const scope = SCOPES.find((x) => x.id === t?.scope)
  const scopeOff = t?.scope !== undefined && flow.scopesOff?.includes(t.scope) === true
  const textFields = t?.fields.filter((x) => !["queue", "tone"].includes(x.key)) ?? []

  const move = (by: number) => {
    if (place === null) return
    const next = moveStep(flow.steps, step.id, { ...place, index: at + (by > 0 ? by + 1 : by) })
    if (next !== null) setSteps(flow.id, next)
  }
  const save = () => {
    setSteps(
      flow.id,
      updateStep(flow.steps, step.id, (st) => ({ ...st, summary: summary.trim() || st.summary, values }))
    )
    toast({ title: "Stap opgeslagen", body: "Publiceer om de wijziging live te zetten." })
    onClose()
  }
  const drop = () => {
    const before = flow.steps
    setSteps(flow.id, removeStep(flow.steps, step.id))
    onClose()
    toast({ title: "Stap verwijderd", action: { label: "Ongedaan maken", onClick: () => setSteps(flow.id, before) } })
  }
  const insertField = (key: string) => {
    const target = focus ?? textFields[0]?.key
    if (target === undefined) return
    const el = inputs.current[target]
    const current = values[target] ?? ""
    const token = `{{${key}}}`
    const from = el?.selectionStart ?? current.length
    const to = el?.selectionEnd ?? current.length
    const next = current.slice(0, from) + token + current.slice(to)
    setValues({ ...values, [target]: next })
    window.requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(from + token.length, from + token.length)
    })
  }
  const laneWord = place?.lane === undefined ? "" : place.lane.side === "yes" ? " · bij Ja" : " · bij Nee"

  return (
    <Sheet
      open
      onClose={onClose}
      title={t?.label ?? "Stap"}
      meta={`${STEP_KIND[kind]} · stap ${at + 1} van ${list.length}${laneWord}`}
      footer={access.edit && (
        <>
          {kind !== "trigger" && (
            <Button variant="ghost" icon={<Trash />} onClick={drop} className="mr-auto">Verwijderen</Button>
          )}
          <Button onClick={onClose}>Annuleren</Button>
          <Button variant="primary" onClick={save}>Opslaan</Button>
        </>
      )}
    >
      <div className="flex flex-col gap-5">
        <p className="text-sm text-ink-2">{t?.detail}</p>
        {issues.length > 0 && (
          <Notice tone="warn" title="Deze stap kan zo niet draaien">
            <ul className="flex flex-col gap-0.5">
              {issues.map((x) => <li key={x}>{x}</li>)}
            </ul>
          </Notice>
        )}
        <Field label={kind === "trigger" ? "Wanneer" : "Wat deze stap doet"}>
          {(control) => (
            <Input
              {...control}
              value={summary}
              readOnly={!access.edit}
              onChange={(event) => setSummary(event.target.value)}
            />
          )}
        </Field>
        {t?.fields.map((field) => {
          const value = values[field.key] ?? ""
          const empty = field.required === true && value.trim() === ""
          const long = field.key === "body" || field.key === "instructions" || field.key === "message"
          return (
            <Field
              key={field.key}
              label={field.label}
              optional={field.required !== true}
              error={empty ? "Nodig om te draaien" : undefined}
            >
              {(control) => (
                <div className="flex flex-col gap-1.5">
                  {long
                    ? (
                      <textarea
                        {...control}
                        ref={(el) => {
                          inputs.current[field.key] = el
                        }}
                        rows={4}
                        className="w-full min-w-0 resize-y rounded-sm bg-canvas px-2.5 py-1.5 text-sm leading-5 text-ink ring-1 ring-line-strong ring-inset outline-none placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-accent read-only:bg-well read-only:ring-line"
                        value={value}
                        placeholder={field.placeholder}
                        readOnly={!access.edit}
                        onFocus={() => setFocus(field.key)}
                        onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
                      />
                    )
                    : (
                      <input
                        {...control}
                        ref={(el) => {
                          inputs.current[field.key] = el
                        }}
                        value={value}
                        placeholder={field.placeholder}
                        readOnly={!access.edit}
                        aria-invalid={empty || undefined}
                        onFocus={() => setFocus(field.key)}
                        onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
                        className="h-8 w-full min-w-0 rounded-sm bg-canvas px-2.5 text-sm text-ink ring-1 ring-line-strong ring-inset outline-none placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-accent aria-invalid:ring-bad-ink read-only:bg-well read-only:ring-line pointer-coarse:h-11"
                      />
                    )}
                  {value.includes("{{") && <FieldText text={value} className="text-xs leading-relaxed text-ink-3" />}
                </div>
              )}
            </Field>
          )
        })}
        {access.edit && textFields.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-ink-3">
              Velden van het record. Klik om er een in {focus === null ? "het eerste veld" : "het gekozen veld"}{" "}
              te zetten.
            </p>
            <div className="flex flex-wrap gap-1">
              {FIELDS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertField(key)}
                  className="inline-flex h-6 items-center rounded-xs bg-accent-tint px-1.5 text-xs font-medium text-accent-ink hover:bg-accent-tint/70 pointer-coarse:h-11"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
        <KeyValue
          items={[
            {
              label: "Nodig recht",
              value: scope === undefined ? "Geen" : (
                <span className={scopeOff ? "text-bad-ink" : undefined}>
                  {scope.label}
                  {scopeOff && " · staat uit"}
                </span>
              )
            },
            {
              label: "Loopt via",
              value: t?.via === undefined ? "Insyte" : (
                <span className="flex items-center gap-1.5">
                  <ServiceLogo service={t.via} name={t.via} size={16} bare />
                  {t.via}
                </span>
              )
            }
          ]}
        />
        {scopeOff && (
          <Button
            size="sm"
            className="self-start"
            onClick={() => {
              onClose()
              setQuery({ tab: "instellingen", stap: null })
            }}
          >
            Naar Rechten
          </Button>
        )}
        {kind === "ai" && (
          <p className="rounded-md bg-well px-3 py-2.5 text-xs text-pretty text-ink-2">
            Wat {ASSISTANT}{" "}
            hier opstelt, gaat de deur niet uit zonder de stap erna. Een mail aan een klant valt onder je regel voor
            e-mail: standaard Eerst vragen.
          </p>
        )}
        {access.edit && kind !== "trigger" && list.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              icon={<ArrowUp />}
              disabled={at <= (place?.lane === undefined && isTrigger(flow.steps[0]) ? 1 : 0)}
              onClick={() => move(-1)}
            >
              Omhoog
            </Button>
            <Button size="sm" icon={<ArrowDown />} disabled={at >= list.length - 1} onClick={() => move(1)}>
              Omlaag
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  )
}

/** The steps the editor offers for one place, by kind, with a search; an empty head is offered triggers. */
function Palette({ place, trigger, onClose, onPick }: {
  readonly place: Place | null
  readonly trigger: boolean
  readonly onClose: () => void
  readonly onPick: (type: string) => void
}) {
  const [search, setSearch] = useState("")
  const q = search.trim().toLowerCase()
  const inLane = place?.lane !== undefined
  const kinds: ReadonlyArray<StepKind> = trigger ? ["trigger"] : ["voorwaarde", "wachten", "ai", "actie"]
  return (
    <Dialog
      open={place !== null}
      onClose={onClose}
      title={trigger
        ? "Trigger kiezen"
        : inLane
        ? `Stap toevoegen bij ${place?.lane?.side === "yes" ? "Ja" : "Nee"}`
        : "Stap toevoegen"}
      description={trigger
        ? "Waar de flow op let."
        : `Een voorwaarde, een wachttijd, iets dat ${ASSISTANT} schrijft, of een actie.`}
    >
      <div className="flex flex-col gap-4">
        <SearchField value={search} onChange={setSearch} label="Zoek een stap" placeholder="Zoek een stap" />
        <div className="flex max-h-[min(26rem,60vh)] flex-col gap-5 overflow-y-auto">
          {kinds.map((kind) => {
            const items = STEP_TYPES.filter((t) => t.kind === kind)
              .filter((t) => !(inLane && t.id === "branch"))
              .filter((t) => q === "" || `${t.label} ${t.detail}`.toLowerCase().includes(q))
            if (items.length === 0) return null
            const G = KIND_GLYPH[kind]
            return (
              <section key={kind} aria-label={STEP_KIND[kind]} className="flex flex-col gap-1">
                <h3 className="text-xs font-medium text-ink-3">{STEP_KIND[kind]}</h3>
                <List label={STEP_KIND[kind]}>
                  {items.map((t) => (
                    <ListRow
                      key={t.id}
                      lead={t.via === undefined
                        ? (
                          <span className="inline-flex size-7 items-center justify-center rounded-full bg-well text-ink-2">
                            <G size={13} />
                          </span>
                        )
                        : <ServiceLogo service={t.via} name={t.via} size={28} />}
                      title={t.label}
                      meta={t.via === undefined ? t.detail : `${t.detail} · via ${t.via}`}
                      onClick={() => onPick(t.id)}
                    />
                  ))}
                </List>
              </section>
            )
          })}
        </div>
      </div>
    </Dialog>
  )
}
