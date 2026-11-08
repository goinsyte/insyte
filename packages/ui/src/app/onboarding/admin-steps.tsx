import { firstAnalysisSeed } from "../../data-source"
import { ME } from "../automations/workflow-store"
import { persistStep } from "../lib/onboarding-api"
import { useFirstAnalysis } from "../stores/first-analysis-store"
import { planStep, ReadyCard, readyStep, storeStep } from "./admin-tail-steps"
import {
  analysisCopy,
  analysisMode,
  AnalysisStep,
  defaultPrepared,
  OfflineStep,
  preparedTitles,
  proposedLevels
} from "./first-analysis-steps"
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
    {
      id: "analysis",
      ...analysisCopy(shopConnected, data.analysisRead === true),
      busyLabel: "Wordt klaargezet",
      canContinue: true,
      // While Insyte reads there is nothing to decide yet, so there is nothing to press.
      hidePrimary: data.analysisRead !== true && analysisMode(shopConnected) !== "none",
      primaryLabel: ((data.prepared as string[] | undefined) ?? defaultPrepared(shopConnected)).length > 0
        ? "Klaarzetten"
        : "Doorgaan zonder",
      onPrimary: () => {
        const ids = (data.prepared as ReturnType<typeof defaultPrepared> | undefined) ?? defaultPrepared(shopConnected)
        const answers = (data.answers as Record<string, string> | undefined) ?? {}
        const fa = useFirstAnalysis.getState()
        for (const [k, v] of Object.entries(answers)) fa.answer(k, v)
        fa.prepare(ids, preparedTitles(), ME)
        persistStep("analysis", { prepared: ids, answers })
        next()
      },
      content: <AnalysisStep connected={shopConnected} data={data} patch={patch} />
    },
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

/* ─── Sync progress — the seed's counts, counted up (`sync-progress.tsx`) ── */

const SYNC_ROWS = [
  { id: "products", label: "Producten", to: firstAnalysisSeed.store.products, delay: 0 },
  { id: "customers", label: "Klanten", to: firstAnalysisSeed.store.customers, delay: 250 },
  { id: "orders", label: "Bestellingen", to: firstAnalysisSeed.store.orders, delay: 500 }
] as const

/* ─── Ready state — the reference's card, from its stores ────────────────── */

function ReadyState({ connected }: { connected: boolean }) {
  const made = useFirstAnalysis((s) => s.made)
  const titles = preparedTitles()
  const list = [
    made.automationId ? `${titles.automation} (concept)` : null,
    made.agent ? `${titles.agent} (eerst vragen)` : null,
    made.sheetId ? titles.sheet : null
  ].filter((x): x is string => x !== null)
  return <ReadyCard connected={connected} prepared={list} counts={firstAnalysisSeed.store} />
}
