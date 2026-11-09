import { motion, useReducedMotion } from "motion/react"
import { useEffect, useRef, useState } from "react"
import { Bot, Check, Sheet, Workflow } from "../../icons"
import { InsyteMark, Shimmer } from "../ask/parts"
import { type Finding, type Prediction, type PreparedId, QUESTIONS, type Watch } from "../lib/first-analysis"
import { cn } from "../lib/utils"
import type { StepDef } from "./onboarding-shell"
import { SelectionGroup, SelectionTile } from "./selection-tile"
import type { OnboardingData } from "./use-onboarding-state"

/*
 * The analysis step of the first analysis (PLAN 45), between the first import and "Je bent binnen": it reads the
 * store, then either names the one problem worth fixing first, with the evidence and the fix built, or, with too
 * little history, says so and prepares instead. One finding, never a list: the first ten minutes stay small.
 *
 * What it reads is the host's (`AnalysisSource`): the design app's seed, ticked off at the reference's pace, or the
 * console's `FirstAnalysis.get`, ticked off as the server reads.
 */

export type AnalysisSource = {
  /** The store is connected (else there is nothing to read). */
  connected: boolean
  /** The reading failed: the step says so and prepares from the answers alone. */
  failed?: boolean
  store: { orders: number; mails: number; days: number }
  /** Whether the history would be enough to judge, where the host knows: a store with enough is told why there is no finding. */
  history?: "young" | "enough"
  /** Whether the reading includes the inbox (the console reads mail from M15). */
  readsMail: boolean
  /** What the reading goes through. `done` is the host's where it has it; without it, each ticks off at the reference's pace. */
  reads: ReadonlyArray<{ label: string; done?: boolean }>
  /** The reading is over: the host's, or the reference's when its ticking ends (`data.analysisRead`). */
  read?: boolean
  finding?: Finding
  early?: { predictions: ReadonlyArray<Prediction>; watch: ReadonlyArray<Watch> }
  prepared: Record<PreparedId, { title: string; does: string }>
}

const PREPARED_ICON: Record<PreparedId, typeof Bot> = { automation: Workflow, agent: Bot, sheet: Sheet }
const PREPARED_KIND: Record<PreparedId, string> = { automation: "Concept", agent: "Eerst vragen", sheet: "Rekenblad" }

type Data = Record<string, unknown>

/** Which way the analysis came out: a finding, an early read of the setup, or nothing to read. */
export function analysisMode(source: AnalysisSource): "finding" | "early" | "none" {
  if (!source.connected || source.failed) return "none"
  return source.finding ? "finding" : "early"
}

/** What is prepared unless the operator unticks it. With nothing to read, only the agent. */
export function defaultPrepared(source: AnalysisSource): PreparedId[] {
  const mode = analysisMode(source)
  return mode === "finding" ? ["automation", "agent", "sheet"] : mode === "early" ? ["automation", "agent"] : ["agent"]
}

export const preparedTitles = (source: AnalysisSource) => ({
  automation: source.prepared.automation.title,
  agent: source.prepared.agent.title,
  sheet: source.prepared.sheet.title
})

const nl = (n: number) => n.toLocaleString("nl-NL")

/** Whether the reading is over: the host says so, or the reference's ticking has ended. */
const isRead = (source: AnalysisSource, data: Data) =>
  analysisMode(source) === "none" || (source.read ?? data.analysisRead === true)

export function analysisCopy(source: AnalysisSource, read: boolean) {
  const mode = analysisMode(source)
  const A = source
  if (mode === "none") {
    return source.failed
      ? {
        title: "Insyte kon je winkel nu niet lezen.",
        subtitle: "Twee vragen, dan staat het juiste klaar. Wat Insyte nodig heeft, leest het zodra het kan."
      }
      : {
        title: "Nog niets om te lezen.",
        subtitle:
          "Zonder gekoppelde winkel kan Insyte niet kijken. Twee vragen, dan staat het juiste klaar zodra je koppelt."
      }
  }
  if (!read) {
    return {
      title: "Insyte leest je winkel.",
      subtitle: source.readsMail
        ? "Bestellingen, mail en je beleid. Dit duurt een paar seconden."
        : "Bestellingen, productpagina's en je beleid. Dit duurt een paar seconden."
    }
  }
  if (mode === "early") {
    return {
      title: "Nog te vroeg om te oordelen.",
      subtitle: A.history === "enough"
        ? "Zonder je mail wijst Insyte geen knelpunt aan, en je mail leest het nog niet. Insyte gokt niet, het bereidt voor."
        : `${
          nl(A.store.orders)
        } bestellingen in ${A.store.days} dagen is te weinig om een knelpunt aan te wijzen. Insyte gokt niet, het bereidt voor.`
    }
  }
  return {
    title: "Dit pakt Insyte als eerste aan.",
    subtitle: `Gelezen: ${nl(A.store.orders)} bestellingen en ${
      nl(A.store.mails)
    } mails uit de laatste ${A.store.days} dagen.`
  }
}

