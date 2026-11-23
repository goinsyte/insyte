import { useEffect, useRef, useState } from "react"
import { ASSISTANT } from "../../assistant.ts"
import { SCOPES, scopesOf, STEP_KIND, STEP_TYPES, stepType, usesAi, viaOf } from "../../fixtures/automations.ts"
import type { Automation, Run, Scope, Step, StepKind } from "../../fixtures/automations.ts"
import { customer, CUSTOMERS, ORDERS } from "../../fixtures/records.ts"
import { PEOPLE } from "../../fixtures/workspace.ts"
import { Link, navigate, paths, setQuery, useQuery } from "../../router.tsx"
import { Denied, ReadOnlyNotice, useAccess } from "../../ui/access.tsx"
import { Avatar } from "../../ui/avatar.tsx"
import { Button, IconButton } from "../../ui/button.tsx"
import { AlertDialog, Dialog, Sheet } from "../../ui/dialog.tsx"
import { DropdownItem, DropdownMenu } from "../../ui/dropdown.tsx"
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Copy,
  Edit,
  FlaskConical,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Trash,
  Workflow
} from "../../ui/icons.tsx"
import { Field, Input, SearchField, Select, Textarea } from "../../ui/input.tsx"
import { KeyValue } from "../../ui/key-value.tsx"
import { List, ListRow } from "../../ui/list.tsx"
import { Notice } from "../../ui/notice.tsx"
import { Page, PageHead, PageSection } from "../../ui/page.tsx"
import { SettingRow, SettingsSection } from "../../ui/settings.tsx"
import { Skeleton, SkeletonText } from "../../ui/skeleton.tsx"
import { EmptyState, ErrorState } from "../../ui/states.tsx"
import { Tabs } from "../../ui/tabs.tsx"
import { toast } from "../../ui/toast.tsx"
import { Segmented, Toggle } from "../../ui/toggle.tsx"
import { dataState, setView, useView } from "../../view.ts"
import { FlowStatusLabel, KIND_GLYPH, RunSheet, RunsTable, RunStatusLabel, sentence } from "./parts.tsx"
import { createDraft, patch, publish, remove, restore, setStatus, setSteps, useFlows, useRuns } from "./store.ts"

type Tab = "workflow" | "uitvoeringen" | "overzicht" | "instellingen"
const TABS: ReadonlyArray<{ readonly value: Tab; readonly label: string }> = [
  { value: "workflow", label: "Workflow" },
  { value: "uitvoeringen", label: "Uitvoeringen" },
  { value: "overzicht", label: "Overzicht" },
  { value: "instellingen", label: "Instellingen" }
]

/** What a test with an example says each step would do, so nothing is saved or sent. */
type TestResult = { readonly record: string; readonly lines: Readonly<Record<string, string>> }

/**
 * One automation: its flow as a calm sequence from the trigger down (`/app/automations/$id`, whose
 * canvas of boxes this replaces), its runs, the facts and versions, and its settings. A test walks the
 * flow with a real order and changes nothing; publishing needs "Automatiseringen · Beheren", the
 * original's "Automatiseringen publiceren".
 */
export function AutomationScreen({ id }: { readonly id: string }) {
  const access = useAccess("automations")
  const state = dataState(useView())
  const flows = useFlows()
  const flow = flows.find((a) => a.id === id)
  const tab = (useQuery("tab") ?? "workflow") as Tab

  if (!access.view) {
    return (
      <Page width="text">
        <PageHead title="Automatisering" />
        <Denied area="automations" what="deze automatisering" />
      </Page>
    )
  }
  if (state === "loading") return <EditorSkeleton />
  if (state === "error") {
    return (
      <Page width="record">
        <ErrorState
          title="Deze automatisering kwam niet binnen"
          detail={`GET /v1/automations/${id} · 503 · verzoek 9c1e04`}
          action={<Button onClick={() => setView({ staat: "gewoon" })}>Opnieuw proberen</Button>}
        >
          De flow zelf draait door; alleen dit scherm kon hem niet laden.
        </ErrorState>
      </Page>
    )
  }
  if (flow === undefined) {
    return (
      <Page width="text">
        <EmptyState
          glyph={Workflow}
          title="Deze automatisering bestaat niet (meer)"
          action={<Button onClick={() => navigate(paths.automations)}>Naar automatiseringen</Button>}
        >
          Misschien is hij verwijderd. De uitvoeringen blijven in de geschiedenis.
        </EmptyState>
      </Page>
    )
  }
  return <Editor key={flow.id} flow={flow} tab={tab} />
}

