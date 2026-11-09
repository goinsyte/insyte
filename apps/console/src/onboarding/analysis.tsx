import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import type { FirstAnalysisView } from "@insyte/modules/first-analysis/domain/FirstAnalysis"
import type { PreparedId } from "@insyte/ui/app/lib/first-analysis"
import { ReadyCard } from "@insyte/ui/app/onboarding/admin-tail-steps"
import type { AnalysisSource } from "@insyte/ui/app/onboarding/analysis-step"
import { Exit, Option } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { useEffect } from "react"
import { FIRST_ANALYSIS, firstAnalysisAtom, firstAnalysisWrites } from "../data/first-analysis.ts"
import { LiveUpdates } from "../realtime/live-updates.tsx"

/*
 * The first analysis in the console's onboarding (step 8.5, M6.5): `FirstAnalysis.get` as the design's
 * `AnalysisSource`. Each read ticks off as the server reads it (its frames, and a slow poll for a lost socket); the
 * step starts the reading when it opens on an analysis not yet begun. The mail is not read until M15, so the reads
 * leave it out and a store with enough history is told why there is no finding. Read only on the analysis and ready
 * steps.
 */

const IDLE: Atom.Atom<AsyncResult.AsyncResult<FirstAnalysisView, unknown>> = Atom.make(AsyncResult.initial())

/** The chosen items' titles for the ready card, each waiting on the part of Insyte that will make it. */
const WAITS_ON: Record<PreparedId, string> = {
  automation: "zodra Automatiseringen beschikbaar zijn",
  agent: "zodra de klantagent beschikbaar is",
  sheet: "zodra Rekenbladen beschikbaar zijn"
}

const sourceOf = (view: FirstAnalysisView | undefined): AnalysisSource => ({
  connected: true,
  failed: view?.state === "failed",
  store: { orders: view?.store.orders ?? 0, mails: 0, days: view?.store.days ?? 0 },
  history: view?.history ?? "young",
  readsMail: false,
  reads: (view?.reads ?? []).map((r) => ({ label: r.label, done: r.done })),
  read: view?.state === "early" || view?.state === "failed",
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
export function useConsoleAnalysis(step: "analysis" | "ready" | "other") {
  const result = useAtomValue(step === "other" ? IDLE : firstAnalysisAtom)
  const view = Option.getOrUndefined(AsyncResult.value(result))
  const start = useAtomSet(firstAnalysisWrites.start, { mode: "promiseExit" })
  const prepare = useAtomSet(firstAnalysisWrites.prepare, { mode: "promiseExit" })
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

/** The ready step's card: the store's counts, and what the operator chose to have ready, each waiting on its part. */
export function ConsoleReadyCard({ view }: { view: FirstAnalysisView | undefined }) {
  const chosen = view?.chosen?.ids ?? []
  return (
    <ReadyCard
      connected={view !== undefined && view.state !== "none"}
      preparedHeading="Klaar om aan te zetten"
      prepared={chosen.map((id) => `${view!.prepared[id].title}, ${WAITS_ON[id]}`)}
      {...(view === undefined ? {} : { counts: view.store })}
    />
  )
}
