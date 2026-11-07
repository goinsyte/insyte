import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useState } from "react"
import { firstAnalysisSeed } from "../../data-source"
import { Check, Loader } from "../../icons"
import { ME } from "../automations/workflow-store"
import { Field, SelectField, TextField } from "../common/form-dialog"
import { useCountUp } from "../hooks/use-count-up"
import { authClient } from "../lib/auth-client"
import { persistStep } from "../lib/onboarding-api"
import { cn } from "../lib/utils"
import { BrandLogo } from "../marketplace/brand-logos"
import { useFirstAnalysis } from "../stores/first-analysis-store"
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
import { SelectionGroup, SelectionTile } from "./selection-tile"
import type { OnboardingData } from "./use-onboarding-state"

/** Normalize user input to a valid `<handle>.myshopify.com`, or null. */
function normalizeShop(input?: string): string | null {
  const host = (input ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
  if (!host) return null
  const handle = host.replace(/\.myshopify\.com$/, "")
  if (!/^[a-z0-9][a-z0-9-]*$/.test(handle)) return null
  return `${handle}.myshopify.com`
}

const COUNTRIES = [
  "Nederland",
  "Verenigde Staten",
  "Verenigd Koninkrijk",
  "Duitsland",
  "Frankrijk",
  "Italië",
  "Spanje"
] as const

const TEAM_SIZES = [
  { id: "solo", label: "Alleen ik", hint: "Solo-ondernemer" },
  { id: "small", label: "2 tot 5", hint: "Klein team" },
  { id: "mid", label: "6 tot 20", hint: "Groeiend team" },
  { id: "large", label: "Meer dan 20", hint: "Meerdere winkels" }
] as const

type Plan = {
  id: "starter" | "growth" | "scale"
  name: string
  priceMonthly: number
  priceAnnual: number
  tagline: string
}

const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    priceMonthly: 99,
    priceAnnual: 89,
    tagline: "Solo-oprichters, 1 winkel, 3 gebruikers."
  },
  {
    id: "growth",
    name: "Growth",
    priceMonthly: 249,
    priceAnnual: 219,
    tagline: "3 winkels, 10 gebruikers, Klarna- en PayPal-geschillen."
  },
  {
    id: "scale",
    name: "Scale",
    priceMonthly: 499,
    priceAnnual: 449,
    tagline: "Meer dan 1.000 bestellingen per week, onbeperkt winkels en gebruikers."
  }
]

/* Downstream admin steps (everything after the shared account / verify /
   role-pick at the head of the flow). The user lands here once they've
   chosen "Set up my store" on the role picker. */
