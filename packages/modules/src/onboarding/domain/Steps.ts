import { Schema } from "effect"

/*
 * The onboarding tracks and their steps (M4.1), in the order the console shows them: the UI's step lists are the truth
 * (M4, decisions). Every track opens with the same three, `account`, `verify` and `role`; the role decides the rest.
 * `next` is a pure function of the step and the facts, so the order is tested without a database.
 */

export const Track = Schema.Literals(["admin", "supplier", "affiliate"])
export type Track = typeof Track.Type

const HEAD = ["account", "verify", "role"] as const

export const STEPS = {
  admin: [...HEAD, "organization", "plan", "store", "sync", "analysis", "offline", "ready"],
  supplier: [...HEAD, "profile", "api", "stock", "ready"],
  affiliate: [...HEAD, "profile", "review"]
} as const

export const Step = Schema.Literals([
  ...HEAD,
  "organization",
  "plan",
  "store",
  "sync",
  "analysis",
  "offline",
  "ready",
  "profile",
  "api",
  "stock",
  "review"
])
export type Step = typeof Step.Type

/** What the machine needs to know about the person and their workspace to decide the next step. */
export interface Facts {
  readonly emailVerified: boolean
  readonly hasWorkspace: boolean
  readonly storeConnected: boolean
  readonly backfillDone: boolean
}

/** The step after `step` on `track`, given the facts; a step that cannot be passed yet answers itself. */
export const next = (track: Track, step: Step, facts: Facts): Step => {
  if (step === "account") return facts.emailVerified ? "role" : "verify"
  if (step === "verify") return facts.emailVerified ? "role" : "verify"
  if (track === "admin") {
    switch (step) {
      case "role":
        return "organization"
      case "organization":
        return facts.hasWorkspace ? "plan" : "organization"
      case "plan":
        return "store"
      case "store":
        // Skipping the store ("Nu overslaan") leaves it for the Start checklist and goes straight to ready.
        return facts.storeConnected ? "sync" : "ready"
      case "sync":
        // The first analysis (M6.5) and the offline plan (M15) are not built yet: an imported store goes to ready.
        return facts.backfillDone ? "ready" : "sync"
      case "analysis":
        return "offline"
      default:
        return "ready"
    }
  }
  const steps: ReadonlyArray<Step> = STEPS[track]
  const at = steps.indexOf(step)
  return at === -1 ? step : steps[Math.min(at + 1, steps.length - 1)]!
}

/** Where `step` sits on `track` (the console's step index) and how many steps the track has. */
export const positionOf = (track: Track, step: Step): { readonly index: number; readonly total: number } => {
  const steps: ReadonlyArray<Step> = STEPS[track]
  return { index: Math.max(0, steps.indexOf(step)), total: steps.length }
}
