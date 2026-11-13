import { useMemo } from "react"
import { automations } from "../../data-source"
import { EmptyState } from "../common/empty-state"
import { PageGuide } from "../common/page-guide"
import { formatDateTime } from "../lib/format"
import { undoable } from "../lib/undo"
import { cn } from "../lib/utils"
import { flatNodes, VARIANTS_BY_ID, type WorkflowState } from "./node-types"
import { hashOf, runLabel } from "./runs"
import { RecordLink, RUN_DOT } from "./runs-tab"
import { useAutomationsSource } from "./source"
import { StepTile } from "./step-tile"
import { titleOf } from "./summary"

const DAYS = 30
const MIN_PER_STEP = 1.5

const GUIDE = [
  {
    title: "Runs en besparing",
    body: `Bespaard is een schatting: ${
      MIN_PER_STEP.toLocaleString("nl-NL")
    } min per actie die je anders met de hand doet, maal de acties per run.`,
    art: "chart"
  },
  {
    title: "Versies",
    body:
      "Publiceren legt een versie vast, met wie het deed en waarom. Terugzetten zet een versie op het canvas; publiceer om hem weer live te zetten.",
    art: "undo"
  },
  { title: "Gekoppelde records", body: "Elk record waar de flow voor draaide, staat hier.", art: "log" }
] as const

/** The sentence a flow is, when nobody wrote one: "Als X, dan a, b en c." */
function sentenceOf(w: WorkflowState): string {
  if (w.description.trim()) return w.description
  const [trigger, ...rest] = w.nodes
  if (!trigger) return "Deze flow heeft nog geen stappen."
  const acts = flatNodes(rest)
    .filter((n) => VARIANTS_BY_ID[n.variantId]?.kind === "action")
    .map((n) => titleOf(n).toLowerCase())
  const list = acts.length > 1 ? `${acts.slice(0, -1).join(", ")} en ${acts.at(-1)}` : (acts[0] ?? "niets")
  return `Als ${titleOf(trigger).toLowerCase()}: ${list}.`
}

/** Runs per day over the 30 days up to the last run, summing to the flow's own 30-day count. */
function daily(w: WorkflowState): { days: number[]; total: number; end: number } {
  const end = w.history[0] ? Date.parse(w.history[0].at) : Date.now()
  // The console installs no seed: only the design app has written-down runs.
  const counted = (automations as typeof automations | undefined)?.find((a) => a.id === w.automationId)?.runs_30d
  const inWindow = w.history.filter((r) => end - Date.parse(r.at) < DAYS * 86_400_000)
  const total = Math.max(inWindow.length, counted ?? inWindow.length)
  const days = Array.from({ length: DAYS }, () => 0)
  for (const r of inWindow) days[DAYS - 1 - Math.floor((end - Date.parse(r.at)) / 86_400_000)] += 1
  let left = total - inWindow.length
  const weights = days.map((_, i) => 1 + (hashOf(`${w.automationId}d${i}`) % 4))
  const sum = weights.reduce((a, b) => a + b, 0)
  for (let i = 0; i < DAYS && left > 0; i++) {
    const add = Math.min(left, Math.round((weights[i] / sum) * (total - inWindow.length)))
    days[i] += add
    left -= add
  }
  for (let i = DAYS - 1; left > 0; i = (i + DAYS - 1) % DAYS) {
    days[i] += 1
    left -= 1
  }
  return { days, total, end }
}

/**
 * The Overzicht: what the flow does in one sentence, the facts about it in one band, how it ran over
 * the last 30 days (with the success rate and the hand work it saved, said as an estimate), every
 * version with who published it and why, and the records it touched.
 */
