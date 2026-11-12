import { Context, type Effect, Schema } from "effect"
import { UndoTicket } from "../../shared/domain/Undo.ts"

/*
 * E-mail en domein (M17 step 20.1c; widgets/05 §7.4, ADR-0018): the brand's own sending domain at Resend, the four
 * records to put at its domain host and what each was found as, and the two senders. The domain is the brand's website
 * (Huisstijl), as the page has no field of its own for it. Its state lives in `workspace_settings` section
 * `domain_senders` beside the senders, written without a new version: the version guards what people type, and a check
 * between reading and saving must not make their save stale.
 */

/* ── the provider, as a port ──────────────────────────────────────────────────────────────────── */

/** What one of the provider's records is for, and where it stands there. */
export interface ProviderRecord {
  /** `SPF` (the MX and TXT of the return path), `DKIM`, or another the page does not show (`Tracking`, …). */
  readonly record: string
  readonly type: string
  readonly name: string
  readonly value: string
  readonly status: string
  readonly priority?: number | undefined
}

/** A domain as the provider holds it. `status` is `verified` once mail from it is signed. */
export interface ProviderDomain {
  readonly id: string
  readonly name: string
  readonly status: string
  readonly region: string
  readonly records: ReadonlyArray<ProviderRecord>
}

/** The environment's key cannot manage domains (a sending-only key) or there is none: the page says so. */
export class DomainsUnavailable extends Schema.TaggedError<DomainsUnavailable>()("DomainsUnavailable", {}) {}

/** The provider already holds a domain by that name (another workspace's, or one made by hand). */
export class DomainTaken extends Schema.TaggedError<DomainTaken>()("DomainTaken", {}) {}

/** The provider could not be reached or refused for another reason; `reason` is its words, never the key. */
export class DomainsFailed extends Schema.TaggedError<DomainsFailed>()("DomainsFailed", { reason: Schema.String }) {}

/**
 * The sending domains, at Resend (`@insyte/integrations-resend/ResendDomains`). `configured` is false where the
 * environment has no key for them; every call then fails `DomainsUnavailable`. `dmarc` asks the DNS itself: the
 * provider lists no DMARC record, and the page shows it as the fourth.
 */
export class SendingDomains extends Context.Service<SendingDomains, {
  readonly configured: boolean
  readonly create: (
    name: string
  ) => Effect.Effect<ProviderDomain, DomainsUnavailable | DomainTaken | DomainsFailed>
  readonly get: (id: string) => Effect.Effect<ProviderDomain, DomainsUnavailable | DomainsFailed>
  readonly verify: (id: string) => Effect.Effect<void, DomainsUnavailable | DomainsFailed>
  /** Whether `_dmarc.<name>` holds a DMARC policy. */
  readonly dmarc: (name: string) => Effect.Effect<boolean, DomainsFailed>
}>()("settings/SendingDomains") {}

/* ── what the page reads ──────────────────────────────────────────────────────────────────────── */

export const RECORD_IDS = ["mx", "spf", "dkim", "dmarc"] as const
export const RECORD_STATUSES = ["found", "missing", "pending"] as const
/** Why a record is not found yet: never checked, checked and not there for 72 hours, or the check itself failed. */
export const RECORD_REASONS = ["not_started", "failed", "temporary_failure"] as const

export const DomainRecord = Schema.Struct({
  id: Schema.Literals(RECORD_IDS),
  type: Schema.Literals(["MX", "TXT", "CNAME"]),
  name: Schema.String,
  value: Schema.String,
  status: Schema.Literals(RECORD_STATUSES),
  reason: Schema.NullOr(Schema.Literals(RECORD_REASONS))
})
export type DomainRecord = typeof DomainRecord.Type

/**
 * Where the page stands: `ready` (the domain and its records), `unavailable` (no key that manages domains), `no_domain`
 * (no website at Huisstijl to take it from), `taken` (the provider holds that name already) or `failed` (the provider
 * could not be reached and nothing was read before).
 */
export const DOMAIN_STATES = ["ready", "unavailable", "no_domain", "taken", "failed"] as const

/** "Mails van Insyte" and "Antwoorden naar": empty is Insyte's own sender, and answers to the sender. */
export const SendersValue = Schema.Struct({ from: Schema.String, replyTo: Schema.String })
export type SendersValue = typeof SendersValue.Type

