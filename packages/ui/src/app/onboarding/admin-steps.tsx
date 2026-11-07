import { motion, useReducedMotion } from "motion/react"
import { firstAnalysisSeed } from "../../data-source"
import { Check, Loader } from "../../icons"
import { ME } from "../automations/workflow-store"
import { useCountUp } from "../hooks/use-count-up"
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
    {
      id: "sync",
      title: "Alles wordt opgehaald.",
      subtitle: "De eerste gegevens staan er binnen een paar seconden. Daarna kun je doorgaan.",
      canContinue: true,
      primaryLabel: "Laat Insyte kijken",
      onPrimary: () => {
        persistStep("sync")
        next()
      },
      content: <SyncProgress connected={shopConnected} />
    },
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

/* ─── Sync progress — the first import, counted in ───────────────────────── */

const SYNC_ROWS = [
  { id: "products", label: "Producten", to: firstAnalysisSeed.store.products, delay: 0 },
  { id: "customers", label: "Klanten", to: firstAnalysisSeed.store.customers, delay: 250 },
  { id: "orders", label: "Bestellingen", to: firstAnalysisSeed.store.orders, delay: 500 }
] as const

function SyncProgress({ connected }: { connected: boolean }) {
  if (!connected) {
    return (
      <div className="rounded-xl bg-paper p-4 text-base text-ink-2 leading-normal">
        Nog geen winkel gekoppeld. Koppel Shopify wanneer je wilt via{" "}
        <span className="font-medium text-ink">Instellingen, Koppelingen</span>. De rest van de inrichting werkt gewoon.
      </div>
    )
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {SYNC_ROWS.map((r) => <SyncRow key={r.id} label={r.label} to={r.to} delay={r.delay} />)}
    </ul>
  )
}

function SyncRow({ label, to, delay }: { label: string; to: number; delay: number }) {
  const still = useReducedMotion()
  const n = useCountUp(to, still ? 0 : 1600, delay)
  const done = n === to
  return (
    <li className="relative flex h-11 items-center gap-3 overflow-hidden rounded-lg bg-paper px-3.5">
      <motion.span
        aria-hidden
        className="absolute inset-y-0 left-0 bg-arc-tint"
        initial={false}
        animate={{ width: `${(n / to) * 100}%`, opacity: done ? 0 : 1 }}
        transition={{ width: { duration: 0.1 }, opacity: { duration: 0.4 } }}
      />
      <span className="relative flex size-5 shrink-0 items-center justify-center">
        {done ?
          (
            <motion.span initial={still ? false : { scale: 0.4 }} animate={{ scale: 1 }}>
              <Check className="size-4 text-signal-green" strokeWidth={2.5} />
            </motion.span>
          ) :
          <Loader className="size-4 animate-spin text-arc-ink" strokeWidth={2} />}
      </span>
      <span className="relative flex-1 font-medium text-base text-ink">{label}</span>
      <span className="relative text-sm text-ink-2 tabular-nums">{n.toLocaleString("nl-NL")}</span>
    </li>
  )
}

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