/** The step, as the onboarding shell shows it; `onPrimary` gets what to prepare and the answers. */
export function analysisStep({
  source,
  data,
  patch,
  onPrimary
}: {
  source: AnalysisSource
  data: Data
  patch: (p: OnboardingData) => void
  onPrimary: (ids: PreparedId[], answers: Record<string, string>) => void | Promise<void>
}): StepDef {
  const read = isRead(source, data)
  const prepared = (data.prepared as PreparedId[] | undefined) ?? defaultPrepared(source)
  return {
    id: "analysis",
    ...analysisCopy(source, read),
    busyLabel: "Wordt klaargezet",
    canContinue: true,
    // While Insyte reads there is nothing to decide yet, so there is nothing to press.
    hidePrimary: !read && analysisMode(source) !== "none",
    primaryLabel: prepared.length > 0 ? "Klaarzetten" : "Doorgaan zonder",
    onPrimary: () => onPrimary(prepared, (data.answers as Record<string, string> | undefined) ?? {}),
    content: <AnalysisStep source={source} data={data} patch={patch} />
  }
}

export function AnalysisStep(
  { source, data, patch }: { source: AnalysisSource; data: Data; patch: (p: OnboardingData) => void }
) {
  const A = source
  const mode = analysisMode(source)
  const read = isRead(source, data)
  const prepared = (data.prepared as PreparedId[] | undefined) ?? defaultPrepared(source)
  const answers = (data.answers as Record<string, string> | undefined) ?? {}

  if (!read) return <Reading reads={A.reads} onDone={() => patch({ analysisRead: true })} />

  return (
    <motion.div
      className="flex flex-col gap-6"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
    >
      {mode === "finding" && A.finding ? <FindingView finding={A.finding} /> : null}
      {mode === "early" && A.early && A.early.predictions.length > 0
        ? <Predictions predictions={A.early.predictions} />
        : null}
      {mode !== "finding" ?
        <Questions answers={answers} onAnswer={(id, v) => patch({ answers: { ...answers, [id]: v } })} /> :
        null}
      {mode === "early" && A.early ? <WatchList watch={A.early.watch} /> : null}
      <section className="flex flex-col gap-2">
        <h2 className="font-medium text-sm text-ink">
          {mode === "none" ? "Staat klaar zodra je koppelt" : "Staat klaar"}
        </h2>
        <SelectionGroup
          mode="multi"
          value={prepared}
          onChange={(v) => patch({ prepared: v as PreparedId[] })}
          columns={1}
          label="Wat Insyte klaarzet"
        >
          {defaultPrepared(source).map((id) => (
            <SelectionTile
              key={id}
              id={id}
              icon={PREPARED_ICON[id]}
              label={A.prepared[id].title}
              hint={A.prepared[id].does}
              meta={
                <span className="text-xs text-ink-2">
                  {id === "agent" && answers.reply === "auto" ? "Zelf doen" : PREPARED_KIND[id]}
                </span>
              }
            />
          ))}
        </SelectionGroup>
        <p className="text-sm text-ink-2 leading-normal">
          Niets hiervan gaat naar een klant voordat jij het hebt gezien.
        </p>
      </section>
    </motion.div>
  )
}

/**
 * The reading: each source ticks off in turn, Insyte's mark working beside the one in progress. Where the host says
 * which are done, the ticks follow it; else each takes the reference's 720 ms and the step is told when all are.
 */
