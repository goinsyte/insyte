import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import type { FirstAnalysisView } from "@insyte/modules/first-analysis/domain/FirstAnalysis"
import type { AgentActionId, AutonomyLevel } from "@insyte/ui/app/lib/autonomy"
import type { OfflineWindow, PreparedId } from "@insyte/ui/app/lib/first-analysis"
import { ReadyCard } from "@insyte/ui/app/onboarding/admin-tail-steps"
import type { AnalysisSource } from "@insyte/ui/app/onboarding/analysis-step"
import { Cause, Exit, Option } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { useEffect } from "react"
import { AUTONOMY } from "../data/agent.ts"
import { FIRST_ANALYSIS, firstAnalysisAtom, firstAnalysisWrites } from "../data/first-analysis.ts"
import { LiveUpdates } from "../realtime/live-updates.tsx"

/*
 * The first analysis in the console's onboarding (step 8.5, M6.5, M15 step 5): `FirstAnalysis.get` as the design's
 * `AnalysisSource`. Each read ticks off as the server reads it (its frames, and a slow poll for a lost socket); the
 * step starts the reading when it opens on an analysis not yet begun. With the team's mail in Insyte and enough
 * history the server names one finding; without, the early read, and a store with enough history is told why there
 * is no finding. "Klaarzetten" makes the automation draft and the sheet on the server; the offline step's plan goes
 * into Zelfstandigheid. Read only on the analysis, offline and ready steps.
 */

const IDLE: Atom.Atom<AsyncResult.AsyncResult<FirstAnalysisView, unknown>> = Atom.make(AsyncResult.initial())

/** What the ready card says of a chosen item the server could not make yet. */
const WAITS_ON: Record<PreparedId, string> = {
  automation: "nog niet klaargezet",
  agent: "zodra de klantagent beschikbaar is",
  sheet: "nog niet klaargezet"
}

const sourceOf = (view: FirstAnalysisView | undefined): AnalysisSource => ({
  connected: true,
  failed: view?.state === "failed",
  store: { orders: view?.store.orders ?? 0, mails: view?.store.mails ?? 0, days: view?.store.days ?? 0 },
  history: view?.history ?? "young",
  readsMail: (view?.reads ?? []).some((r) => r.id === "mail"),
  reads: (view?.reads ?? []).map((r) => ({ label: r.label, done: r.done })),
  read: view?.state === "early" || view?.state === "found" || view?.state === "failed",
  ...(view?.state === "found" && view.finding !== null
    ? {
      finding: {
        headline: view.finding.headline,
        evidence: view.finding.evidence.map((e) => ({ figure: e.figure, says: e.says, basis: e.basis })),
        fix: { title: view.finding.fix.title, why: view.finding.fix.why },
        effect: { figure: view.finding.effect.figure, basis: view.finding.effect.basis }
      }
    }
    : {}),
  ...(view?.state === "early"
    ? {
      early: {
        predictions: view.predictions.map((p) => ({
          read: p.read,
          expect: p.expect,
          ...(p.prepares === undefined ? {} : { prepares: p.prepares })
        })),
        // `then` is the design's name for what a watch shows once it is in (`lib/first-analysis.ts`); a string, never awaited.
        // oxlint-disable-next-line unicorn/no-thenable
        watch: view.watch.map((w) => ({ label: w.label, then: w.reveals, have: w.have, need: w.need }))
      }
    }
    : {}),
  prepared: view?.prepared ?? {
    automation: { title: "", does: "" },
    agent: { title: "", does: "" },
    sheet: { title: "", does: "" }
  }
})

