/**
 * The team's records and the pure facts about them, apart from the seeds: what the team screens and their sources
 * share, so a screen loads without the demo data source (the console installs none, ADR-0034). `lib/team.ts` adds the
 * seeds and re-exports these.
 */

export const DAY = 86_400_000

export type StoreAccess = "all" | string[]

export type Invite = {
  id: string
  email: string
  /** The settings role it grants (`useSettings().roles`). */
  roleId: string
  stores: StoreAccess
  message?: string
  /** Member id of whoever sent it. */
  invitedBy: string
  sentAt: number
  expiresAt: number
  /** How many times it has been sent again. */
  resent: number
  /** The workspace member row this invitation stands behind, for the seeded one. */
  memberId?: string
}

export type MemberMeta = {
  stores: StoreAccess
  invitedBy?: string
  joinedAt: number
  /** When they were last in the console. The seeded members' own dates are months old. */
  lastSeen?: number
  deactivated?: boolean
}

export type InviteLink = {
  enabled: boolean
  token: string
  roleId: string
  /** Days the link stays valid after it is made. */
  days: 1 | 7 | 30
  createdAt: number
  /** People who joined through this link. */
  joined: number
}

export const LINK_DAYS: ReadonlyArray<{ id: InviteLink["days"]; label: string }> = [
  { id: 1, label: "24 uur" },
  { id: 7, label: "7 dagen" },
  { id: 30, label: "30 dagen" }
]

export const isExpired = (i: Invite, at = Date.now()) => i.expiresAt <= at

export const token = () => Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6)

/** "amber.lewis@…" → "Amber Lewis", for an invitation that has only an address. */
export function nameFromEmail(email: string) {
  const local = email.split("@")[0] ?? email
  return (
    local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ") || email
  )
}

export const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i
