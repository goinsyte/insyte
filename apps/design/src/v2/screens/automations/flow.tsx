import { useEffect, useRef, useState } from "react"
import { flatSteps, SCOPES, scopesOf, stepType, usesAi, viaOf } from "../../fixtures/automations.ts"
import type { Automation, Run, Scope } from "../../fixtures/automations.ts"
import { PEOPLE } from "../../fixtures/workspace.ts"
import { Link, navigate, paths, setQuery, useQuery } from "../../router.tsx"
import { Denied, ReadOnlyNotice, useAccess } from "../../ui/access.tsx"
import { Avatar } from "../../ui/avatar.tsx"
import { Button, IconButton } from "../../ui/button.tsx"
import { cx } from "../../ui/cx.ts"
import { AlertDialog, Dialog } from "../../ui/dialog.tsx"
import { DropdownItem, DropdownMenu } from "../../ui/dropdown.tsx"
import { ArrowLeft, Copy, Edit, FlaskConical, MoreHorizontal, Pause, Play, Trash, Workflow } from "../../ui/icons.tsx"
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
import { WorkflowTab } from "./canvas.tsx"
import { issuesOf, pathOf, sampleLabel, sampleOf, stepIssues } from "./edits.ts"
import { FlowStatusLabel, RunSheet, RunsTable, sentence } from "./parts.tsx"
import {
  createDraft,
  logSetting,
  patch,
  publish,
  remove,
  restore,
  setStatus,
  setTest,
  useFlows,
  useRuns,
  useTest
} from "./store.ts"

type Tab = "workflow" | "uitvoeringen" | "overzicht" | "instellingen"
const TABS: ReadonlyArray<{ readonly value: Tab; readonly label: string }> = [
  { value: "workflow", label: "Workflow" },
  { value: "uitvoeringen", label: "Uitvoeringen" },
  { value: "overzicht", label: "Overzicht" },
  { value: "instellingen", label: "Instellingen" }
]

