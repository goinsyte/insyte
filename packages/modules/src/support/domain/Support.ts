import type { WorkspaceId } from "@insyte/domain/Ids"
import { AREA_IDS, type AreaId, SPECIAL_IDS, type SpecialId } from "@insyte/domain/Permissions"
import type { Principal } from "@insyte/domain/Principal"
import { Schema } from "effect"

/*
 * Insyte-support looking along (M18, Support; security.md §8 "Staff access"). Two sides:
 *
 * - The workspace's: the owner's consent, "Insyte-support mag meekijken" under Instellingen → Gegevens en privacy, on
 *   for `CONSENT_DAYS` and then off by itself, and the banner every member sees while a staff session is active.
 * - The team's (the staff admin at `/api/__admin`, behind Cloudflare Access): finding a workspace, its health, and a
 *   session of looking along, read-only, at most `SESSION_MINUTES`, never past the consent, every start, read and end
 *   written to the workspace's Logboek and to the team's own audit (`staff_audit`).
 */

/** How long the owner's consent holds once turned on (Beslissen: the documented default). */
export const CONSENT_DAYS = 7
/** How long a staff session of looking along lasts at most. */
export const SESSION_MINUTES = 60

/** What the workspace sees of it: the consent, a session going on now, and whether this person may change it. */
export class SupportAccess extends Schema.Class<SupportAccess>("support/SupportAccess")({
  /** The consent holds until then (epoch ms); `null` is off. */
  until: Schema.NullOr(Schema.Finite),
  /** Who turned it on, by name; `null` when off. */
  by: Schema.NullOr(Schema.String),
  /** A staff session looking along right now: when it began and when it ends at the latest. */
  session: Schema.NullOr(Schema.Struct({ startedAt: Schema.Finite, endsAt: Schema.Finite })),
  /** Only the owner turns it on or off. */
  canChange: Schema.Boolean,
  /** `CONSENT_DAYS`, so the page says the same number the server keeps. */
  days: Schema.Int
}) {}

export const SetSupportAccess = Schema.Struct({ on: Schema.Boolean })
export type SetSupportAccess = typeof SetSupportAccess.Type

/* ── the team's side ─────────────────────────────────────────────────────────────────────────── */

/** Why the team may not do what it asked: said as a code, the staff page words it. */
export type StaffRefusal =
  | "no_consent"
  | "consent_expired"
  | "no_session"
  | "session_ended"
  | "session_expired"
  | "reason_required"
  | "not_readable"
  | "never_for_staff"
  | "workspace_not_found"

export class StaffRefused extends Schema.TaggedError<StaffRefused>()("StaffRefused", { code: Schema.String }) {}

/** A workspace as the search lists it: only what support needs, never a shopper's data or an address. */
export interface WorkspaceHit {
  readonly id: string
  readonly name: string
  readonly plan: string
  readonly createdAt: string
  readonly stores: number
  readonly members: number
  readonly openIncidents: number
  readonly billing: string | null
  readonly health: "ok" | "attention"
  readonly consentUntil: string | null
}

/** A workspace's health from what Insyte already keeps: counts and codes, never a payload. */
export interface WorkspaceHealth {
  readonly workspace: WorkspaceHit
  readonly connections: ReadonlyArray<{
    readonly id: string
    readonly provider: string
    readonly status: string
    readonly failures: number
    readonly failure: string | null
    readonly lastSyncedAt: string | null
    readonly incidents: ReadonlyArray<{ readonly kind: string; readonly openedAt: string }>
  }>
  readonly webhookGaps: ReadonlyArray<{
    readonly storeId: string
    readonly shopDomain: string
    readonly lastOrderHookAt: string | null
    readonly open: boolean
  }>
  readonly outbox: {
    readonly pending: number
    /** Seconds since the oldest due event that has not gone out; `null` when none waits. */
    readonly lagSeconds: number | null
    /** Due for more than ten minutes: their deliveries failed and sit with the queue's retries or its dead letters. */
    readonly stuck: number
  }
  readonly ai: { readonly limitEuros: number | null; readonly usedEuros: number }
  readonly billing: {
    readonly plan: string
    readonly status: string | null
    readonly trialEndsAt: string | null
    readonly currentPeriodEnd: string | null
    readonly cancelAt: string | null
  }
  /** The last seven days' errors, by where and code, with how many and the newest. */
  readonly errors: ReadonlyArray<
    { readonly source: string; readonly code: string; readonly count: number; readonly lastAt: string }
  >
}

export interface StaffSession {
  readonly id: string
  readonly workspaceId: string
  readonly reason: string
  readonly startedAt: string
  readonly expiresAt: string
  readonly endedAt: string | null
}

/** Every area at Bekijken: what a staff session may at most read (`Policy` refuses it more, whatever this says). */
const levels = Object.fromEntries(AREA_IDS.map((area) => [area, 1])) as Record<AreaId, 1>
const specials = Object.fromEntries(SPECIAL_IDS.map((special) => [special, false])) as Record<SpecialId, false>

/** The principal a staff session reads as: `staff_viewer`, every area at Bekijken, no special, every store. */
export const viewerPrincipal = (sessionId: string, workspaceId: WorkspaceId): Principal => ({
  kind: "staff_viewer",
  id: sessionId,
  userId: null,
  workspaceId,
  partnerId: null,
  role: {
    id: "staff_viewer",
    label: "Insyte-support (alleen lezen)",
    version: 1,
    levels,
    specials,
    refundLimit: 0,
    stores: "all"
  },
  storeScope: null
})
