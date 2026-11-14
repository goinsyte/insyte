import { createContext, type ReactNode, useContext } from "react"

/**
 * What Instellingen → Facturatie reads and does, from whoever hosts it (as `security-source.tsx` is for Beveiliging):
 * the design app from its settings and team stores, with Ongedaan maken; the console from `Billing.*` (M13 step 1), where
 * a change is money at Stripe, so it is previewed and confirmed and has no undo. The markup is the design's; the host
 * says every sentence that depends on what is true (the price, the renewal, what a change costs).
 */

export type PlanTier = "starter" | "growth" | "scale"
export type BillingCycle = "monthly" | "annual"
export type Tone = "success" | "warning" | "danger" | "info" | "neutral"

/** What a plan includes, and its price per month on a cycle as the page writes it ("€ 299"); `null` where it has none. */
export interface TierOffer {
  seats: number
  stores: number
  replies: number
  price: (cycle: BillingCycle) => string | null
}

/** One invoice as the table shows it. */
export interface InvoiceRow {
  id: string
  number: string
  date: string
  amount: string
  status: { tone: Tone; label: string }
}

/** What a change asks for: another plan or cycle, or seats bought (`delta > 0`) or given up. */
export type BillingAsk = { kind: "plan"; tier: PlanTier; cycle: BillingCycle } | { kind: "seats"; delta: number }

export type CancelReason = "too_expensive" | "missing_feature" | "closing_store" | "switched_tool" | "other"

export interface BillingSource {
  /** The plan the workspace is on or chose; `null` before one is picked. */
  plan: PlanTier | null
  cycle: BillingCycle
  /** The plan card's head: its name, its pill, and the line under it (price, seats, stores, renewal). */
  name: string
  pill: { tone: Tone; label: string }
  line: string
  /** Opgezegd, until the period ends: the card offers Hervatten. */
  cancelling: boolean
  /** Whether there is anything to cancel (not on a trial). */
  cancellable: boolean
  /** When the paid period ends, as the cancel dialog says it. */
  periodEnd: string
  /** What happens after it ends. */
  afterEnd: string
  tiers: Record<PlanTier, TierOffer>
  /** How a change is charged, as the plan dialog and the guide say it. */
  changeNote: string
  usage: ReadonlyArray<{ label: string; value: number; max: number }>
  seats: { included: number; extra: number; free: number; full: boolean }
  card: { brand: string; last4: string; expiry: string } | null
  invoices: ReadonlyArray<InvoiceRow>
  /** The next page of invoices, where there is one. */
  moreInvoices?: () => void
  /**
   * What a change costs before it is made, as a sentence, or `null` where it cannot be said (already told why). Absent:
   * the host changes at once and offers Ongedaan maken instead (the design app).
   */
  quote?: (ask: BillingAsk) => Promise<string | null>
  /** Makes the change; answers whether it took (and has said so). */
  change: (ask: BillingAsk) => Promise<boolean>
  cancel: (reason: CancelReason, note: string) => Promise<boolean>
  resume: () => Promise<boolean>
  /** The card is changed on the host's own page (Stripe's Customer Portal); absent, on the design's card form. */
  openCardPage?: () => void
  /** The design's card form, saved (the demo keeps the last four digits). */
  saveCard?: (card: { brand: string; last4: string; expiry: string }) => void
  openInvoice: (row: InvoiceRow) => void
}

const BillingContext = createContext<BillingSource | null>(null)

export function BillingSourceProvider({ value, children }: { value: BillingSource; children: ReactNode }) {
  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>
}

export function useBillingSource(): BillingSource {
  const source = useContext(BillingContext)
  if (source === null) throw new Error("useBillingSource outside a BillingSourceProvider")
  return source
}
