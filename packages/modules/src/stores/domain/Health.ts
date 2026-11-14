import { Schema } from "effect"

/*
 * Sync health (M17 step 6, PLAN 49; domain.md §3.2, §12.25): "if the Shopify sync stops at night, who notices?". Every
 * fifteen minutes the check looks at each store's connection and keeps one incident per finding: open while it holds,
 * resolved by itself when the check is healthy again, never reopened (a new failure is a new row). Prevention first: a
 * grant about to lapse, a scope the sync needs, the rate limit near, webhooks that stopped coming while Shopify still
 * changes orders, a store no sweep read through. What Insyte did about it is the incident's `tried`; the person on call
 * hears of it once, with that, and not again for the same kind within `NOTIFY_COOLDOWN_MS`.
 *
 * `assess` is the decision, pure: what holds for a connection now, given what the tables say, the sweep's outcomes
 * among them (it writes them on the connection, so the check never waits for the sweep).
 * The sentences below are the console's and the notification's words for an incident, in Dutch, so the bell, the mail,
 * Winkels and Start say the same thing.
 */

export const IncidentKind = Schema.Literals([
  "webhook_gap",
  "token_expiring",
  "token_expired",
  "scope_missing",
  "rate_limited",
  "sync_failed"
])
export type IncidentKind = typeof IncidentKind.Type

/** What a broken connection needs from the operator; the rest Insyte is handling, and only warns. */
export const BROKEN: ReadonlySet<IncidentKind> = new Set(["token_expired", "scope_missing", "sync_failed"])

/** One thing Insyte did about an incident. Times are epoch milliseconds. */
export const Tried = Schema.Struct({
  at: Schema.Finite,
  /**
   * `backfill`: the first import, retried until its retries were spent; `refresh`: a new token asked of Shopify;
   * `reconcile`: the orders read from Shopify itself while webhooks do not come (from `since`), or a sweep that failed
   * and runs again;
   * `throttle`: Insyte slowed its own calls and left the rest for the next sweep.
   */
  step: Schema.Literals(["backfill", "refresh", "reconcile", "throttle"]),
  outcome: Schema.Literals(["done", "failed", "refused"]),
  since: Schema.NullOr(Schema.Finite),
  reason: Schema.NullOr(Schema.String)
})
export type Tried = typeof Tried.Type

/**
 * What the check found, by kind: the scopes missing, when the grant lapses, since when (no webhook, or no sync), how
 * much headroom was left, how many sweeps failed.
 */
export const IncidentFacts = Schema.Struct({
  missing: Schema.optional(Schema.Array(Schema.String)),
  expiresAt: Schema.optional(Schema.Finite),
  since: Schema.optional(Schema.Finite),
  headroom: Schema.optional(Schema.Finite),
  /** Sweeps in a row that failed, as of the last check. */
  failures: Schema.optional(Schema.Int)
})
export type IncidentFacts = typeof IncidentFacts.Type

export class Incident extends Schema.Class<Incident>("stores/Incident")({
  id: Schema.String,
  kind: IncidentKind,
  openedAt: Schema.Finite,
  resolvedAt: Schema.NullOr(Schema.Finite),
  facts: IncidentFacts,
  tried: Schema.Array(Tried),
  /** The person on call who was told, by name. */
  notified: Schema.NullOr(Schema.String)
}) {}

/** A connection as a whole: fine, Insyte is handling something, it needs the operator, importing, or let go. */
export const HealthState = Schema.Literals(["ok", "warning", "broken", "importing", "disconnected"])
export type HealthState = typeof HealthState.Type

export class ConnectionHealth extends Schema.Class<ConnectionHealth>("stores/ConnectionHealth")({
  connectionId: Schema.String,
  provider: Schema.Literal("shopify"),
  storeId: Schema.String,
  storeName: Schema.String,
  shopDomain: Schema.String,
  state: HealthState,
  /** The last time Insyte read the store through: the import, then every sweep that went through. */
  lastSyncedAt: Schema.NullOr(Schema.Finite),
  /** The newest order webhook Shopify delivered. */
  lastDeliveryAt: Schema.NullOr(Schema.Finite),
  /** The open ones first, then those resolved in the last seven days (five at most). */
  incidents: Schema.Array(Incident)
}) {}

export class HealthView extends Schema.Class<HealthView>("stores/HealthView")({
  connections: Schema.Array(ConnectionHealth)
}) {}