const STEP_MS = 320

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
  const test = useTest(flow.id)
  const running = test !== null && test.at !== null
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const hasTrigger = stepType(flow.steps[0]?.type ?? "")?.kind === "trigger"
  const changes = flow.unpublished === true

  /* Walks the flow on a real order, lighting each step for a beat. Nothing is saved or sent and no run
     is logged; a step that cannot run stops the test there and stays red until the flow is edited. */
  const runTest = () => {
    if (!hasTrigger) {
      toast({
        title: "Zet eerst een trigger in de flow",
        body: "Een test loopt de flow door met een voorbeeld, vanaf de trigger."
      })
      return
    }
    if (tab !== "workflow") setQuery({ tab: null, run: null })
    const order = sampleOf(flow)
    const big = (order?.total ?? 0) > 100
    const path = pathOf(flow.steps, big)
    const sample = sampleLabel(order)
    const done: Array<string> = []
    const walk = (i: number) => {
      const st = path[i]
      if (st === undefined) {
        setTest({ flowId: flow.id, at: null, done, sample })
        const split = flatSteps(flow.steps).some((x) => x.branches !== undefined)
        toast({
          title: "Test geslaagd, niets opgeslagen of verstuurd",
          body: `Voorbeeld ${sample} · ${path.length} stappen${split ? `, via ${big ? "Ja" : "Nee"}` : ""}.`,
          tone: "good"
        })
        return
      }
      setTest({ flowId: flow.id, at: st.id, done: [...done], sample })
      timer.current = window.setTimeout(() => {
        const [reason] = stepIssues(st, flow)
        if (reason !== undefined) {
          setTest({ flowId: flow.id, at: null, done, failed: { id: st.id, reason }, sample })
          toast({
            title: `Test gestopt bij ${st.summary}`,
            body: `${reason} Voorbeeld ${sample}.`,
            tone: "bad",
            duration: 8000,
            action: { label: "Stap openen", onClick: () => setQuery({ stap: st.id }) }
          })
          return
        }
        done.push(st.id)
        walk(i + 1)
      }, STEP_MS)
    }
    walk(0)
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
              <Button icon={running ? undefined : <FlaskConical />} loading={running} onClick={runTest}>
                {running ? "Bezig met testen" : "Test met voorbeeld"}
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
                      patch(copy, { steps: flow.steps, description: flow.description, scopesOff: flow.scopesOff })
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
            ? <WorkflowTab flow={flow} runs={runs} />
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

const DAY_MS = 86_400_000
/** Monday 23 November 2026: the day the screens are set on. */
const TODAY = new Date(2026, 10, 23).getTime()
const shortDate = (t: number) =>
  new Date(t).toLocaleDateString("nl-NL", { day: "numeric", month: "short" }).replace(".", "")

/** A flow's runs over the last 30 days, one figure a day, spread the way its trigger fires (weekdays busier). */
function runsPerDay(flow: Automation): ReadonlyArray<number> {
  if (flow.runs30 === 0) return Array.from({ length: 30 }, () => 0)
  let seed = [...flow.id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7)
  const weights = Array.from({ length: 30 }, (_, i) => {
    seed = (seed * 1_664_525 + 1_013_904_223) >>> 0
    const day = new Date(TODAY - (29 - i) * DAY_MS).getDay()
    return (day === 0 || day === 6 ? 0.6 : 1) * (0.5 + seed / 4_294_967_296)
  })
  const total = weights.reduce((a, b) => a + b, 0)
  return weights.map((w) => Math.round((w / total) * flow.runs30))
}

function RunsChart({ flow, runs }: { readonly flow: Automation; readonly runs: ReadonlyArray<Run> }) {
  const days = runsPerDay(flow)
  const max = Math.max(1, ...days)
  const failed = runs.filter((r) => r.status === "mislukt").length
  const waiting = runs.filter((r) => r.status === "wacht").length
  const ok = runs.length === 0 ? null : Math.round(((runs.length - failed) / runs.length) * 100)
  const saved = (flow.runs30 * 3) / 60
  return (
    <PageSection
      title="Uitvoeringen in de laatste 30 dagen"
      id="overzicht-runs"
      actions={runs.length > 0 && (
        <Link
          to={`${paths.automation(flow.id)}?tab=uitvoeringen`}
          className="text-xs text-ink-3 underline-offset-2 hover:text-ink hover:underline"
        >
          Alle uitvoeringen
        </Link>
      )}
    >
      {flow.runs30 === 0
        ? (
          <p className="text-sm text-ink-3">
            {flow.version === 0
              ? "Publiceer de flow om hem te laten draaien."
              : "De trigger is deze maand niet afgegaan."}
          </p>
        )
        : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end gap-x-10 gap-y-3">
              <Figure value={flow.runs30.toLocaleString("nl-NL")} label="uitvoeringen" />
              <Figure value={ok === null ? "—" : `${ok}%`} label="geslaagd" />
              <Figure
                value={`≈ ${saved.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} u`}
                label="handwerk bespaard"
              />
              <p className="max-w-[44ch] pb-1 text-xs text-ink-3">
                {failed > 0 ? `${failed} mislukt` : "Niets mislukt"}
                {waiting > 0 ? `, ${waiting} wacht` : ""} in de laatste {runs.length} uitvoeringen.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <div
                className="flex h-24 items-end gap-[3px]"
                role="img"
                aria-label={`${flow.runs30} uitvoeringen in 30 dagen, het meest op één dag ${max}`}
              >
                {days.map((n, i) => (
                  <span
                    key={TODAY - (29 - i) * DAY_MS}
                    title={`${shortDate(TODAY - (29 - i) * DAY_MS)}: ${n} ${n === 1 ? "uitvoering" : "uitvoeringen"}`}
                    className={cx(
                      "flex-1 rounded-t-[2px]",
                      n === 0 ? "bg-line" : i === days.length - 1 ? "bg-accent" : "bg-series-2 hover:bg-ink-3"
                    )}
                    style={{ height: `${Math.max(4, (n / max) * 100)}%` }}
                  />
                ))}
              </div>
              <div className="figure flex justify-between text-xs text-ink-3">
                <span>{shortDate(TODAY - 29 * DAY_MS)}</span>
                <span>vandaag</span>
              </div>
            </div>
          </div>
        )}
    </PageSection>
  )
}