function EditorSkeleton() {
  return (
    <Page width="wide" label="Automatisering laden">
      <div aria-busy="true" className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-96 max-w-full" />
          <Skeleton className="h-3 w-64" />
        </div>
        <Skeleton className="h-9 w-80" />
        <div className="flex max-w-2xl flex-col gap-6">
          {Array.from({ length: 4 }, (_, i) => (
            <span key={i} className="flex gap-3">
              <Skeleton className="size-7 rounded-full" />
              <SkeletonText lines={2} className="flex-1" />
            </span>
          ))}
        </div>
      </div>
    </Page>
  )
}

function Editor({ flow, tab }: { readonly flow: Automation; readonly tab: Tab }) {
  const access = useAccess("automations")
  const runs = useRuns().filter((r) => r.automationId === flow.id)
  const [renaming, setRenaming] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [test, setTest] = useState<"idle" | "running" | TestResult>("idle")
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const hasTrigger = stepType(flow.steps[0]?.type ?? "")?.kind === "trigger"
  const changes = flow.unpublished === true

  const runTest = () => {
    if (!hasTrigger) {
      toast({
        title: "Zet eerst een trigger in de flow",
        body: "Een test loopt de flow door met een voorbeeld, vanaf de trigger."
      })
      return
    }
    setTest("running")
    if (tab !== "workflow") setQuery({ tab: null })
    timer.current = window.setTimeout(() => {
      const result = testOf(flow)
      setTest(result)
      toast({
        title: "Test geslaagd, niets opgeslagen of verstuurd",
        body: `Met ${result.record} als voorbeeld.`,
        tone: "good"
      })
    }, 1200)
  }

  const togglePause = () => {
    const next = flow.status === "actief" ? "gepauzeerd" : "actief"
    setStatus(flow.id, next)
    toast({
      title: next === "actief" ? "Flow staat weer aan" : "Flow gepauzeerd",
      body: next === "actief" ? undefined : "De trigger wordt genegeerd; niets wordt ingehaald.",
      action: { label: "Ongedaan maken", onClick: () => setStatus(flow.id, flow.status) }
    })
  }

  return (
    <Page width="wide">
      <div className="flex flex-col gap-4">
        <Link
          to={paths.automations}
          className="flex h-7 items-center gap-1 self-start rounded-sm pr-2 text-sm text-ink-3 hover:text-ink pointer-coarse:h-11"
        >
          <ArrowLeft size={14} />
          Automatiseringen
        </Link>
        <PageHead
          title={flow.name}
          after={<FlowStatusLabel status={flow.status} />}
          meta={
            <>
              {flow.version === 0 ? "Nog niet gepubliceerd" : `v${flow.version} live`}
              {changes && flow.version > 0 && " · wijzigingen die nog niet live staan"} · laatst gewijzigd door{" "}
              {PEOPLE[flow.editedBy].name}, {flow.editedAt}
            </>
          }
          actions={
            <>
              <Button
                icon={test === "running" ? undefined : <FlaskConical />}
                loading={test === "running"}
                onClick={runTest}
              >
                {test === "running" ? "Bezig met testen" : "Test met voorbeeld"}
              </Button>
              {access.manage && (
                <Button
                  variant="primary"
                  disabled={!hasTrigger || (!changes && flow.version > 0)}
                  title={!hasTrigger
                    ? "Zet eerst een trigger in de flow"
                    : !changes && flow.version > 0
                    ? "Er is niets nieuws om te publiceren"
                    : undefined}
                  onClick={() => setPublishing(true)}
                >
                  Publiceren
                </Button>
              )}
              {access.edit && (
                <DropdownMenu
                  label="Meer acties"
                  placement="bottom-end"
                  trigger={(props) => (
                    <IconButton label="Meer acties" tone="outline" {...props}>
                      <MoreHorizontal />
                    </IconButton>
                  )}
                >
                  <DropdownItem glyph={Edit} onSelect={() => setRenaming(true)}>Naam wijzigen</DropdownItem>
                  <DropdownItem
                    glyph={Copy}
                    onSelect={() => {
                      const copy = createDraft(undefined, `${flow.name} (kopie)`)
                      patch(copy, { steps: flow.steps, description: flow.description })
                      toast({
                        title: "Kopie gemaakt als concept",
                        action: { label: "Openen", onClick: () => navigate(paths.automation(copy)) }
                      })
                    }}
                  >
                    Kopie maken
                  </DropdownItem>
                  {flow.version > 0 && (
                    <DropdownItem glyph={flow.status === "actief" ? Pause : Play} onSelect={togglePause}>
                      {flow.status === "actief" ? "Pauzeren" : "Weer aanzetten"}
                    </DropdownItem>
                  )}
                </DropdownMenu>
              )}
            </>
          }
        />
        {!access.edit && <ReadOnlyNotice area="automations" />}
        {access.edit && !access.manage && <Denied area="automations" need={3} size="inline" />}
        {flow.pausedWhy !== undefined && flow.status === "gepauzeerd" && (
          <Notice
            tone="warn"
            title="Deze flow staat uit"
            action={access.edit && <Button size="sm" onClick={togglePause}>Weer aanzetten</Button>}
          >
            {flow.pausedWhy}
          </Notice>
        )}
      </div>

      <div className="flex flex-col gap-6">
        <Tabs
          label="Onderdelen van de automatisering"
          value={tab}
          onChange={(next) => setQuery({ tab: next === "workflow" ? null : next, run: null })}
          tabs={TABS.map((t) =>
            t.value === "uitvoeringen" ? { ...t, count: runs.length, controls: `paneel-${t.value}` } : {
              ...t,
              controls: `paneel-${t.value}`
            }
          )}
        />
        <div role="tabpanel" id={`paneel-${tab}`} aria-labelledby={`paneel-${tab}-tab`}>
          {tab === "workflow"
            ? (
              <WorkflowTab
                flow={flow}
                runs={runs}
                test={typeof test === "object" ? test : null}
                onTest={() => setTest("idle")}
              />
            )
            : tab === "uitvoeringen"
            ? <RunsTab flow={flow} runs={runs} />
            : tab === "overzicht"
            ? <OverviewTab flow={flow} />
            : <SettingsTab flow={flow} />}
        </div>
      </div>

      <RenameDialog flow={flow} open={renaming} onClose={() => setRenaming(false)} />
      <PublishDialog flow={flow} open={publishing} onClose={() => setPublishing(false)} />
    </Page>
  )
}