/** The shell's one line (`Shell.frame.health`): every connection's state in a word, and what needs attention. */
export class HealthLine extends Schema.Class<HealthLine>("stores/HealthLine")({
  /** `none`: no store connected (the line is not drawn). */
  state: Schema.Literals(["none", "ok", "importing", "warning", "broken"]),
  stores: Schema.Int,
  attention: Schema.Array(Schema.Struct({
    storeId: Schema.String,
    storeName: Schema.String,
    /** `action_required`: the store must be connected again, whatever the incident. */
    kind: Schema.Union([IncidentKind, Schema.Literal("action_required")])
  })),
  /** The newest sweep that went through, over the stores counted. */
  lastSyncedAt: Schema.NullOr(Schema.Finite)
}) {}

// ---------------------------------------------------------------------------------------------------------------------
// The decision

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
/** Warn this long before the grant lapses (M6.1). */
export const EXPIRY_WARN_MS = 7 * DAY_MS
/** No order webhook for this long while Shopify still changes orders is a gap: half of Shopify's own four-hour retry. */
export const GAP_MS = 2 * HOUR_MS
/** A live store no sweep read through for this long is not syncing, whatever the reason (four sweeps missed). */
export const STALE_MS = HOUR_MS
/** Under this share of the bucket left during a sweep, the rate limit is near. */
export const HEADROOM_LOW = 0.1
/** Sweeps in a row that failed before it is an incident (one is a moment of Shopify's). */
export const FAILURES_BEFORE_INCIDENT = 2
/** Sweeps in a row near the rate limit before it opens, and well under it before it resolves: no flapping at 10%. */
export const RATE_SWEEPS = 2
/** A kind told about on a connection is not told again within this time, however often it flaps. */
export const NOTIFY_COOLDOWN_MS = 6 * HOUR_MS

/** What the sync reads, as Shopify names its grants (a `write_` grant includes the read). */
export const SYNC_SCOPES = ["orders", "products", "customers"] as const

/** The grants the sync needs that `granted` lacks, as `read_<resource>`. */
export const missingScopes = (granted: ReadonlyArray<string>) =>
  SYNC_SCOPES.filter((r) => !granted.includes(`read_${r}`) && !granted.includes(`write_${r}`)).map((r) => `read_${r}`)

/**
 * A connection as the tables hold it at the check. Times are epoch milliseconds. The sweep's outcomes are what it wrote
 * on the connection (`reconcile.ts`), so the check needs nothing from the run that swept.
 */
export interface Observed {
  readonly connectionStatus: string
  readonly storeStatus: string
  readonly scopes: ReadonlyArray<string>
  /** When the refresh token lapses, as Shopify said at the last refresh; `null` where it does not say. */
  readonly refreshExpiresAt: number | null
  /** The newest order webhook Shopify delivered for the store. */
  readonly lastOrderDeliveryAt: number | null
  /** The newest order change the sweep has read from Shopify. */
  readonly ordersWatermarkAt: number | null
  /** When the import finished. */
  readonly importedAt: number | null
  /** When the store was last connected (again). */
  readonly connectedAt: number | null
  /** The last sweep that read the store through. */
  readonly lastSweptAt: number | null
  /** The last sweep Shopify throttled: not a failure, and not a store left unread. */
  readonly throttledAt: number | null
  /** Sweeps in a row that failed, and why the last one did. */
  readonly failures: number
  readonly failure: string | null
  /** Sweeps in a row near the rate limit, and in a row well under it; the lowest share left on the last low one. */
  readonly lowSweeps: number
  readonly calmSweeps: number
  readonly headroom: number | null
}

/** An incident open on a connection, as the check reads it before deciding. */
export interface OpenIncident {
  readonly kind: IncidentKind
  readonly openedAt: number
  readonly facts: IncidentFacts
}

export interface Finding {
  readonly facts: IncidentFacts
  /** What Insyte does as it opens. */
  readonly tried: ReadonlyArray<Tried>
  /** What it adds to one already open (another sweep that failed). */
  readonly again: ReadonlyArray<Tried>
}

/** Per kind: it holds (open it, or keep it), it ended (resolve it), or this check cannot tell (leave it). */
export type Verdict = Finding | "ended" | "unknown"

const step = (
  at: number,
  s: Tried["step"],
  outcome: Tried["outcome"],
  extra: { since?: number; reason?: string | null } = {}
): Tried => ({ at, step: s, outcome, since: extra.since ?? null, reason: extra.reason ?? null })

const holds = (facts: IncidentFacts, tried: ReadonlyArray<Tried> = [], again: ReadonlyArray<Tried> = []): Finding => ({
  facts,
  tried,
  again
})

