import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { type ReactNode, useState } from "react"
import { Check, Loader } from "../../icons"
import { Field } from "../common/form-dialog"
import { persistStep } from "../lib/onboarding-api"
import { cn } from "../lib/utils"
import { BrandLogo } from "../marketplace/brand-logos"
import type { StepDef } from "./onboarding-shell"
import { SelectionGroup, SelectionTile } from "./selection-tile"
import type { OnboardingData } from "./use-onboarding-state"

/*
 * The admin track's plan, store and ready steps, out of `admin-steps.tsx` (as `organization-step.tsx`) so a host can
 * mount them without the sync and analysis steps and the seed and stores they read when they load: the console in step 3, before
 * a store can be connected (M6). The steps are the reference's. Each takes an optional server call; with it, the host
 * moves the screen to where its server says the person is, since skipping the store skips the sync and analysis.
 */

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

export type PlanChoice = Plan["id"]
export type BillingChoice = "monthly" | "annual"

/** `onStart` starts the trial where the host has a server (the console: `Onboarding.advance`); it throws to refuse. */
export function planStep({ data, patch, next, onStart }: {
  data: OnboardingData
  patch: (p: OnboardingData) => void
  next: () => void
  onStart?: ((plan: PlanChoice, billing: BillingChoice) => Promise<void>) | undefined
}): StepDef {
  const d = data as Record<string, string | undefined>
  return {
    id: "plan",
    title: "Kies een abonnement om te proberen.",
    subtitle: "14 dagen gratis. Geen kaart nodig om te starten.",
    canContinue: true,
    primaryLabel: "Gratis proefperiode starten",
    busyLabel: "Proefperiode wordt gestart",
    onPrimary: async () => {
      if (onStart !== undefined) {
        await onStart((d.plan as PlanChoice) ?? "growth", (d.billing as BillingChoice) ?? "monthly")
        return
      }
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
  }
}

/**
 * `onSkip` leaves the store for later where the host has a server. `onConnect` is how that host connects one (the
 * console since M6.2: to Shopify's approval page, back to the next step); without it the field is shown but cannot
 * connect, and the step can only be skipped. The design app simulates the hand-off.
 */
export function storeStep({ data, patch, next, onSkip, onConnect }: {
  data: OnboardingData
  patch: (p: OnboardingData) => void
  next: () => void
  onSkip?: (() => Promise<void>) | undefined
  /** Sends the person to Shopify for `<handle>.myshopify.com`; resolves only if it could not (and said why). */
  onConnect?: ((domain: string) => Promise<void>) | undefined
}): StepDef {
  const shopConnected = data.shopConnected === true
  return {
    id: "store",
    title: "Koppel Shopify.",
    subtitle:
      "We halen bestellingen, producten, klanten en voorraad op. Je trekt de toegang altijd in via Shopify-beheer.",
    canContinue: true,
    primaryLabel: shopConnected ? "Doorgaan" : "Nu overslaan",
    busyLabel: "Bezig met opslaan",
    optional: !shopConnected,
    onPrimary: async () => {
      if (onSkip !== undefined) {
        await onSkip()
        return
      }
      persistStep("store", { storeSkipped: !shopConnected })
      next()
    },
    content: (
      <ShopifyConnect
        data={data as Record<string, string | boolean | undefined>}
        patch={patch}
        connectable={onSkip === undefined || onConnect !== undefined}
        onConnect={onConnect}
      />
    )
  }
}

/** `onReady` ends onboarding where the host has a server, and takes the person to Start. */
export function readyStep({ data, finish, onReady, content }: {
  data: OnboardingData
  finish: () => void
  onReady?: (() => Promise<void>) | undefined
  /** The card; by default one with nothing prepared and no counts. */
  content?: ReactNode
}): StepDef {
  return {
    id: "ready",
    title: "Je bent binnen.",
    subtitle: "Insyte importeert op de achtergrond verder. Je dashboard staat klaar.",
    primaryLabel: "Dashboard openen",
    busyLabel: "Dashboard wordt geopend",
    canContinue: true,
    onPrimary: async () => {
      if (onReady !== undefined) {
        await onReady()
        return
      }
      persistStep("ready")
      finish()
    },
    content: content ?? <ReadyCard connected={data.shopConnected === true} prepared={[]} />
  }
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
  patch,
  connectable,
  onConnect
}: {
  data: Record<string, string | boolean | undefined>
  patch: (p: OnboardingData) => void
  /** `false` where the host cannot connect a store yet: the step can only be skipped. */
  connectable: boolean
  /** The host's real hand-off; without it the steps are simulated. */
  onConnect?: ((domain: string) => Promise<void>) | undefined
}) {
  const still = useReducedMotion()
  const domain = normalizeShop(data.shopDomain as string)
  const [phase, setPhase] = useState<Phase>(data.shopConnected ? "connected" : "idle")

  async function connect() {
    if (!domain) return
    setPhase("opening")
    if (onConnect !== undefined) {
      // The browser leaves for Shopify; it comes back here only if the host could not send it (and said why).
      await onConnect(domain)
      setPhase("idle")
      return
    }
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
            disabled={working || !connectable}
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
        disabled={!connectable || !domain || working}
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
        {connectable ?
          "Shopify vraagt je Insyte goed te keuren en stuurt je daarna direct terug. Of sla het over en koppel later via de instellingen." :
          "Koppelen met Shopify kan nog niet. Sla het nu over: het staat daarna als eerste stap op Start."}
      </p>
    </div>
  )
}

/* ─── Ready state — final confirmation surface ───────────────────────────── */

/**
 * The ready step's card, from what the host knows: whether a store is connected, what Insyte prepared, and the first
 * import's counts. The reference's admin track reads these from its stores (`admin-steps.tsx`); the console has neither
 * a store nor anything prepared yet.
 */
export function ReadyCard({ connected, prepared, preparedHeading = "Klaargezet door Insyte", counts }: {
  connected: boolean
  prepared: ReadonlyArray<string>
  /** What the list is: made by Insyte (the reference), or waiting to be made (the console until those parts exist). */
  preparedHeading?: string
  counts?: { readonly products: number; readonly orders: number; readonly customers: number } | undefined
}) {
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
      {connected && counts !== undefined ?
        (
          <p className="text-sm text-ink-2 tabular-nums">
            {counts.products.toLocaleString("nl-NL")} producten · {counts.orders.toLocaleString("nl-NL")} bestellingen ·
            {" "}
            {counts.customers.toLocaleString("nl-NL")} klanten
          </p>
        ) :
        null}
      {prepared.length > 0 ?
        (
          <div className="flex flex-col gap-1">
            <span className="font-medium text-sm text-ink">{preparedHeading}</span>
            <ul className="flex flex-col gap-0.5 text-sm text-ink-2">
              {prepared.map((x) => <li key={x}>{x}</li>)}
            </ul>
          </div>
        ) :
        null}
    </div>
  )
}
