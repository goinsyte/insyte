import { ZONE } from "./format"
import { API_AREAS, type ApiAccess, type AreaId, scopesOf, type StoreScope } from "./permissions"

/*
 * The API keys' records and the pure facts about them (Instellingen → API-sleutels), apart from the demo's seeded
 * generators: what the key screens and their sources share, so they load without the demo data source.
 * `lib/developer.ts` adds the seeds and the simulated logs and re-exports these.
 */

export const H = 3_600_000
export const D = 24 * H

export const randomHex = (n: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, "0")).join("")

/* ── API keys ────────────────────────────────────────────────────────────────────────────────── */

export type KeyAccess = { kind: "role"; roleId: string } | {
  kind: "custom"
  scopes: Partial<Record<AreaId, ApiAccess>>
}

export type ApiKey = {
  id: string
  label: string
  /** What is shown of the secret: the part before the dots. */
  prefix: string
  created_at: string
  /** Member id of whoever made it. */
  created_by: string
  last_used_at?: string
  status: "active" | "revoked"
  access: KeyAccess
  stores: StoreScope
  /** `null` never lapses. */
  expires_at: string | null
  /** Addresses or ranges a request has to come from. Empty is anywhere. */
  ips: string[]
  /** After a rotation the old secret keeps working until `until`. */
  rotated?: { previousPrefix: string; until: string }
  revoked_at?: string
  /** Meant for an agent the operator connects (ADR-0027): the same scopes; its writes follow Zelfstandigheid. */
  agent?: boolean
}

export const EXPIRY: ReadonlyArray<{ id: "30" | "90" | "365" | "never"; label: string; days: number | null }> = [
  { id: "30", label: "30 dagen", days: 30 },
  { id: "90", label: "90 dagen", days: 90 },
  { id: "365", label: "1 jaar", days: 365 },
  { id: "never", label: "Nooit", days: null }
]

export const GRACE: ReadonlyArray<{ id: "1h" | "24h" | "7d"; label: string; ms: number }> = [
  { id: "1h", label: "1 uur", ms: H },
  { id: "24h", label: "24 uur", ms: D },
  { id: "7d", label: "7 dagen", ms: 7 * D }
]

/** IPv4 with an optional /prefix, or IPv6 in its usual short forms. */
export const IP =
  /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}(?:\/(?:3[0-2]|[12]?\d))?|[0-9a-f:]{2,39}(?:\/\d{1,3})?)$/i

export const newPrefix = () => `ins_live_${randomHex(2)}`

/** A key is limited when it is not a whole role across every store. */
export const isRestricted = (k: ApiKey) => k.access.kind === "custom" || k.stores !== "all" || k.ips.length > 0

export type ExpiryState = { tone: "none" | "amber" | "red"; label: string }

export function expiryState(k: Pick<ApiKey, "expires_at" | "status">, at = Date.now()): ExpiryState {
  if (!k.expires_at) return { tone: "none", label: "Verloopt nooit" }
  const left = Date.parse(k.expires_at) - at
  const days = Math.ceil(left / D)
  if (left <= 0) return { tone: "red", label: "Verlopen" }
  if (days < 14) return { tone: "amber", label: days <= 1 ? "Verloopt morgen" : `Verloopt over ${days} dagen` }
  return {
    tone: "none",
    label: `Verloopt ${
      // One zone on the server and in the browser, or a key expiring near midnight shows two dates (React #418).
      new Intl.DateTimeFormat("nl-NL", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: ZONE
      })
        .format(new Date(k.expires_at))}`
  }
}

/** The scopes a key holds, whether it came from a role or was picked. */
export function keyScopes(k: ApiKey, roleAccess: (roleId: string) => Partial<Record<AreaId, ApiAccess>>): string[] {
  return scopesOf(k.access.kind === "role" ? roleAccess(k.access.roleId) : k.access.scopes)
}

/** "Bestellingen lezen en schrijven, klanten lezen" — short enough for a row. */
export function scopeSummary(access: Partial<Record<AreaId, ApiAccess>>, max = 3): string {
  const write = API_AREAS.filter((a) => access[a.id] === 2).map((a) => a.label.toLowerCase())
  const read = API_AREAS.filter((a) => access[a.id] === 1).map((a) => a.label.toLowerCase())
  const parts = [...write.map((l) => `${l} schrijven`), ...read.map((l) => `${l} lezen`)]
  if (parts.length === 0) return "Geen rechten"
  const shown = parts.slice(0, max).join(", ")
  const more = parts.length - max
  const s = more > 0 ? `${shown} en nog ${more}` : shown
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export type ApiRequest = {
  id: string
  method: "GET" | "POST" | "PATCH" | "DELETE"
  path: string
  status: number
  ms: number
  at: string
  ip: string
}