const latest = (...times: ReadonlyArray<number | null>) => {
  const known = times.filter((t): t is number => t !== null)
  return known.length === 0 ? null : Math.max(...known)
}

/** What holds for one connection now, given the incidents open on it. */
export const assess = (o: Observed, open: ReadonlyArray<OpenIncident>, now: number): Record<IncidentKind, Verdict> => {
  const held = (kind: IncidentKind) => open.find((i) => i.kind === kind)
  const gone = o.storeStatus === "disconnected" ||
    ["disconnected", "revoked"].includes(o.connectionStatus)
  if (gone) {
    return {
      webhook_gap: "ended",
      token_expiring: "ended",
      token_expired: "ended",
      scope_missing: "ended",
      rate_limited: "ended",
      sync_failed: "ended"
    }
  }
  const connected = o.connectionStatus === "connected"
  const live = connected && o.storeStatus === "connected" && o.importedAt !== null

  const expired: Verdict = o.connectionStatus === "token_expired"
    ? holds({}, [step(now, "refresh", "refused")])
    : "ended"
  const expiring: Verdict = connected && o.refreshExpiresAt !== null && o.refreshExpiresAt - now < EXPIRY_WARN_MS
    ? holds({ expiresAt: o.refreshExpiresAt })
    : "ended"
  const missing = missingScopes(o.scopes)
  const scope: Verdict = o.connectionStatus === "scope_missing" || (connected && missing.length > 0)
    ? holds({ missing })
    : "ended"

  // Not syncing: two sweeps in a row failed, or no sweep read the store through for an hour (the sweep ran out of
  // time, or never got to it). A throttled sweep is neither. Each further failure is noted on the open incident.
  const failedOpen = held("sync_failed")
  const synced = latest(o.lastSweptAt, o.throttledAt, o.importedAt, o.connectedAt)
  const stale = live && synced !== null && now - synced > STALE_MS
  const failing = live && o.failures >= FAILURES_BEFORE_INCIDENT
  const failure = step(now, "reconcile", "failed", { reason: o.failure })
  const sync: Verdict = failing || stale
    ? holds(
      { ...(synced === null ? {} : { since: synced }), ...(failing ? { failures: o.failures } : {}) },
      failing ? [failure] : [],
      failing && (failedOpen?.facts.failures ?? 0) < o.failures && failedOpen !== undefined ? [failure] : []
    )
    : failedOpen === undefined
    ? "ended"
    // A store the import gave up on keeps its incident until it is imported again.
    : live && o.failures === 0
    ? "ended"
    : "unknown"

  // Near the rate limit for two sweeps in a row opens it; two sweeps well under it resolve it.
  const rateOpen = held("rate_limited")
  const rate: Verdict = !live
    ? "ended"
    : o.lowSweeps >= RATE_SWEEPS
    ? holds(o.headroom === null ? {} : { headroom: o.headroom }, [step(now, "throttle", "done")])
    : rateOpen === undefined
    ? "ended"
    : o.calmSweeps >= RATE_SWEEPS
    ? "ended"
    : "unknown"

  // Webhooks stopped while the sweep still reads order changes. The reference is the newest of the last delivery, the
  // import and the (re)connect, so a store connected again does not count the weeks it was gone. Open, it holds until a
  // delivery, an import or a reconnect comes after it opened; meanwhile the sweep reads the orders with more pages.
  const gapOpen = held("webhook_gap")
  const reference = latest(o.lastOrderDeliveryAt, o.importedAt, o.connectedAt)
  const gap: Verdict = !live || reference === null
    ? "ended"
    : gapOpen !== undefined
    ? (reference > gapOpen.openedAt ? "ended" : holds(gapOpen.facts))
    : o.ordersWatermarkAt !== null && o.ordersWatermarkAt - reference > GAP_MS && now - reference > GAP_MS
    ? holds({ since: reference }, [step(now, "reconcile", "done", { since: reference })])
    : "ended"

  return {
    webhook_gap: gap,
    token_expiring: expired === "ended" ? expiring : "ended",
    token_expired: expired,
    scope_missing: scope,
    rate_limited: rate,
    sync_failed: sync
  }
}

/** A connection's state in a word, from its store and the incidents open on it. */
export const stateOf = (storeStatus: string, open: ReadonlyArray<IncidentKind>): HealthState =>
  storeStatus === "disconnected"
    ? "disconnected"
    : storeStatus === "action_required" || open.some((k) => BROKEN.has(k))
    ? "broken"
    : open.length > 0
    ? "warning"
    : storeStatus === "connecting"
    ? "importing"
    : "ok"