/* ── the flow ──────────────────────────────────────────────────────────────────────────────────── */

function exampleOrder(flow: Automation) {
  const href = flow.touches.find((t) => t.kind === "order")?.href
  const number = href?.split("/").at(-1)
  return ORDERS.find((o) => o.number === number) ?? ORDERS[0]
}

function testOf(flow: Automation): TestResult {
  const o = exampleOrder(flow)
  const c = o === undefined ? CUSTOMERS[0] : customer(o.customerId)
  const record = o === undefined ? "een voorbeeld" : `bestelling #${o.number}`
  const lines: Record<string, string> = {}
  for (const st of flow.steps) {
    const kind = stepType(st.type)?.kind
    lines[st.id] = kind === "trigger"
      ? `Zou afgaan op ${record}${c === undefined ? "" : ` van ${c.name}`}.`
      : kind === "voorwaarde"
      ? "Klopt voor dit voorbeeld, dus de flow gaat verder."
      : kind === "wachten"
      ? "Zou hier wachten; de test slaat de wachttijd over."
      : kind === "ai"
      ? `${ASSISTANT} zou hier een tekst opstellen; die staat dan als concept klaar.`
      : st.type === "send_email" || st.type === "klaviyo_send"
      ? `Zou mailen naar ${c?.email ?? "de klant"}.`
      : st.type === "create_ticket"
      ? `Zou een ticket aanmaken: ‘${
        (st.values?.title ?? st.summary).replace("{{bestelling.nummer}}", `#${o?.number ?? ""}`)
      }’.`
      : st.type === "stripe_refund"
      ? "Zou terugbetalen via Stripe; in een test gaat er geen geld."
      : "Zou dit doen; in een test gebeurt het niet echt."
  }
  return { record, lines }
}

function WorkflowTab({ flow, runs, test, onTest }: {
  readonly flow: Automation
  readonly runs: ReadonlyArray<Run>
  readonly test: TestResult | null
  readonly onTest: () => void
}) {
  const access = useAccess("automations")
  const [palette, setPalette] = useState(false)
  const openStep = useQuery("stap")
  const step = flow.steps.find((st) => st.id === openStep)
  const hasTrigger = stepType(flow.steps[0]?.type ?? "")?.kind === "trigger"

  const add = (type: string) => {
    const t = stepType(type)
    if (t === undefined) return
    const next: Step = { id: `s${crypto.randomUUID().slice(0, 8)}`, type, summary: t.label }
    setSteps(flow.id, t.kind === "trigger" ? [next, ...flow.steps] : [...flow.steps, next])
    setPalette(false)
    onTest()
    setQuery({ stap: next.id })
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-12">
      <section aria-labelledby="flow-stappen" className="flex max-w-2xl flex-col gap-4">
        <h2 id="flow-stappen" className="sr-only">Stappen</h2>
        {flow.unpublished === true && flow.version > 0 && (
          <Notice tone="info" title="Er zijn wijzigingen die nog niet live staan">
            Lopende runs gebruiken v{flow.version}. Publiceer om de nieuwe stappen live te zetten.
          </Notice>
        )}
        {test !== null && (
          <Notice tone="good" title={`Test met ${test.record}`} onDismiss={onTest}>
            Elke stap zegt hieronder wat hij gedaan zou hebben. Er is niets opgeslagen of verstuurd.
          </Notice>
        )}
        <p className="max-w-[60ch] text-sm text-pretty text-ink-2">{sentence(flow)}</p>
        <ol aria-label="Stappen van de flow" className="flex flex-col">
          {!hasTrigger && (
            <li className="relative grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 pb-5">
              {flow.steps.length > 0 && (
                <span aria-hidden="true" className="absolute top-7 bottom-0 left-[13.5px] w-px bg-line" />
              )}
              <span className="flex size-7 items-center justify-center rounded-full bg-warn-tint text-warn-ink">
                <KIND_GLYPH.trigger size={14} />
              </span>
              <div className="flex flex-col items-start gap-2 pt-0.5">
                <p className="text-sm text-ink">Nog geen trigger</p>
                <p className="text-xs text-ink-3">Waar moet de flow op letten? Zonder trigger kan hij niet draaien.</p>
                {access.edit && (
                  <Button size="sm" icon={<Plus />} onClick={() => setPalette(true)}>Trigger kiezen</Button>
                )}
              </div>
            </li>
          )}
          {flow.steps.map((st, i) => {
            const t = stepType(st.type)
            const kind: StepKind = t?.kind ?? "actie"
            const G = KIND_GLYPH[kind]
            const last = i === flow.steps.length - 1
            const result = test?.lines[st.id]
            return (
              <li key={st.id} className="relative grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 pb-5">
                {(!last || access.edit) && (
                  <span aria-hidden="true" className="absolute top-7 bottom-0 left-[13.5px] w-px bg-line" />
                )}
                <span
                  className={kind === "trigger"
                    ? "relative flex size-7 items-center justify-center rounded-full bg-ink text-on-ink"
                    : kind === "ai"
                    ? "relative flex size-7 items-center justify-center rounded-full bg-accent-tint text-accent-ink"
                    : "relative flex size-7 items-center justify-center rounded-full bg-well text-ink-2"}
                >
                  <G size={14} />
                </span>
                <button
                  type="button"
                  onClick={() => setQuery({ stap: st.id })}
                  className="-mx-2 -my-1 flex min-w-0 flex-col items-start gap-0.5 rounded-md px-2 py-1 text-left transition-colors hover:bg-hover"
                >
                  <span className="text-xs text-ink-3">
                    {STEP_KIND[kind]} · {t?.label ?? "Onbekende stap"}
                    {t?.via !== undefined && ` · via ${t.via}`}
                  </span>
                  <span className="text-sm text-ink">{st.summary}</span>
                  {st.values !== undefined && Object.keys(st.values).length > 0 && (
                    <span className="max-w-full truncate text-xs text-ink-3">
                      {Object.entries(st.values).map(([k, val]) =>
                        `${t?.fields.find((x) => x.key === k)?.label ?? k}: ${val}`
                      ).join(" · ")}
                    </span>
                  )}
                  {result !== undefined && (
                    <span className="mt-1 flex items-start gap-1.5 text-xs text-good-ink">
                      <Check size={13} className="mt-px shrink-0" />
                      {result}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
          {access.edit && hasTrigger && (
            <li className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3">
              <span className="flex size-7 items-center justify-center rounded-full text-ink-3 ring-1 ring-line-strong ring-dashed ring-inset">
                <Plus size={13} />
              </span>
              <span>
                <Button size="sm" variant="ghost" onClick={() => setPalette(true)} className="pointer-coarse:h-11">
                  Stap toevoegen
                </Button>
              </span>
            </li>
          )}
        </ol>
      </section>

      <aside aria-label="Bij deze flow" className="flex flex-col gap-8">
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

      <StepSheet flow={flow} step={step} onClose={() => setQuery({ stap: null })} />
      <Palette open={palette} trigger={!hasTrigger} onClose={() => setPalette(false)} onPick={add} />
    </div>
  )
}

/** A step opened from the flow: what it does, its fields, the right it needs; move or remove it. */
function StepSheet({ flow, step, onClose }: {
  readonly flow: Automation
  readonly step: Step | undefined
  readonly onClose: () => void
}) {
  const access = useAccess("automations")
  const [summary, setSummary] = useState(step?.summary ?? "")
  const [values, setValues] = useState<Record<string, string>>({ ...step?.values })
  const [stepId, setStepId] = useState(step?.id)
  if (step?.id !== stepId) {
    setStepId(step?.id)
    setSummary(step?.summary ?? "")
    setValues({ ...step?.values })
  }
  if (step === undefined) return null
  const t = stepType(step.type)
  const at = flow.steps.findIndex((st) => st.id === step.id)
  const scope = SCOPES.find((x) => x.id === t?.scope)
  const move = (by: number) => {
    const next = [...flow.steps]
    const [moved] = next.splice(at, 1)
    if (moved === undefined) return
    next.splice(at + by, 0, moved)
    setSteps(flow.id, next)
  }
  const save = () => {
    setSteps(
      flow.id,
      flow.steps.map((st) => (st.id === step.id ? { ...st, summary: summary.trim() || st.summary, values } : st))
    )
    toast({ title: "Stap opgeslagen", body: "Publiceer om de wijziging live te zetten." })
    onClose()
  }
  const drop = () => {
    const before = flow.steps
    setSteps(flow.id, flow.steps.filter((st) => st.id !== step.id))
    onClose()
    toast({ title: "Stap verwijderd", action: { label: "Ongedaan maken", onClick: () => setSteps(flow.id, before) } })
  }
  const kind = t?.kind ?? "actie"
  return (
    <Sheet
      open
      onClose={onClose}
      title={t?.label ?? "Stap"}
      meta={`${STEP_KIND[kind]} · stap ${at + 1} van ${flow.steps.length}`}
      footer={access.edit && (
        <>
          <Button variant="ghost" icon={<Trash />} onClick={drop} className="mr-auto">Verwijderen</Button>
          <Button onClick={onClose}>Annuleren</Button>
          <Button variant="primary" onClick={save}>Opslaan</Button>
        </>
      )}
    >
      <div className="flex flex-col gap-5">
        <p className="text-sm text-ink-2">{t?.detail}</p>
        <Field label="Wat deze stap doet">
          {(control) => (
            <Input
              {...control}
              value={summary}
              readOnly={!access.edit}
              onChange={(event) => setSummary(event.target.value)}
            />
          )}
        </Field>
        {t?.fields.map((field) => (
          <Field key={field.key} label={field.label}>
            {(control) =>
              field.key === "body" || field.key === "instructions" || field.key === "message"
                ? (
                  <Textarea
                    {...control}
                    rows={4}
                    value={values[field.key] ?? ""}
                    placeholder={field.placeholder}
                    readOnly={!access.edit}
                    onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
                  />
                )
                : (
                  <Input
                    {...control}
                    value={values[field.key] ?? ""}
                    placeholder={field.placeholder}
                    readOnly={!access.edit}
                    onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
                  />
                )}
          </Field>
        ))}
        <KeyValue
          items={[
            { label: "Nodig recht", value: scope?.label ?? "Geen" },
            { label: "Loopt via", value: t?.via ?? "Insyte" }
          ]}
        />
        {kind === "ai" && (
          <p className="rounded-md bg-well px-3 py-2.5 text-xs text-pretty text-ink-2">
            Wat {ASSISTANT}{" "}
            hier opstelt, gaat de deur niet uit zonder de stap erna. Een mail aan een klant valt onder je regel voor
            e-mail: standaard Eerst vragen.
          </p>
        )}
        {access.edit && flow.steps.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              icon={<ArrowUp />}
              disabled={at <= (stepType(flow.steps[0]?.type ?? "")?.kind === "trigger" ? 1 : 0)}
              onClick={() => move(-1)}
            >
              Omhoog
            </Button>
            <Button
              size="sm"
              icon={<ArrowDown />}
              disabled={at === flow.steps.length - 1 || kind === "trigger"}
              onClick={() => move(1)}
            >
              Omlaag
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  )
}

/** The steps the editor offers, by kind, with a search; a flow without a trigger is offered triggers. */
function Palette({ open, trigger, onClose, onPick }: {
  readonly open: boolean
  readonly trigger: boolean
  readonly onClose: () => void
  readonly onPick: (type: string) => void
}) {
  const [search, setSearch] = useState("")
  const q = search.trim().toLowerCase()
  const kinds: ReadonlyArray<StepKind> = trigger ? ["trigger"] : ["voorwaarde", "wachten", "ai", "actie"]
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={trigger ? "Trigger kiezen" : "Stap toevoegen"}
      description={trigger
        ? "Waar de flow op let."
        : `Een voorwaarde, een wachttijd, iets dat ${ASSISTANT} schrijft, of een actie.`}
    >
      <div className="flex flex-col gap-4">
        <SearchField value={search} onChange={setSearch} label="Zoek een stap" placeholder="Zoek een stap" />
        <div className="flex max-h-[min(26rem,60vh)] flex-col gap-5 overflow-y-auto">
          {kinds.map((kind) => {
            const items = STEP_TYPES.filter((t) => t.kind === kind)
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
                      lead={
                        <span className="inline-flex size-7 items-center justify-center rounded-full bg-well text-ink-2">
                          <G size={13} />
                        </span>
                      }
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

/* ── runs ──────────────────────────────────────────────────────────────────────────────────────── */

function RunsTab({ flow, runs }: { readonly flow: Automation; readonly runs: ReadonlyArray<Run> }) {
  const access = useAccess("automations")
  const [cut, setCut] = useState<"alle" | "mislukt" | "wacht" | "dubbel">("alle")
  const [search, setSearch] = useState("")
  const openId = useQuery("run")
  const q = search.trim().toLowerCase()
  const shown = runs
    .filter((r) => cut === "alle" || r.status === cut)
    .filter((r) => q === "" || `${r.record?.label ?? ""} ${r.record?.who ?? ""}`.toLowerCase().includes(q))
  const open = runs.find((r) => r.id === openId) ?? null
  if (runs.length === 0) {
    return (
      <EmptyState glyph={Workflow} title="Nog geen uitvoeringen" size="sm">
        {flow.version === 0 ? "Deze flow is nog niet gepubliceerd." : "De trigger is nog niet afgegaan."}
      </EmptyState>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchField
          value={search}
          onChange={setSearch}
          label="Zoek in uitvoeringen"
          placeholder="Zoek op bestelnummer of naam"
          className="w-full sm:w-72"
        />
        <Segmented
          label="Uitvoeringen tonen"
          size="sm"
          value={cut}
          onChange={setCut}
          options={[
            { value: "alle", label: "Alle" },
            { value: "mislukt", label: "Mislukt" },
            { value: "wacht", label: "Wacht" },
            { value: "dubbel", label: "Dubbel" }
          ]}
        />
      </div>
      {shown.length === 0
        ? (
          <EmptyState
            size="sm"
            title="Geen uitvoeringen in deze selectie"
            action={<Button onClick={() => setCut("alle")}>Alle tonen</Button>}
          />
        )
        : (
          <RunsTable
            runs={shown}
            flows={[flow]}
            label={`Uitvoeringen van ${flow.name}`}
            onOpen={(r) => setQuery({ run: r.id })}
          />
        )}
      <RunSheet run={open} flow={flow} onClose={() => setQuery({ run: null })} canEdit={access.edit} />
    </div>
  )
}

/* ── overview ──────────────────────────────────────────────────────────────────────────────────── */

function OverviewTab({ flow }: { readonly flow: Automation }) {
  const access = useAccess("automations")
  const runs = useRuns().filter((r) => r.automationId === flow.id)
  const failed = runs.filter((r) => r.status === "mislukt").length
  const owner = PEOPLE[flow.owner]
  return (
    <div className="flex max-w-3xl flex-col gap-10">
      <div className="flex flex-col gap-4">
        <p className="max-w-[62ch] text-md text-pretty text-ink">{flow.description || sentence(flow)}</p>
        <KeyValue
          layout="grid"
          items={[
            {
              label: "Eigenaar",
              value: (
                <Link to={paths.person(owner.id)} className="inline-flex items-center gap-1.5 hover:underline">
                  <Avatar name={owner.name} size={18} />
                  {owner.name}
                </Link>
              )
            },
            { label: "Trigger", value: stepType(flow.steps[0]?.type ?? "")?.label ?? "Nog geen" },
            { label: "Status", value: <FlowStatusLabel status={flow.status} /> },
            {
              label: "Live versie",
              value: flow.version === 0 ? "Nog niet gepubliceerd" : `v${flow.version}`,
              figure: true
            },
            { label: "Uitvoeringen, 30 dagen", value: flow.runs30.toLocaleString("nl-NL"), figure: true },
            { label: "Uitvoeringen in totaal", value: flow.runs.toLocaleString("nl-NL"), figure: true },
            { label: "Mislukt, recent", value: failed === 0 ? "Niets mislukt" : `${failed} mislukt`, figure: true },
            { label: "Koppelingen", value: ["Insyte", ...viaOf(flow)].join(", ") },
            { label: "Met AI-stap", value: usesAi(flow) ? "Ja" : "Nee" }
          ]}
        />
      </div>
      <PageSection
        title="Versies"
        id="overzicht-versies"
        meta={flow.versions.length > 0 ? flow.versions.length : undefined}
      >
        {flow.versions.length === 0
          ? (
            <p className="text-sm text-ink-3">
              Nog niet gepubliceerd. Publiceren legt een versie vast, met wie het deed en waarom.
            </p>
          )
          : (
            <List label="Versies">
              {flow.versions.map((ver) => (
                <ListRow
                  key={ver.v}
                  padded={false}
                  lead={<span className="figure w-8 text-sm text-ink-3">v{ver.v}</span>}
                  title={ver.note}
                  meta={`${ver.by} · ${ver.at}${ver.v === flow.version ? " · live" : ""}`}
                  trail={access.edit && ver.v !== flow.version && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        patch(flow.id, { unpublished: true })
                        toast({
                          title: `v${ver.v} staat in de editor`,
                          body: "Publiceer om hem weer live te zetten.",
                          action: {
                            label: "Ongedaan maken",
                            onClick: () => patch(flow.id, { unpublished: flow.unpublished })
                          }
                        })
                      }}
                    >
                      Terugzetten
                    </Button>
                  )}
                />
              ))}
            </List>
          )}
      </PageSection>
      <PageSection title="Gekoppelde records" id="overzicht-records">
        {flow.touches.length === 0
          ? <p className="text-sm text-ink-3">Nog geen: de flow heeft nog geen record veranderd.</p>
          : (
            <List label="Gekoppelde records">
              {flow.touches.map((t) => (
                <ListRow key={t.href + t.label} padded={false} title={t.label} meta={t.meta} href={t.href} />
              ))}
            </List>
          )}
      </PageSection>
    </div>
  )
}

/* ── settings ──────────────────────────────────────────────────────────────────────────────────── */

function SettingsTab({ flow }: { readonly flow: Automation }) {
  const access = useAccess("automations")
  const needs = scopesOf(flow)
  const [off, setOff] = useState<ReadonlyArray<Scope>>([])
  const [all, setAll] = useState(false)
  const [limit, setLimit] = useState("0")
  const [notify, setNotify] = useState<string>(PEOPLE[flow.owner].name)
  const [deleting, setDeleting] = useState(false)
  const shown = SCOPES.filter((sc) => all || needs.has(sc.id))
  const toggle = (sc: Scope, on: boolean) => {
    const before = off
    setOff(on ? off.filter((x) => x !== sc) : [...off, sc])
    const by = needs.get(sc)
    if (!on && by !== undefined) {
      toast({
        title: "Recht uitgezet",
        body: `De stap ‘${by[0] ?? ""}’ mislukt nu als hij draait.`,
        tone: "bad",
        action: { label: "Ongedaan maken", onClick: () => setOff(before) }
      })
    }
  }
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <SettingsSection
        id="inst-account"
        title="Workflowaccount"
        description="De flow werkt als een eigen serviceaccount, nooit als een persoon. Alles wat hij verandert, staat onder die naam in het logboek."
      >
        <SettingRow
          title="Account"
          description="Zo staat de flow in het logboek."
          control={<span className="text-sm text-ink">Flow · {flow.name}</span>}
          stack
        />
      </SettingsSection>
      <SettingsSection
        id="inst-rechten"
        title="Rechten"
        description={`Wat de flow mag aanraken. ${needs.size} ${
          needs.size === 1 ? "recht is" : "rechten zijn"
        } nodig voor de stappen; zet je een nodig recht uit, dan mislukt de stap die het gebruikt.`}
        footer={
          <Button size="sm" variant="ghost" onClick={() => setAll(!all)}>
            {all
              ? "Alleen de rechten tonen die de flow gebruikt"
              : `${SCOPES.length - needs.size} andere rechten tonen`}
          </Button>
        }
      >
        {shown.map((sc) => {
          const by = needs.get(sc.id)
          const on = by !== undefined && !off.includes(sc.id)
          return (
            <SettingRow
              key={sc.id}
              title={sc.label}
              description={by === undefined ? "Niet nodig: geen stap gebruikt dit" : `Gebruikt door ${by.join(", ")}`}
              control={
                <Toggle
                  label={sc.label}
                  on={on}
                  disabled={!access.edit || by === undefined}
                  onChange={(next) => toggle(sc.id, next)}
                />
              }
            />
          )
        })}
      </SettingsSection>
      <SettingsSection
        id="inst-uitvoeren"
        title="Uitvoeren"
        description="Uit betekent: de trigger wordt genegeerd en niets wordt ingehaald. Komen er meer events binnen dan de limiet, dan wachten ze op hun beurt."
      >
        <SettingRow
          title="Flow staat aan"
          description={flow.version === 0 ? "Publiceer eerst; dan gaat hij aan." : undefined}
          control={
            <Toggle
              label="Flow staat aan"
              on={flow.status === "actief"}
              disabled={!access.edit || flow.version === 0}
              onChange={(next) => {
                setStatus(flow.id, next ? "actief" : "gepauzeerd")
                toast({
                  title: next ? "Flow staat aan" : "Flow gepauzeerd",
                  action: { label: "Ongedaan maken", onClick: () => setStatus(flow.id, flow.status) }
                })
              }}
            />
          }
        />
        <SettingRow
          title="Limiet"
          htmlFor="inst-limiet"
          control={
            <Select
              id="inst-limiet"
              value={limit}
              disabled={!access.edit}
              onChange={(event) => setLimit(event.target.value)}
              className="w-44"
            >
              <option value="0">Geen limiet</option>
              <option value="10u">10 per uur</option>
              <option value="100u">100 per uur</option>
              <option value="1000d">1.000 per dag</option>
            </Select>
          }
        />
      </SettingsSection>
      <SettingsSection
        id="inst-fout"
        title="Bij een fout"
        description="De gekozen collega krijgt een melding met de run en wat er misging."
      >
        <SettingRow
          title="Melding naar"
          htmlFor="inst-melding"
          control={
            <Select
              id="inst-melding"
              value={notify}
              disabled={!access.edit}
              onChange={(event) => setNotify(event.target.value)}
              className="w-44"
            >
              {Object.values(PEOPLE).map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
            </Select>
          }
        />
      </SettingsSection>
      {access.manage && (
        <SettingsSection
          id="inst-weg"
          title="Verwijderen"
          description="De uitvoeringen blijven in de geschiedenis. Je kunt het een paar seconden ongedaan maken."
        >
          <SettingRow
            title="Automatisering verwijderen"
            control={<Button icon={<Trash />} onClick={() => setDeleting(true)}>Verwijderen</Button>}
          />
        </SettingsSection>
      )}
      <AlertDialog
        open={deleting}
        onCancel={() => setDeleting(false)}
        onConfirm={() => {
          setDeleting(false)
          remove(flow.id)
          navigate(paths.automations)
          toast({
            title: `‘${flow.name}’ verwijderd`,
            body: "De uitvoeringen blijven in de geschiedenis.",
            action: { label: "Ongedaan maken", onClick: () => restore(flow.id) }
          })
        }}
        title="Deze automatisering verwijderen?"
        body="Hij stopt meteen met draaien. Lopende runs maken hun stap af."
        confirmLabel="Verwijderen"
      />
    </div>
  )
}

/* ── dialogs ───────────────────────────────────────────────────────────────────────────────────── */

function RenameDialog(
  { flow, open, onClose }: { readonly flow: Automation; readonly open: boolean; readonly onClose: () => void }
) {
  const [name, setName] = useState(flow.name)
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Naam wijzigen"
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Annuleren</Button>
          <Button
            variant="primary"
            disabled={name.trim() === ""}
            onClick={() => {
              patch(flow.id, { name: name.trim() })
              onClose()
              toast({ title: "Naam gewijzigd" })
            }}
          >
            Naam wijzigen
          </Button>
        </>
      }
    >
      <Field label="Naam">
        {(control) => <Input {...control} value={name} onChange={(event) => setName(event.target.value)} />}
      </Field>
    </Dialog>
  )
}

function PublishDialog(
  { flow, open, onClose }: { readonly flow: Automation; readonly open: boolean; readonly onClose: () => void }
) {
  const [note, setNote] = useState("")
  const first = flow.version === 0
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={first ? "Eerste publicatie" : `v${flow.version + 1} publiceren`}
      description={first
        ? "De flow gaat aan en reageert vanaf nu op de trigger."
        : "Nieuwe runs gebruiken deze versie; lopende runs maken hun versie af. Je kunt altijd terug naar een eerdere."}
      footer={
        <>
          <Button onClick={onClose}>Annuleren</Button>
          <Button
            variant="primary"
            onClick={() => {
              publish(flow, note.trim() || (first ? "Eerste publicatie" : "Gepubliceerd"))
              onClose()
              setNote("")
              toast({
                title: first ? "Gepubliceerd: de flow staat aan" : `v${flow.version + 1} staat live`,
                tone: "good"
              })
            }}
          >
            Publiceren
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Wat is er veranderd" optional hint="Staat bij de versie, voor wie later wil weten waarom.">
          {(control) => (
            <Textarea
              {...control}
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Bijvoorbeeld: ticket gaat nu naar de agent"
            />
          )}
        </Field>
        <p className="text-xs text-pretty text-ink-3">
          {flow.steps.length} stappen · rechten:{" "}
          {[...scopesOf(flow).keys()].map((sc) => SCOPES.find((x) => x.id === sc)?.label).join(", ") || "geen"}
        </p>
      </div>
    </Dialog>
  )
}
