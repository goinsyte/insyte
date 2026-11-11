import { Schema } from "effect"
import { COUNTRIES } from "../../shared/domain/Workspaces.ts"

/*
 * The workspace's own settings (M3.1; widgets/05 §2.1–2.2): Instellingen → Account (its facts, the alert thresholds,
 * how long a closed store stays readable) and Instellingen → Regio (language and notation). All of it lives on the
 * `workspaces` row (0009). The payloads are plain strings and numbers, checked by the use case after the permission,
 * so a refusal names its field and reason and a role without the level is told so first.
 */

export const RETENTION_DAYS = [30, 90, 180] as const
export const RetentionDays = Schema.Literals(RETENTION_DAYS)
export type RetentionDays = typeof RetentionDays.Type

/** "Late bestelling" after this many hours, "Groot geschil" from this amount (in the workspace's currency). */
export const Alerts = Schema.Struct({ delayHours: Schema.Int, disputeAmountMinor: Schema.Int })
export type Alerts = typeof Alerts.Type

/** Instellingen → Account: the facts on the invoices, the thresholds and the retention. Absent text is "". */
export class WorkspaceAccount extends Schema.Class<WorkspaceAccount>("workspaces/WorkspaceAccount")({
  name: Schema.String,
  legalEntity: Schema.String,
  vatNumber: Schema.String,
  billingEmail: Schema.String,
  /** ISO 3166-1 alpha-2, one of `COUNTRIES`. */
  country: Schema.String,
  /** ISO 4217: what the dispute threshold is counted in. */
  currency: Schema.String,
  alerts: Alerts,
  retentionDays: RetentionDays
}) {}

export const SaveAccount = Schema.Struct({
  name: Schema.String,
  legalEntity: Schema.String,
  vatNumber: Schema.String,
  billingEmail: Schema.String,
  country: Schema.String
})
export type SaveAccount = typeof SaveAccount.Type

export const SetAlerts = Schema.Struct({ delayHours: Schema.Finite, disputeAmountMinor: Schema.Finite })
export type SetAlerts = typeof SetAlerts.Type

export const SetRetention = Schema.Struct({ days: Schema.Finite })
export type SetRetention = typeof SetRetention.Type

/* ── Regio ─────────────────────────────────────────────────────────────────────────────────────── */

export const LANGUAGES = ["nl-NL", "en-US", "en-GB", "de-DE", "fr-FR"] as const
export const CURRENCY_DISPLAYS = ["EUR", "USD", "GBP", "JPY"] as const
export const DATE_FORMATS = ["DD MMM YYYY", "MMM DD, YYYY", "YYYY-MM-DD"] as const
export const TIME_FORMATS = ["24h", "12h"] as const
export const WEEK_STARTS = ["mon", "sun", "sat"] as const

/** Taal en notatie, as codes; the console says them in Dutch. The timezone is any IANA zone. */
export class Regional extends Schema.Class<Regional>("workspaces/Regional")({
  language: Schema.Literals(LANGUAGES),
  currencyDisplay: Schema.Literals(CURRENCY_DISPLAYS),
  dateFormat: Schema.Literals(DATE_FORMATS),
  timeFormat: Schema.Literals(TIME_FORMATS),
  weekStart: Schema.Literals(WEEK_STARTS),
  timezone: Schema.String
}) {}

export const SaveRegional = Schema.Struct({
  language: Schema.String,
  currencyDisplay: Schema.String,
  dateFormat: Schema.String,
  timeFormat: Schema.String,
  weekStart: Schema.String,
  timezone: Schema.String
})
export type SaveRegional = typeof SaveRegional.Type

/* ── checking ──────────────────────────────────────────────────────────────────────────────────── */

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i
/** An EU member state's VAT number (Greece as EL, Northern Ireland as XI) or the UK's, without spaces or dots. */
const VAT =
  /^(?:(?:AT|BE|BG|CY|CZ|DE|DK|EE|EL|ES|FI|FR|HR|HU|IE|IT|LT|LU|LV|MT|NL|PL|PT|RO|SE|SI|SK|XI)[0-9A-Z+*]{2,12}|GB(?:\d{9}|\d{12}|GD\d{3}|HA\d{3}))$/