export function OverviewTab(
  { workflow: w, onOpenTab }: { workflow: WorkflowState; onOpenTab: (t: "workflow" | "runs") => void }
) {
  const { editor, runs } = useAutomationsSource()
  const trigger = w.nodes[0] ? VARIANTS_BY_ID[w.nodes[0].variantId] : undefined
  const { days, total, end } = useMemo(() => daily(w), [w])
  const done = w.history.filter((r) => r.status !== "waiting" && r.status !== "running")
  const okRate = done.length ? Math.round((done.filter((r) => r.status !== "failed").length / done.length) * 100) : null
  const actions = flatNodes(w.nodes).filter((n) => VARIANTS_BY_ID[n.variantId]?.kind === "action").length
  const saved = (total * actions * MIN_PER_STEP) / 60
  const max = Math.max(1, ...days)
  const failed = w.history.filter((r) => r.status === "failed").length
  const waiting = w.history.filter((r) => r.status === "waiting").length

  const records = useMemo(() => {
    const by = new Map<
      string,
      { record: NonNullable<(typeof w.history)[number]["record"]>; runs: number; last: (typeof w.history)[number] }
    >()
    for (const r of w.history) {
      if (!r.record) continue
      const e = by.get(r.record.id)
      if (e) e.runs += 1
      else by.set(r.record.id, { record: r.record, runs: 1, last: r })
    }
    return [...by.values()].slice(0, 8)
  }, [w.history])

  return (
    <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-6 px-5 py-6">
      <p className="max-w-[62ch] text-ink text-lg">{sentenceOf(w)}</p>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg bg-mist px-4 py-3 sm:grid-cols-5">
        <Fact label="Eigenaar">
          <span className="flex items-center gap-1.5">
            <span className="flex size-5 items-center justify-center rounded-full bg-person-1 font-medium text-person-ink text-xs">
              {w.owner.charAt(0)}
            </span>
            {w.owner}
          </span>
        </Fact>
        <Fact label="Trigger">
          <span className="flex min-w-0 items-center gap-1.5">
            {trigger ? <StepTile variant={trigger} size={16} /> : null}
            <span className="truncate">{trigger?.label ?? "Nog geen"}</span>
          </span>
        </Fact>
        <Fact label="Status">
          {w.status === "active" ? "Actief" : w.status === "paused" ? "Gepauzeerd" : "Concept"}
        </Fact>
        <Fact label="Live versie">{w.version ? `v${w.version}` : "Nog niet gepubliceerd"}</Fact>
        <Fact label="Runs in totaal">{w.runs.toLocaleString("nl-NL")}</Fact>
      </dl>

      <section className="flex flex-col gap-3 rounded-lg bg-paper px-4 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 className="font-medium text-ink text-md">Runs in de laatste 30 dagen</h2>
          {w.history.length > 0 ?
            (
              <button
                type="button"
                onClick={() => onOpenTab("runs")}
                className="text-arc-ink text-sm underline-offset-2 hover:underline"
              >
                Alle runs
              </button>
            ) :
            null}
        </div>
        {w.history.length === 0 ?
          (
            <EmptyState
              compact
              kind="automations"
              title={runs ? "Nog geen runs." : "Binnenkort."}
              body={!runs
                ? "Hier staan de runs zodra flows echt draaien."
                : w.version === 0
                ? "Publiceer de flow om hem te laten draaien."
                : "De trigger is nog niet afgegaan."}
            />
          ) :
          (
            <>
              <div className="flex flex-wrap items-end gap-x-10 gap-y-3">
                <Figure value={total.toLocaleString("nl-NL")} label="runs" />
                <Figure value={okRate === null ? "—" : `${okRate}%`} label="geslaagd" />
                <Figure
                  value={`≈ ${saved.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} u`}
                  label="handwerk bespaard"
                />
                <p className="max-w-[44ch] pb-1 text-ink-3 text-xs leading-[1.5]">
                  {failed > 0 ? `${failed} mislukt` : "Niets mislukt"}
                  {waiting > 0 ? `, ${waiting} wacht` : ""} in de laatste {w.history.length} runs.
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex h-24 items-end gap-[3px]" role="img" aria-label={`${total} runs in 30 dagen`}>
                  {days.map((n, i) => (
                    <span
                      // biome-ignore lint/suspicious/noArrayIndexKey: one bar per day, in order
                      key={i}
                      title={`${
                        new Date(end - (DAYS - 1 - i) * 86_400_000).toLocaleDateString("nl-NL", {
                          day: "numeric",
                          month: "short"
                        })
                      }: ${n} ${n === 1 ? "run" : "runs"}`}
                      className={cn("flex-1", n === 0 ? "bg-ink/6" : "bg-arc/70 hover:bg-arc")}
                      // A bar's 2px top corners are below the radius ladder, so they are the bar's own, not a role.
                      style={{
                        height: `${Math.max(4, (n / max) * 100)}%`,
                        borderTopLeftRadius: 2,
                        borderTopRightRadius: 2
                      }}
                    />
                  ))}
                </div>
                <div className="flex justify-between text-ink-3 text-xs tabular-nums">
                  <span>
                    {new Date(end - (DAYS - 1) * 86_400_000).toLocaleDateString("nl-NL", {
                      day: "numeric",
                      month: "long"
                    })}
                  </span>
                  <span>{new Date(end).toLocaleDateString("nl-NL", { day: "numeric", month: "long" })}</span>
                </div>
              </div>
            </>
          )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="flex flex-col gap-2">
          <h2 className="font-medium text-ink text-md">Versies</h2>
          {w.versions.length === 0 ?
            <p className="rounded-lg bg-mist px-3 py-3 text-ink-3 text-sm">Nog niet gepubliceerd.</p> :
            (
              <ol className="flex flex-col">
                {w.versions.map((v, i) => (
                  <li key={v.v} className="flex items-center gap-3 rounded-md px-2.5 py-2 odd:bg-mist">
                    <span className="w-8 shrink-0 font-medium text-ink text-sm tabular-nums">v{v.v}</span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-ink text-sm">{v.note}</span>
                      <span className="truncate text-ink-3 text-xs">
                        {v.by} · {formatDateTime(v.at)} · {flatNodes(v.nodes).length} stappen
                      </span>
                    </span>
                    {i === 0 ?
                      (
                        <span className="shrink-0 rounded-full bg-signal-green-bg px-2 py-0.5 font-medium text-signal-green text-xs">
                          Live
                        </span>
                      ) :
                      (
                        <button
                          type="button"
                          onClick={() => {
                            const undo = editor.restoreVersion(w.automationId, v.v)
                            if (!undo) return
                            onOpenTab("workflow")
                            undoable(`v${v.v} staat op het canvas`, undo, "Publiceer om hem weer live te zetten.")
                          }}
                          className="h-7 shrink-0 rounded-md px-2 font-medium text-arc-ink text-xs hover:bg-arc-tint"
                        >
                          Terugzetten
                        </button>
                      )}
                  </li>
                ))}
              </ol>
            )}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-medium text-ink text-md">Gekoppelde records</h2>
          {records.length === 0 ?
            <p className="rounded-lg bg-mist px-3 py-3 text-ink-3 text-sm">Nog geen.</p> :
            (
              <ul className="flex flex-col">
                {records.map(({ record, runs: count, last }) => (
                  <li key={record.id} className="flex items-center gap-2.5 rounded-md px-2.5 py-2 odd:bg-mist">
                    <span
                      className={cn("size-1.5 shrink-0 rounded-full", RUN_DOT[last.status])}
                      title={runLabel(last)}
                      aria-hidden
                    />
                    <RecordLink record={record} className="shrink-0 text-sm tabular-nums" />
                    <span className="min-w-0 flex-1 truncate text-ink-2 text-sm">{record.name}</span>
                    <span className="shrink-0 text-ink-3 text-xs tabular-nums">
                      {count} {count === 1 ? "run" : "runs"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
        </section>
      </div>
      <PageGuide id="automations.overview" title="Overzicht" steps={GUIDE} />
    </div>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-ink-3 text-xs">{label}</dt>
      <dd className="min-w-0 truncate font-medium text-ink text-sm">{children}</dd>
    </div>
  )
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="font-medium text-3xl text-ink tabular-nums">{value}</span>
      <span className="text-ink-3 text-xs">{label}</span>
    </span>
  )
}