function Figure({ value, label }: { readonly value: string; readonly label: string }) {
  return (
    <span className="flex flex-col">
      <span className="figure text-xl font-semibold text-ink">{value}</span>
      <span className="text-xs text-ink-3">{label}</span>
    </span>
  )
}

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
            { label: "Uitvoeringen in totaal", value: flow.runs.toLocaleString("nl-NL"), figure: true },
            { label: "Mislukt, recent", value: failed === 0 ? "Niets mislukt" : `${failed} mislukt`, figure: true },
            { label: "Stappen", value: flatSteps(flow.steps).length, figure: true },
            { label: "Koppelingen", value: ["Insyte", ...viaOf(flow)].join(", ") },
            { label: "Met AI-stap", value: usesAi(flow) ? "Ja" : "Nee" }
          ]}
        />
      </div>
      <RunsChart flow={flow} runs={runs} />
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

const LIMITS: ReadonlyArray<readonly [string, string]> = [
  ["0", "Geen limiet"],
  ["10u", "10 per uur"],
  ["100u", "100 per uur"],
  ["1000d", "1.000 per dag"]
]

/** What the flow itself changed, under its own name, from its latest runs. */
function flowActions(flow: Automation, runs: ReadonlyArray<Run>) {
  const steps = flatSteps(flow.steps).filter((st) => stepType(st.type)?.kind === "actie")
  return runs
    .filter((r) => r.status === "geslaagd" && r.record !== null)
    .flatMap((r) => {
      const taken = r.lane === undefined ? steps : steps.filter((st) => {
        const branch = flow.steps.find((x) => x.branches !== undefined)
        const other = r.lane === "yes" ? branch?.branches?.no : branch?.branches?.yes
        return other?.some((x) => x.id === st.id) !== true
      })
      return taken.map((st) => ({ key: `${r.id}-${st.id}`, at: r.at, what: st.summary, on: r.record }))
    })
    .slice(0, 8)
}