// ---------------------------------------------------------------------------------------------------------------------
// The words

const ZONE = "Europe/Amsterdam"
const day = (at: number) => new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeZone: ZONE }).format(at)

/** "03:12" on the day of `now`, "12 nov 03:12" on another: a night's finding read in the morning says which night. */
export const when = (at: number, now = Date.now()) => {
  const time = new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: ZONE }).format(at)
  if (day(at) === day(now)) return time
  const date = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", timeZone: ZONE }).format(at)
  return `${date.replace(".", "")} ${time}`
}

const daysLeft = (at: number, now: number) => Math.max(0, Math.ceil((at - now) / DAY_MS))

/** What the resource names in a missing scope are, as the operator reads them. */
const RESOURCE: Record<string, string> = {
  read_orders: "bestellingen",
  read_products: "producten",
  read_customers: "klanten"
}

const listed = (words: ReadonlyArray<string>) =>
  words.length <= 1 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} en ${words.at(-1)}`

/** What is wrong, in one sentence: "Er komen sinds 03:12 geen webhooks van Shopify binnen." */
export const findingSentence = (kind: IncidentKind, facts: IncidentFacts, now = Date.now()): string => {
  switch (kind) {
    case "webhook_gap":
      return facts.since === undefined
        ? "Er komen geen webhooks van Shopify meer binnen."
        : `Er komen sinds ${when(facts.since, now)} geen webhooks van Shopify binnen.`
    case "token_expiring": {
      const days = facts.expiresAt === undefined ? 7 : daysLeft(facts.expiresAt, now)
      return days <= 1
        ? "De toegang tot Shopify verloopt binnen een dag."
        : `De toegang tot Shopify verloopt over ${days} dagen.`
    }
    case "token_expired":
      return "Shopify geeft Insyte geen toegang meer."
    case "scope_missing": {
      const what = (facts.missing ?? []).map((s) => RESOURCE[s] ?? s)
      return what.length === 0
        ? "Insyte mist rechten in Shopify."
        : `Insyte mag de ${listed(what)} niet meer lezen.`
    }
    case "rate_limited":
      return "De limiet van Shopify voor verzoeken is bijna bereikt."
    case "sync_failed":
      return facts.since === undefined
        ? "Synchroniseren met Shopify lukt niet."
        : `Insyte heeft sinds ${when(facts.since, now)} niet met Shopify gesynchroniseerd.`
  }
}

/** One thing Insyte did, as a line: "Leest de bestellingen sinds 03:12 zelf bij Shopify". */
export const triedSentence = (t: Tried, now = Date.now()): string => {
  switch (t.step) {
    case "backfill":
      return "Probeerde de eerste import opnieuw, tot het niet meer lukte"
    case "refresh":
      return t.outcome === "refused" ? "Vroeg Shopify om een nieuw token; Shopify weigerde" : "Vernieuwde het token"
    case "reconcile":
      return t.outcome === "failed"
        ? `Synchroniseerde om ${when(t.at, now)}; dat lukte niet, het volgende kwartier opnieuw`
        : t.since === null
        ? "Leest de bestellingen elk kwartier zelf bij Shopify"
        : `Leest de bestellingen sinds ${when(t.since, now)} elk kwartier zelf bij Shopify`
    case "throttle":
      return "Remde zijn eigen verzoeken af en leest de rest het volgende kwartier"
  }
}

/** What Insyte already did, as one sentence after the finding: "Insyte deed al: haalt de wijzigingen …". */
export const triedSummary = (lines: ReadonlyArray<string>) =>
  lines.length === 0
    ? ""
    : `Insyte deed al dit: ${lines.map((l) => l.charAt(0).toLowerCase() + l.slice(1)).join("; ")}.`

/** What Insyte is doing about it while it lasts, where it can: `null` where only the operator can. */
export const handlingSentence = (kind: IncidentKind): string | null =>
  kind === "webhook_gap"
    ? "Insyte leest de bestellingen zelf bij Shopify"
    : kind === "rate_limited"
    ? "Insyte leest rustiger tot er weer ruimte is"
    : kind === "sync_failed"
    ? "Insyte probeert het elk kwartier opnieuw"
    : null

/** What the operator can do, where Insyte cannot: `null` while Insyte is handling it. */
export const remedySentence = (kind: IncidentKind): string | null =>
  kind === "token_expired" || kind === "token_expiring" || kind === "scope_missing"
    ? "Koppel de winkel opnieuw, dan vraagt Shopify je toestemming."
    : null