export function adminSteps(
  data: OnboardingData,
  patch: (p: OnboardingData) => void,
  next: () => void,
  finish: () => void
): StepDef[] {
  const d = data as Record<string, string | undefined>
  const shopConnected = data.shopConnected === true

  return [
    {
      id: "organization",
      title: "Geef je werkruimte een naam.",
      busyLabel: "Werkruimte wordt aangemaakt",
      subtitle: "Naam, huisstijl en land kun je altijd wijzigen in de instellingen.",
      canContinue: true,
      onPrimary: async () => {
        const { data: org, error } = await authClient.organization.create({
          name: d.orgName ?? "",
          slug: d.slug ?? ""
        })
        if (error) {
          // Thrown → the shell shows it inline beneath the fields.
          throw new Error(error.message ?? "Je werkruimte kon niet worden aangemaakt.")
        }
        patch({ organizationId: org?.id })
        persistStep("organization", {
          organizationId: org?.id,
          country: d.country,
          teamSize: d.teamSize
        })
        next()
      },
      content: (
        <>
          <Field label="Naam werkruimte">
            <TextField
              value={(d.orgName as string) ?? ""}
              onChange={(v) => {
                patch({
                  orgName: v,
                  slug: v
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/(^-|-$)/g, "")
                })
              }}
              placeholder="Allure Co."
            />
          </Field>
          <Field label="URL werkruimte">
            <div className="field flex h-11 items-center overflow-hidden rounded-lg focus-within:outline-2 focus-within:outline-arc">
              <span className="pl-3.5 text-base text-ink-3">
                goinsyte.com/
              </span>
              <input
                value={(d.slug as string) ?? ""}
                onChange={(e) => patch({ slug: e.target.value })}
                className="h-full min-w-0 flex-1 bg-transparent pr-3.5 text-base text-ink outline-none placeholder:text-ink-3"
                placeholder="allure"
              />
            </div>
          </Field>
          <Field label="Land">
            <SelectField
              value={(d.country as (typeof COUNTRIES)[number]) ?? "Nederland"}
              onChange={(v) => patch({ country: v })}
              options={COUNTRIES}
            />
          </Field>
          <Field label="Teamgrootte">
            <SelectionGroup
              mode="single"
              value={(d.teamSize as string) ?? "solo"}
              onChange={(v) => patch({ teamSize: v as string })}
              columns={2}
              label="Teamgrootte"
            >
              {TEAM_SIZES.map((t) => (
                <SelectionTile
                  key={t.id}
                  id={t.id}
                  label={t.label}
                  hint={t.hint}
                />
              ))}
            </SelectionGroup>
          </Field>
        </>
      )
    },
    {
      id: "plan",
      title: "Kies een abonnement om te proberen.",
      subtitle: "14 dagen gratis. Geen kaart nodig om te starten.",
      canContinue: true,
      primaryLabel: "Gratis proefperiode starten",
      busyLabel: "Proefperiode wordt gestart",
      onPrimary: () => {
        persistStep("plan", { plan: d.plan, billing: d.billing })
        next()
      },
      content: (
        <PlanPicker
          value={(d.plan as Plan["id"]) ?? "growth"}
          billing={(d.billing as "monthly" | "annual") ?? "monthly"}
          onPlan={(p) => patch({ plan: p })}
          onBilling={(b) => patch({ billing: b })}
        />
      )
    },
    {
      id: "store",
      title: "Koppel Shopify.",
      subtitle:
        "We halen bestellingen, producten, klanten en voorraad op. Je trekt de toegang altijd in via Shopify-beheer.",
      canContinue: true,
      primaryLabel: shopConnected ? "Doorgaan" : "Nu overslaan",
      busyLabel: "Bezig met opslaan",
      optional: !shopConnected,
      onPrimary: () => {
        persistStep("store", { storeSkipped: !shopConnected })
        next()
      },
      content: <ShopifyConnect data={data as Record<string, string | boolean | undefined>} patch={patch} />
    },
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
    {
      id: "ready",
      title: "Je bent binnen.",
      subtitle: "Insyte importeert op de achtergrond verder. Je dashboard staat klaar.",
      primaryLabel: "Dashboard openen",
      busyLabel: "Dashboard wordt geopend",
      canContinue: true,
      onPrimary: () => {
        persistStep("ready")
        finish()
      },
      content: <ReadyState connected={shopConnected} />
    }
  ]
}

/* ─── Plan picker — SelectionGroup with right-aligned price + billing toggle ── */

function PlanPicker({
  value,
  billing,
  onPlan,
  onBilling
}: {
  value: Plan["id"]
  billing: "monthly" | "annual"
  onPlan: (p: Plan["id"]) => void
  onBilling: (b: "monthly" | "annual") => void
}) {
  return (
    <>
      <div className="flex w-fit items-center rounded-lg bg-ink/6 p-0.5 text-sm">
        <button
          type="button"
          onClick={() => onBilling("monthly")}
          className={cn(
            "flex h-7 items-center rounded-md px-3 font-medium transition-colors",
            billing === "monthly"
              ? "bg-paper text-ink"
              : "text-ink-3 hover:text-ink"
          )}
        >
          Maandelijks
        </button>
        <button
          type="button"
          onClick={() => onBilling("annual")}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-md px-3 font-medium transition-colors",
            billing === "annual"
              ? "bg-paper text-ink"
              : "text-ink-3 hover:text-ink"
          )}
        >
          Jaarlijks
          <span className="tabular-nums text-[10.5px] text-signal-green">
            −10%
          </span>
        </button>
      </div>

      <SelectionGroup
        mode="single"
        value={value}
        onChange={(v) => onPlan(v as Plan["id"])}
        columns={1}
        label="Abonnement"
      >
        {PLANS.map((p) => {
          const price = billing === "annual" ? p.priceAnnual : p.priceMonthly
          return (
            <SelectionTile
              key={p.id}
              id={p.id}
              label={p.name}
              hint={p.tagline}
              meta={
                <span className="flex items-baseline gap-0.5 font-medium tabular-nums text-[15px] text-ink tabular-nums">
                  ${price}
                  <span className="text-[11px] text-ink-3">/mnd</span>
                </span>
              }
            />
          )
        })}
      </SelectionGroup>
    </>
  )
}

/* ─── Shopify connect — simulated hand-off, the steps the real one has ──── */

type Phase = "idle" | "opening" | "approving" | "connected"