/** As it is written on an invoice: upper case, no spaces, dots or dashes. */
export const normaliseVat = (vat: string) => vat.replace(/[\s.-]/g, "").toUpperCase()

type Checked<A> = { readonly ok: A } | { readonly fields: Record<string, string> }

const done = <A>(fields: Record<string, string>, ok: A): Checked<A> =>
  Object.keys(fields).length > 0 ? { fields } : { ok }

/** The account's facts, trimmed and checked; each failing field with its reason code (the console says the sentence). */
export const checkAccount = (input: SaveAccount): Checked<SaveAccount> => {
  const name = input.name.trim()
  const legalEntity = input.legalEntity.trim()
  const vatNumber = normaliseVat(input.vatNumber)
  const billingEmail = input.billingEmail.trim()
  const fields: Record<string, string> = {}
  // The workspace row holds at most 80 (0009), which is also what onboarding allows.
  if (name.length === 0) fields["name"] = "required"
  else if (name.length > 80) fields["name"] = "too_long"
  if (legalEntity.length > 200) fields["legalEntity"] = "too_long"
  if (vatNumber !== "" && !VAT.test(vatNumber)) fields["vatNumber"] = "format"
  if (billingEmail !== "" && (billingEmail.length > 254 || !EMAIL.test(billingEmail))) fields["billingEmail"] = "format"
  if (!(COUNTRIES as ReadonlyArray<string>).includes(input.country)) fields["country"] = "invalid"
  return done(fields, { name, legalEntity, vatNumber, billingEmail, country: input.country })
}

/** At least an hour and at most thirty days late; a dispute from nothing up. Whole numbers only. */
export const checkAlerts = (input: SetAlerts): Checked<Alerts> => {
  const fields: Record<string, string> = {}
  if (!Number.isInteger(input.delayHours) || input.delayHours < 1) fields["delayHours"] = "min"
  else if (input.delayHours > 720) fields["delayHours"] = "max"
  if (!Number.isInteger(input.disputeAmountMinor) || input.disputeAmountMinor < 0) fields["disputeAmountMinor"] = "min"
  else if (input.disputeAmountMinor > 10_000_000_000) fields["disputeAmountMinor"] = "max"
  return done(fields, { delayHours: input.delayHours, disputeAmountMinor: input.disputeAmountMinor })
}

const isOneOf = <T extends string>(values: ReadonlyArray<T>, value: string): value is T =>
  (values as ReadonlyArray<string>).includes(value)

/** Whether the runtime knows the zone; Postgres reads the same IANA names. */
const isZone = (zone: string) => {
  if (zone.length === 0 || zone.length > 64) return false
  try {
    return new Intl.DateTimeFormat("en", { timeZone: zone }).resolvedOptions().timeZone.length > 0
  } catch {
    return false
  }
}

export const checkRegional = (input: SaveRegional): Checked<Regional> => {
  const fields: Record<string, string> = {}
  if (!isOneOf(LANGUAGES, input.language)) fields["language"] = "invalid"
  if (!isOneOf(CURRENCY_DISPLAYS, input.currencyDisplay)) fields["currencyDisplay"] = "invalid"
  if (!isOneOf(DATE_FORMATS, input.dateFormat)) fields["dateFormat"] = "invalid"
  if (!isOneOf(TIME_FORMATS, input.timeFormat)) fields["timeFormat"] = "invalid"
  if (!isOneOf(WEEK_STARTS, input.weekStart)) fields["weekStart"] = "invalid"
  if (!isZone(input.timezone)) fields["timezone"] = "invalid"
  if (Object.keys(fields).length > 0) return { fields }
  return { ok: new Regional(input as Regional) }
}
