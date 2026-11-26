/**
 * A plan as onboarding's plan step shows it, from the host: what it includes and its price a month on each cycle,
 * written out ("€ 299"); `null` where the host has no price for that cycle. Apart from the step, so a host's logic can
 * build tiles without importing the screen.
 */
export interface PlanTile {
  readonly id: "starter" | "growth" | "scale"
  readonly name: string
  readonly hint: string
  readonly monthly: string | null
  readonly annual: string | null
}