function Reading({ reads, onDone }: { reads: ReadonlyArray<{ label: string; done?: boolean }>; onDone: () => void }) {
  const still = useReducedMotion()
  const live = reads.some((r) => r.done !== undefined)
  const [ticked, setAt] = useState(still ? reads.length : 0)
  const at = live
    ? reads.findIndex((r) => r.done !== true) === -1 ? reads.length : reads.findIndex((r) => r.done !== true)
    : ticked
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => {
    if (live) return
    if (ticked >= reads.length) {
      const t = window.setTimeout(() => done.current(), still ? 0 : 420)
      return () => window.clearTimeout(t)
    }
    const t = window.setTimeout(() => setAt((n) => n + 1), 720)
    return () => window.clearTimeout(t)
  }, [live, ticked, still, reads.length])
  return (
    <ul className="flex flex-col gap-1.5" role="status" aria-live="polite">
      {reads.map(({ label }, i) => {
        const done = i < at
        const now = i === at
        return (
          <li
            key={label}
            className={cn(
              "flex h-11 items-center gap-3 rounded-lg px-3.5 transition-colors duration-300",
              now || done ? "bg-paper" : "bg-paper/50"
            )}
          >
            <span className="flex size-5 shrink-0 items-center justify-center">
              {done ?
                (
                  <motion.span initial={still ? false : { scale: 0.4 }} animate={{ scale: 1 }}>
                    <Check className="size-4 text-signal-green" strokeWidth={2.5} />
                  </motion.span>
                ) :
                now ?
                <InsyteMark size={20} working /> :
                <span className="size-1.5 rounded-full bg-ink/15" />}
            </span>
            <span className={cn("flex-1 text-base", done ? "text-ink" : now ? "font-medium text-ink" : "text-ink-3")}>
              {now ? <Shimmer>{label}</Shimmer> : label}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function FindingView({ finding: f }: { finding: Finding }) {
  return (
    <>
      <section className="flex flex-col gap-4 rounded-xl bg-paper p-4">
        <div className="flex items-start gap-3">
          <InsyteMark size={24} />
          <p className="font-medium text-lg text-ink leading-snug text-balance">{f.headline}</p>
        </div>
        <dl className="flex flex-col gap-3">
          {f.evidence.map((e) => (
            <div key={e.figure} className="flex flex-col gap-0.5">
              <dt className="text-base text-ink leading-snug">
                <span className="font-medium tabular-nums">{e.figure}</span> {e.says}
              </dt>
              <dd className="text-xs text-ink-3">{e.basis}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="flex flex-col gap-1.5">
        <h2 className="font-medium text-base text-ink">{f.fix.title}</h2>
        <p className="text-base text-ink-2 leading-normal">{f.fix.why}</p>
        <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="rounded-md bg-arc-tint px-2 py-0.5 font-medium text-sm text-arc-ink tabular-nums">
            {f.effect.figure}
          </span>
          <span className="text-xs text-ink-3">{f.effect.basis}</span>
        </p>
      </section>
    </>
  )
}

function Predictions({ predictions }: { predictions: ReadonlyArray<Prediction> }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-medium text-sm text-ink">Wat je inrichting al zegt</h2>
      <ul className="flex flex-col gap-1.5">
        {predictions.map((p) => (
          <li key={p.read} className="flex flex-col gap-1 rounded-lg bg-paper px-3.5 py-3">
            <span className="font-medium text-sm text-ink">{p.read}</span>
            <span className="text-sm text-ink-2 leading-normal">{p.expect}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Questions(
  { answers, onAnswer }: { answers: Record<string, string>; onAnswer: (id: string, v: string) => void }
) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-medium text-sm text-ink">Twee vragen, zodat het juiste klaarstaat</h2>
      {QUESTIONS.map((q) => {
        const value = answers[q.id] ?? q.initial
        return (
          <div key={q.id} className="flex flex-col gap-1.5">
            <span id={`q-${q.id}`} className="text-sm text-ink-2">
              {q.ask}
            </span>
            <div
              role="radiogroup"
              aria-labelledby={`q-${q.id}`}
              className="flex w-full items-center rounded-lg bg-ink/6 p-0.5 text-sm"
            >
              {q.options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={value === o.id}
                  onClick={() => onAnswer(q.id, o.id)}
                  className={cn(
                    "flex h-8 flex-1 items-center justify-center rounded-md px-2 font-medium transition-colors",
                    value === o.id ? "bg-paper text-ink" : "text-ink-2 hover:text-ink"
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </section>
  )
}

function WatchList({ watch }: { watch: ReadonlyArray<Watch> }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-medium text-sm text-ink">Waar Insyte op let</h2>
      <ul className="flex flex-col gap-3">
        {watch.map((w) => (
          <li key={w.label} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-ink">
                <span className="font-medium">{w.label}</span>
                <span className="text-ink-2">, {w.then}</span>
              </span>
              <span className="shrink-0 text-xs text-ink-2 tabular-nums">
                {w.have} van {w.need}
              </span>
            </div>
            <span className="h-1 overflow-hidden rounded-full bg-ink/8" aria-hidden>
              <span
                className="block h-full rounded-full bg-arc"
                style={{ width: `${Math.min(100, (w.have / w.need) * 100)}%` }}
              />
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
