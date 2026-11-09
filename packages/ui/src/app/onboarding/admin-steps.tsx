import { firstAnalysisSeed } from "../../data-source"
import { ME } from "../automations/workflow-store"
import { persistStep } from "../lib/onboarding-api"
import { useFirstAnalysis } from "../stores/first-analysis-store"
import { planStep, ReadyCard, readyStep, storeStep } from "./admin-tail-steps"
import { type AnalysisSource, analysisStep, preparedTitles } from "./analysis-step"
import { OfflineStep, proposedLevels } from "./first-analysis-steps"
import type { StepDef } from "./onboarding-shell"
import { organizationStep } from "./organization-step"
import { syncStep } from "./sync-progress"
import type { OnboardingData } from "./use-onboarding-state"

/* Downstream admin steps (everything after the shared account / verify /
   role-pick at the head of the flow). The user lands here once they've
   chosen "Set up my store" on the role picker. */
export function adminSteps(
  data: OnboardingData,
  patch: (p: OnboardingData) => void,
  next: () => void,
  finish: () => void
): StepDef[] {
  const shopConnected = data.shopConnected === true

  return [
    organizationStep({ data, patch, next }),
    planStep({ data, patch, next }),
    storeStep({ data, patch, next }),
    syncStep({
      connected: shopConnected,
      rows: SYNC_ROWS,
      canContinue: true,
      onPrimary: () => {
        persistStep("sync")
        next()
      }
    }),
    analysisStep({
      source: demoAnalysis(shopConnected),
      data,
      patch,
      onPrimary: (ids, answers) => {
        const fa = useFirstAnalysis.getState()
        for (const [k, v] of Object.entries(answers)) fa.answer(k, v)
        fa.prepare(ids, preparedTitles(demoAnalysis(shopConnected)), ME)
        persistStep("analysis", { prepared: ids, answers })
        next()
      }
    }),
    {
      id: "offline",
      title: "Terwijl je offline bent.",
      subtitle:
        "Wat Insyte doet als niemand online is. Jij zet de grens, per soort werk, en past hem later aan onder Zelfstandigheid.",
      canContinue: true,
      primaryLabel: "Afronden",
      busyLabel: "Bezig met opslaan",
      onPrimary: () => {
        const levels = (data.offlineLevels as ReturnType<typeof proposedLevels> | undefined) ??
          proposedLevels((data.answers as Record<string, string> | undefined) ?? {})
        const window = (data.offlineWindow as "evening" | "late" | "shifts" | undefined) ?? "evening"
        useFirstAnalysis.getState().agreeOffline(window, levels, ME)
        persistStep("offline", { window, levels })
        next()
      },
      content: <OfflineStep data={data} patch={patch} />
    },
    readyStep({ data, finish, content: <ReadyState connected={shopConnected} /> })
  ]
}

/* ─── The first analysis — the seed, read at the reference's pace (`analysis-step.tsx`) ── */

const demoAnalysis = (connected: boolean): AnalysisSource => ({
  connected,
  store: firstAnalysisSeed.store,
  readsMail: true,
  reads: firstAnalysisSeed.reads.map((label) => ({ label })),
  ...(firstAnalysisSeed.finding === undefined ? {} : { finding: firstAnalysisSeed.finding }),
  ...(firstAnalysisSeed.early === undefined ? {} : { early: firstAnalysisSeed.early }),
  prepared: firstAnalysisSeed.prepared
})

/* ─── Sync progress — the seed's counts, counted up (`sync-progress.tsx`) ── */

const SYNC_ROWS = [
  { id: "products", label: "Producten", to: firstAnalysisSeed.store.products, delay: 0 },
  { id: "customers", label: "Klanten", to: firstAnalysisSeed.store.customers, delay: 250 },
  { id: "orders", label: "Bestellingen", to: firstAnalysisSeed.store.orders, delay: 500 }
] as const

/* ─── Ready state — the reference's card, from its stores ────────────────── */

function ReadyState({ connected }: { connected: boolean }) {
  const made = useFirstAnalysis((s) => s.made)
  const titles = preparedTitles(demoAnalysis(connected))
  const list = [
    made.automationId ? `${titles.automation} (concept)` : null,
    made.agent ? `${titles.agent} (eerst vragen)` : null,
    made.sheetId ? titles.sheet : null
  ].filter((x): x is string => x !== null)
  return <ReadyCard connected={connected} prepared={list} counts={firstAnalysisSeed.store} />
}
