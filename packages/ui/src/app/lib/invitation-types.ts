import type { StoreAccess } from "./team-core"

/**
 * What an invitation link opens on, as the landing draws it: the record and its state, apart from how the demo
 * resolves it (`lib/invitations.ts`), so the landing loads without the demo data source.
 */

export type LandingState =
  | "new"
  | "existing"
  | "other-account"
  | "expired"
  | "revoked"
  | "accepted"
  | "sso"
  | "full"
  | "supplier"
  | "affiliate"
  | "link"
  | "missing"

export type Landing = {
  id: string
  state: LandingState
  workspace: string
  inviter: { id: string; name: string; role: string }
  email?: string
  name?: string
  roleId?: string
  stores: StoreAccess
  message?: string
  at?: number
  /** Supplier invitations: the company, and what it will see. */
  company?: string
  supplierId?: string
  scopes?: string[]
  /** Affiliate invitations. */
  tier?: { label: string; rate: number }
  code?: string
  /** Team invitations created in the session: accepting them adds the person. */
  teamInviteId?: string
  affiliateInviteId?: string
}