/** The analysis on the steps that show it; it starts the reading once, when the step opens on one not begun. */
export function useConsoleAnalysis(step: "analysis" | "offline" | "ready" | "other") {
  const result = useAtomValue(step === "other" ? IDLE : firstAnalysisAtom)
  const view = Option.getOrUndefined(AsyncResult.value(result))
  const start = useAtomSet(firstAnalysisWrites.start, { mode: "promiseExit" })
  const prepare = useAtomSet(firstAnalysisWrites.prepare, { mode: "promiseExit" })
  const agree = useAtomSet(firstAnalysisWrites.agreeOffline, { mode: "promiseExit" })
  useEffect(() => {
    if (step === "analysis" && view?.state === "none") {
      void start({ payload: undefined, reactivityKeys: FIRST_ANALYSIS })
    }
  }, [step, view?.state, start])
  return {
    view,
    source: sourceOf(view),
    /** Keeps the answers (the design's defaults where untouched) and the chosen items; throws a sentence. */
    prepare: async (ids: ReadonlyArray<PreparedId>, answers: Record<string, string>) => {
      const exit = await prepare({
        payload: {
          ids: [...ids],
          answers: {
            fulfilment: answers["fulfilment"] === "many" || answers["fulfilment"] === "self"
              ? answers["fulfilment"]
              : "one",
            reply: answers["reply"] === "auto" ? "auto" : "ask"
          }
        },
        reactivityKeys: FIRST_ANALYSIS
      })
      if (Exit.isFailure(exit)) throw new Error("Dit kon niet worden opgeslagen. Probeer het opnieuw.")
    },
    /**
     * "Afronden": the offline plan into Zelfstandigheid (Nooit stays as it is), made on the policy version the step
     * showed; throws a sentence. Without an analysis to keep it with (the store went, or the step has closed) the
     * plan is left out and the step goes on: the levels are set on Zelfstandigheid later.
     */
    agreeOffline: async (
      window: OfflineWindow,
      levels: Partial<Record<AgentActionId, AutonomyLevel>>,
      baseVersion: number
    ) => {
      const kept = Object.fromEntries(
        Object.entries(levels).flatMap(([id, level]) => (level === "auto" || level === "ask" ? [[id, level]] : []))
      )
      const exit = await agree({
        payload: { window, levels: kept, baseVersion },
        reactivityKeys: [...FIRST_ANALYSIS, ...AUTONOMY]
      })
      if (Exit.isSuccess(exit)) return
      const failure = Cause.findErrorOption(exit.cause)
      const tag = failure._tag === "Some" ? failure.value._tag : undefined
      if (tag === "AnalysisNotReady" || tag === "OfflineClosed") return
      throw new Error(
        tag === "AutonomyStale"
          ? "Iemand heeft Zelfstandigheid net aangepast. Probeer het opnieuw."
          : tag === "Forbidden"
          ? "Alleen wie Zelfstandigheid mag aanpassen kan dit plan opslaan."
          : "Dit kon niet worden opgeslagen. Probeer het opnieuw."
      )
    }
  }
}

/** The analysis step's live part: the frames that tick the reads, and a slow poll while it reads. */
export function AnalysisLive({ reading }: { reading: boolean }) {
  const refresh = useAtomRefresh(firstAnalysisAtom)
  useEffect(() => {
    if (!reading) return
    const timer = setInterval(refresh, 3000)
    return () => clearInterval(timer)
  }, [reading, refresh])
  return <LiveUpdates />
}

/** The ready step's card: the store's counts, what Insyte made, and what of the chosen still waits on its part. */
export function ConsoleReadyCard({ view }: { view: FirstAnalysisView | undefined }) {
  const chosen = view?.chosen?.ids ?? []
  const made = (id: PreparedId) =>
    id === "automation"
      ? (view?.made.automationId ?? null) !== null
      : id === "sheet"
      ? (view?.made.sheetId ?? null) !== null
      : false
  const line = (id: PreparedId) => {
    const title = view!.prepared[id].title
    if (!made(id)) return `${title}, ${WAITS_ON[id]}`
    return id === "automation" ? `${title} (concept)` : title
  }
  return (
    <ReadyCard
      connected={view !== undefined && view.state !== "none"}
      {...(chosen.some(made) ? {} : { preparedHeading: "Klaar om aan te zetten" })}
      prepared={chosen.map(line)}
      {...(view === undefined ? {} : { counts: view.store })}
    />
  )
}