/** The domain as kept beside the senders: the provider's id, what the newest read found, and the checks so far. */
export const StoredDomain = Schema.Struct({
  name: Schema.String,
  providerId: Schema.String,
  verified: Schema.Boolean,
  records: Schema.Array(DomainRecord),
  checkedAt: Schema.NullOr(Schema.Finite),
  checks: Schema.Int
})
export type StoredDomain = typeof StoredDomain.Type

/** The section as stored: the senders, and the domain once it was made at the provider. */
export const StoredSenders = Schema.Struct({
  from: Schema.String,
  replyTo: Schema.String,
  domain: Schema.optional(Schema.NullOr(StoredDomain))
})
export type StoredSenders = typeof StoredSenders.Type

export const SendingDomainState = Schema.Struct({
  state: Schema.Literals(DOMAIN_STATES),
  /** The domain, or the one it would be (the website's); none without a website. */
  domain: Schema.NullOr(Schema.String),
  records: Schema.Array(DomainRecord),
  /** Mail from the domain is signed: shoppers' mail goes from "Mails van Insyte". */
  verified: Schema.Boolean,
  checkedAt: Schema.NullOr(Schema.Finite),
  checks: Schema.Int,
  senders: SendersValue,
  /** The senders' version, which `saveSenders` names. */
  version: Schema.Int,
  updatedAt: Schema.NullOr(Schema.Finite)
})
export type SendingDomainState = typeof SendingDomainState.Type

export const SaveSenders = Schema.Struct({ from: Schema.String, replyTo: Schema.String, baseVersion: Schema.Int })
export type SaveSenders = typeof SaveSenders.Type

export const SendersChange = Schema.Struct({ domain: SendingDomainState, undo: UndoTicket })
export type SendersChange = typeof SendersChange.Type

/* ── rules ────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The sending domain a website names: its host without `www.`. None for no website, and none for a shop's platform
 * address (`*.myshopify.com`), whose DNS the shop does not manage.
 */
export const domainOfWebsite = (website: string): string | null => {
  let host: string
  try {
    host = new URL(website.trim()).hostname.toLowerCase()
  } catch {
    return null
  }
  const name = host.replace(/^www\./, "")
  if (!name.includes(".") || name.endsWith(".myshopify.com") || /^[\d.]+$/.test(name)) return null
  return name
}

const FOUND = new Set(["verified"])
const PENDING = new Set(["pending"])
const REASONS = new Set<string>(RECORD_REASONS)

const statusOf = (status: string): Pick<DomainRecord, "status" | "reason"> =>
  FOUND.has(status)
    ? { status: "found", reason: null }
    : PENDING.has(status)
    ? { status: "pending", reason: null }
    : { status: "missing", reason: (REASONS.has(status) ? status : "not_started") as DomainRecord["reason"] }

/** What the page recommends for DMARC: a policy that only reports, so nothing is refused while it is new. */
export const DMARC_VALUE = "v=DMARC1; p=none;"

/**
 * The provider's records as the page's four: the return path's MX and SPF, the DKIM key, and DMARC as the DNS has it.
 * A record the provider did not list (it always lists the first three) is left out.
 */
export const recordsOf = (domain: ProviderDomain, dmarcFound: boolean): Array<DomainRecord> => {
  const find = (record: string, type: string) =>
    domain.records.find((r) => r.record.toUpperCase() === record && r.type.toUpperCase() === type)
  const out: Array<DomainRecord> = []
  const take = (id: DomainRecord["id"], r: ProviderRecord | undefined) => {
    if (r === undefined) return
    out.push({
      id,
      type: r.type.toUpperCase() as DomainRecord["type"],
      name: r.name,
      value: r.value,
      ...statusOf(r.status)
    })
  }
  take("mx", find("SPF", "MX"))
  take("spf", find("SPF", "TXT"))
  take("dkim", find("DKIM", "TXT") ?? find("DKIM", "CNAME"))
  out.push({
    id: "dmarc",
    type: "TXT",
    name: "_dmarc",
    value: DMARC_VALUE,
    ...(dmarcFound ? { status: "found", reason: null } : { status: "missing", reason: "not_started" })
  })
  return out
}
