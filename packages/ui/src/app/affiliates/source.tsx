import { createContext, type ReactNode, useContext } from "react"
import type { PortalResource, Tier, TierView } from "../affiliate/source"

/**
 * What the brand's affiliates page reads and does, from whoever hosts it (as `suppliers/source.tsx` is for its
 * suppliers): the design app from its demo store (`demo-source.tsx`), the console from `Affiliates.*` (M16 steps 3–5).
 * The markup is the design's. Amounts are whole units of the programme's currency, formatted by the host's `money`.
 */

export type { PortalResource, Tier, TierView }

/** The programme's material, as the brand keeps it for its affiliates (the portal's Materiaal). */
export type ResourcesSource = {
  useList: () => ReadonlyArray<PortalResource>
  /** Uploading and removing are Affiliates · Bewerken. */
  canEdit: boolean
  upload: (file: File, said: Said) => void
  remove: (r: PortalResource, said: Said) => void
  open: (r: PortalResource) => void
}

/** An affiliate as the list shows it. `discount` is where its code stands at Shopify, where the host knows it. */
export type ProgramAffiliateRow = {
  id: string
  name: string
  email: string
  code: string
  tier: Tier
  rate: number
  joinedAt: number
  conversions: number
  earned: number
  paused?: boolean | undefined
  discount?: { state: "pending" | "made" | "failed" | "off"; error: string | null } | undefined
}

export type ApplicationRow = {
  id: string
  name: string
  email: string
  channel: string
  audience: string
  motivation: string
  /** Their main channel's address, where they gave one. */
  url?: string | undefined
  appliedAt: number
  status: "pending" | "approved" | "rejected"
  reason?: string | undefined
  decidedAt?: number | undefined
}

/** A payout line of the month: `approvedAt` once approved, `paidAt` once marked paid. */
export type PayoutRow = {
  affiliateId: string
  name: string
  method: string
  orders: number
  approvable: number
  inWindow: number
  reversed: number
  approvedAt?: number | undefined
  paidAt?: number | undefined
}

export type PayoutsMonth = {
  /** "Mei 2026". */
  label: string
  payDay: number
  /** The month still runs: nothing is approved before it is closed ("loopt nog"). */
  running: boolean
  lines: Array<PayoutRow>
}

export type InviteRow = {
  id: string
  name: string
  email: string
  tier: Tier
  message?: string | undefined
  sentAt: number
  expiresAt: number
}

export type Said = { message: string; description?: string | undefined }

export interface AffiliatesSource {
  money: (amount: number) => string
  tiers: ReadonlyArray<TierView>
  rejectReasons: ReadonlyArray<string>
  returnDays: number
  useAffiliates: () => Array<ProgramAffiliateRow>
  useApplications: () => ReadonlyArray<ApplicationRow>
  usePayouts: () => PayoutsMonth
  useInvites: () => ReadonlyArray<InviteRow>
  /** "Deze maand" in an affiliate's dialog, where the host has it. */
  useThisMonth: (affiliateId: string) => number | undefined
  /** The code an approval gives, proposed by the host (unique in the programme). */
  useProposedCode: (app: ApplicationRow | null) => string
  /** Approving and marking paid are the programme's managers' (Affiliates · Beheren). */
  canManagePayouts: boolean
  approve: (app: ApplicationRow, tier: Tier, code: string, said: Said) => void
  reject: (app: ApplicationRow, reason: string, said: Said) => void
  setTier: (a: ProgramAffiliateRow, tier: Tier, said: Said) => void
  setPaused: (rows: ReadonlyArray<ProgramAffiliateRow>, said: Said) => void
  retryDiscount: ((a: ProgramAffiliateRow) => void) | null
  approvePayouts: (rows: ReadonlyArray<PayoutRow>, said: Said) => void
  markPaid: ((rows: ReadonlyArray<PayoutRow>, said: Said) => void) | null
  invite: (input: { name: string; email: string; tier: Tier; message: string | undefined }, said: Said) => void
  resendInvite: (i: InviteRow, said: Said) => void
  revokeInvite: (i: InviteRow, said: Said) => void
  /** The link to copy; the console's is the programme's public page (an invitation's own link is in its mail). */
  inviteUrl: (i: InviteRow) => string
  /** "Bekijken zoals zij het zien", where the host can show it. */
  viewInvite: ((i: InviteRow) => void) | null
  resources: ResourcesSource
}

const AffiliatesContext = createContext<AffiliatesSource | null>(null)

export function AffiliatesSourceProvider({ value, children }: { value: AffiliatesSource; children: ReactNode }) {
  return <AffiliatesContext.Provider value={value}>{children}</AffiliatesContext.Provider>
}

export function useAffiliatesSource(): AffiliatesSource {
  const source = useContext(AffiliatesContext)
  if (source === null) throw new Error("The affiliates page needs an AffiliatesSourceProvider around it.")
  return source
}

export const tierIn = (tiers: ReadonlyArray<TierView>, id: Tier): TierView =>
  tiers.find((t) => t.id === id) ?? tiers[0] ?? { id, label: id, rate: 0, from: 0 }