function ShopifyConnect({
  data,
  patch
}: {
  data: Record<string, string | boolean | undefined>
  patch: (p: OnboardingData) => void
}) {
  const still = useReducedMotion()
  const domain = normalizeShop(data.shopDomain as string)
  const [phase, setPhase] = useState<Phase>(data.shopConnected ? "connected" : "idle")

  async function connect() {
    if (!domain) return
    setPhase("opening")
    await new Promise((r) => setTimeout(r, 700))
    setPhase("approving")
    await new Promise((r) => setTimeout(r, 900))
    setPhase("connected")
    patch({ shopDomain: domain, shopConnected: true })
  }

  if (phase === "connected") {
    return (
      <motion.div
        initial={still ? false : { opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="flex items-center gap-3 rounded-xl bg-paper p-3"
      >
        <BrandLogo brand="shopify" name="Shopify" size={36} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium text-base text-ink">{domain ?? (data.shopDomain as string)}</span>
          <span className="text-sm text-ink-2">
            Goedgekeurd. Bestellingen, producten en klanten worden nu gesynchroniseerd.
          </span>
        </div>
        <span className="flex size-6 items-center justify-center rounded-full bg-signal-green text-mesh-ink">
          <Check className="size-3.5" strokeWidth={2.5} />
        </span>
      </motion.div>
    )
  }

  const working = phase !== "idle"
  return (
    <div className="flex flex-col gap-3">
      <Field label="Je Shopify-winkel">
        <div className="field flex h-11 items-center overflow-hidden rounded-lg focus-within:outline-2 focus-within:outline-arc">
          <input
            value={((data.shopDomain as string) ?? "").replace(/\.myshopify\.com$/, "")}
            onChange={(e) => patch({ shopDomain: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") void connect()
            }}
            disabled={working}
            spellCheck={false}
            autoCapitalize="off"
            placeholder="je-winkel"
            className="h-full min-w-0 flex-1 bg-transparent pl-3.5 text-base text-ink outline-none placeholder:text-ink-3"
          />
          <span className="pr-3.5 text-base text-ink-3">.myshopify.com</span>
        </div>
      </Field>
      <button
        type="button"
        disabled={!domain || working}
        onClick={() => void connect()}
        className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-paper px-4 font-medium text-base text-ink transition-colors hover:bg-ink/4 disabled:cursor-not-allowed disabled:text-ink-3"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={phase}
            className="flex items-center gap-2"
            initial={still ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
          >
            {working ?
              <Loader className="size-4 animate-spin text-arc-ink" strokeWidth={2} /> :
              <BrandLogo brand="shopify" name="Shopify" size={20} />}
            {phase === "opening"
              ? "Shopify wordt geopend"
              : phase === "approving"
              ? "Wacht op je goedkeuring"
              : "Koppelen met Shopify"}
          </motion.span>
        </AnimatePresence>
      </button>
      <p className="text-sm text-ink-2 leading-normal">
        Shopify vraagt je Insyte goed te keuren en stuurt je daarna direct terug. Of sla het over en koppel later via de
        instellingen.
      </p>
    </div>
  )
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

/* ─── Ready state — final confirmation surface ───────────────────────────── */

function ReadyState({ connected }: { connected: boolean }) {
  const made = useFirstAnalysis((s) => s.made)
  const titles = preparedTitles()
  const list = [
    made.automationId ? `${titles.automation} (concept)` : null,
    made.agent ? `${titles.agent} (eerst vragen)` : null,
    made.sheetId ? titles.sheet : null
  ].filter(Boolean)
  const { products, orders, customers } = firstAnalysisSeed.store
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-paper p-4">
      <span className="flex items-center gap-2 font-medium text-sm text-ink">
        <Check className="size-4 text-signal-green" strokeWidth={2.5} />
        Werkruimte klaar
      </span>
      <p className="text-base text-ink leading-normal">
        {connected
          ? "Je winkel is gekoppeld en de eerste import is binnen. Vanaf hier vult de wachtrij zich."
          : "Je werkruimte staat klaar. Koppel een winkel wanneer je wilt om te beginnen met importeren."}
      </p>
      {connected ?
        (
          <p className="text-sm text-ink-2 tabular-nums">
            {products.toLocaleString("nl-NL")} producten · {orders.toLocaleString("nl-NL")} bestellingen ·{" "}
            {customers.toLocaleString("nl-NL")} klanten
          </p>
        ) :
        null}
      {list.length > 0 ?
        (
          <div className="flex flex-col gap-1">
            <span className="font-medium text-sm text-ink">Klaargezet door Insyte</span>
            <ul className="flex flex-col gap-0.5 text-sm text-ink-2">
              {list.map((x) => <li key={x}>{x}</li>)}
            </ul>
          </div>
        ) :
        null}
    </div>
  )
}