function SettingsTab({ flow }: { readonly flow: Automation }) {
  const access = useAccess("automations")
  const runs = useRuns().filter((r) => r.automationId === flow.id)
  const needs = scopesOf(flow)
  const off = flow.scopesOff ?? []
  const [all, setAll] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const shown = SCOPES.filter((sc) => all || needs.has(sc.id))
  const notify = flow.notify ?? flow.owner
  const limit = flow.limit ?? "0"
  const acted = flowActions(flow, runs)

  const toggle = (sc: Scope, on: boolean) => {
    const label = SCOPES.find((x) => x.id === sc)?.label ?? sc
    const before = flow
    logSetting(flow, `zette ‘${label}’ ${on ? "aan" : "uit"}`, {
      scopesOff: on ? off.filter((x) => x !== sc) : [...off, sc]
    })
    const by = needs.get(sc)
    if (!on && by !== undefined) {
      toast({
        title: "Recht uitgezet",
        body: `De stap ‘${by[0] ?? ""}’ mislukt nu als hij draait; een test stopt daar ook.`,
        tone: "bad",
        action: {
          label: "Ongedaan maken",
          onClick: () => patch(flow.id, { scopesOff: before.scopesOff ?? [], log: before.log ?? [] })
        }
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
              description={by === undefined
                ? "Niet nodig: geen stap gebruikt dit"
                : on
                ? `Gebruikt door ${by.join(", ")}`
                : `Staat uit: ${by.join(", ")} mislukt`}
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
                logSetting(flow, next ? "zette de flow aan" : "pauzeerde de flow", {
                  status: next ? "actief" : "gepauzeerd"
                })
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
              onChange={(event) => {
                const label = LIMITS.find(([v]) => v === event.target.value)?.[1] ?? ""
                logSetting(flow, `zette de limiet op ${label.toLowerCase()}`, { limit: event.target.value })
              }}
              className="w-44"
            >
              {LIMITS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
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
              onChange={(event) => {
                const who = event.target.value as keyof typeof PEOPLE
                logSetting(flow, `liet meldingen bij een fout naar ${PEOPLE[who].name} gaan`, { notify: who })
              }}
              className="w-44"
            >
              {(Object.keys(PEOPLE) as Array<keyof typeof PEOPLE>).map((k) => (
                <option key={k} value={k}>{PEOPLE[k].name}</option>
              ))}
            </Select>
          }
        />
      </SettingsSection>
      <section aria-labelledby="inst-logboek" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="inst-logboek" className="text-md font-semibold text-ink">Logboek</h2>
          <Link to={paths.log} className="text-xs text-ink-3 underline-offset-2 hover:text-ink hover:underline">
            Volledig logboek
          </Link>
        </div>
        <div className="flex flex-col gap-1.5">
          <h3 className="text-xs font-medium text-ink-3">Instellingen</h3>
          {(flow.log ?? []).length === 0
            ? <p className="text-sm text-ink-3">Nog niemand heeft de instellingen van deze flow veranderd.</p>
            : (
              <ul className="flex flex-col">
                {(flow.log ?? []).slice(0, 8).map((e, i) => (
                  <li key={`${e.at}-${i}`} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 py-1.5 text-sm">
                    <span className="figure text-ink-3">{e.at}</span>
                    <span className="text-ink-2">
                      <span className="font-medium text-ink">{e.by}</span> {e.what}
                    </span>
                  </li>
                ))}
              </ul>
            )}
        </div>
        <div className="flex flex-col gap-1.5">
          <h3 className="text-xs font-medium text-ink-3">Wat de flow veranderde, als Flow · {flow.name}</h3>
          {acted.length === 0
            ? <p className="text-sm text-ink-3">Nog niets: de flow heeft nog geen record veranderd.</p>
            : (
              <ul className="flex flex-col">
                {acted.map((e) => (
                  <li key={e.key} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 py-1.5 text-sm">
                    <span className="figure text-ink-3">{e.at}</span>
                    <span className="min-w-0 truncate text-ink-2">
                      <span className="font-medium text-ink">{e.what}</span> op {e.on === null ?
                        "een record" :
                        (
                          <Link to={e.on.href} className="underline-offset-2 hover:underline">
                            {e.on.label}
                            {e.on.who === undefined ? "" : ` · ${e.on.who}`}
                          </Link>
                        )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
        </div>
      </section>
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
  const issues = [...issuesOf(flow)].flatMap(([id, found]) => {
    const st = flatSteps(flow.steps).find((x) => x.id === id)
    return found.map((why) => `${st?.summary ?? "Een stap"}: ${why}`)
  })
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
            disabled={issues.length > 0}
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
        {issues.length > 0 && (
          <Notice tone="bad" title={`Los eerst ${issues.length === 1 ? "dit" : `deze ${issues.length}`} op`}>
            <ul className="flex flex-col gap-0.5">
              {issues.map((x) => <li key={x}>{x}</li>)}
            </ul>
          </Notice>
        )}
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
          {flatSteps(flow.steps).length} stappen · rechten:{" "}
          {[...scopesOf(flow).keys()].map((sc) => SCOPES.find((x) => x.id === sc)?.label).join(", ") || "geen"}
        </p>
      </div>
    </Dialog>
  )
}
