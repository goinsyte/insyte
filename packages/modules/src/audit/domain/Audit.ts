import { Schema } from "effect"

/*
 * The Logboek (M17 step 20.1a; domain.md §16.1, widgets/05 §7.7): the workspace's settings changes as lines of "who
 * changed what, from what to what, on which page". Read from `audit_events` where `section` is set. Times are epoch
 * milliseconds; an actor is named by its key `<kind>:<id>`.
 */

/** Which audit lines: the settings pages' (`section` set). More categories join as their readers do. */
export const AuditCategory = Schema.Literals(["settings"])

/** The newest lines first, a page at a time, narrowed to a period, a person and a page. */
export const ListInput = Schema.Struct({
  category: AuditCategory,
  /** Only the last so many days; absent is everything still kept. */
  days: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 400 }))),
  /** An actor's key, as the facets name it. */
  actor: Schema.optional(Schema.String.check(Schema.isMaxLength(200))),
  /** A page's id, as the facets name it. */
  page: Schema.optional(Schema.String.check(Schema.isMaxLength(60))),
  cursor: Schema.optional(Schema.String.check(Schema.isMaxLength(400)))
})
export type ListInput = typeof ListInput.Type

/** The same narrowing, written out as a CSV. */
export const ExportInput = Schema.Struct({
  category: AuditCategory,
  days: ListInput.fields.days,
  actor: ListInput.fields.actor,
  page: ListInput.fields.page
})
export type ExportInput = typeof ExportInput.Type

export const AuditActor = Schema.Struct({ key: Schema.String, name: Schema.String })
export type AuditActor = typeof AuditActor.Type

/** One changed field: "Taal: Nederlands → English", by whom, when, on which page (and where that page is). */
export const AuditLine = Schema.Struct({
  id: Schema.String,
  at: Schema.Finite,
  actor: AuditActor,
  page: Schema.String,
  path: Schema.NullOr(Schema.String),
  field: Schema.String,
  before: Schema.String,
  after: Schema.String
})
export type AuditLine = typeof AuditLine.Type

export const AuditPage = Schema.Struct({ lines: Schema.Array(AuditLine), next: Schema.NullOr(Schema.String) })
export type AuditPage = typeof AuditPage.Type

export const AuditFacets = Schema.Struct({
  actors: Schema.Array(AuditActor),
  pages: Schema.Array(Schema.Struct({ id: Schema.String, label: Schema.String }))
})
export type AuditFacets = typeof AuditFacets.Type

export const AuditExport = Schema.Struct({
  filename: Schema.String,
  csv: Schema.String,
  /** Lines written; `truncated` when the export stopped at its cap. */
  lines: Schema.Int,
  truncated: Schema.Boolean
})
export type AuditExport = typeof AuditExport.Type

/* ── how a line reads ─────────────────────────────────────────────────────────────────────────── */

/** A settings page as the Logboek names and links it. */
export interface LogPage {
  readonly id: string
  readonly label: string
  readonly path: string
}

const PAGE = {
  account: { id: "account", label: "Account", path: "/settings/profile" },
  regional: { id: "regional", label: "Regio", path: "/settings/regional" },
  shipping: { id: "shipping", label: "Verzending", path: "/settings/shipping" },
  templates: { id: "templates", label: "Sjablonen", path: "/settings/templates" },
  brand: { id: "brand", label: "Huisstijl", path: "/settings/brand" },
  domain: { id: "domain", label: "E-mail en domein", path: "/settings/email-domain" },
  vat: { id: "vat", label: "Btw", path: "/settings/vat" },
  privacy: { id: "privacy", label: "Gegevens en privacy", path: "/settings/privacy" },
  data: { id: "data", label: "Je gegevens", path: "/settings/data" }
} as const satisfies Record<string, LogPage>

/**
 * Where a section's changes are made, and what its fields are called there. A settings section joins the Logboek with
 * one entry here; one without an entry still shows, under its own name.
 */
interface SectionLabels {
  readonly page: LogPage
  /** The field's label, where the change is a whole value rather than per field. */
  readonly whole?: string
  readonly fields?: Readonly<Record<string, string>>
}

const SECTIONS: Readonly<Record<string, SectionLabels>> = {
  account: {
    page: PAGE.account,
    fields: {
      name: "Naam werkruimte",
      legalEntity: "Rechtspersoon",
      vatNumber: "Btw-nummer",
      billingEmail: "Factuur-e-mail",
      country: "Land"
    }
  },
  alerts: { page: PAGE.account, fields: { delayHours: "Late bestelling", disputeAmountMinor: "Groot geschil" } },
  retention: { page: PAGE.account, whole: "Gegevens leesbaar houden voor" },
  regional: {
    page: PAGE.regional,
    fields: {
      language: "Taal",
      currencyDisplay: "Valuta",
      dateFormat: "Datumnotatie",
      timeFormat: "Tijdnotatie",
      weekStart: "Week begint op",
      timezone: "Tijdzone"
    }
  },
  // The settings-depth pages (`settings.<section>.<field>`, M17 step 20.1b).
  shipping: { page: PAGE.shipping },
  links: { page: PAGE.templates },
  brand: { page: PAGE.brand },
  domain_senders: { page: PAGE.domain },
  vat: { page: PAGE.vat },
  // Je gegevens' automatic export (M17 step 5).
  data: { page: PAGE.data, whole: "Automatisch exporteren" }
}

/** `settings.retention.*` is Gegevens en privacy's; the older `workspace.retention_updated` is Account's. */
const labelsOf = (section: string, action: string): SectionLabels =>
  action.startsWith("settings.retention.")
    ? { page: PAGE.privacy }
    : SECTIONS[section] ?? { page: { id: section, label: section, path: "" } }

/** The page a line belongs to. */
export const pageOf = (section: string, action: string): LogPage => labelsOf(section, action).page

/** Every page the Logboek knows, for the facets of the sections present. */
export const pagesOf = (sections: ReadonlyArray<{ readonly section: string; readonly action: string }>) => {
  const seen = new Map<string, LogPage>()
  for (const s of sections) {
    const page = pageOf(s.section, s.action)
    if (!seen.has(page.id)) seen.set(page.id, page)
  }
  return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label, "nl"))
}

/** The sections a page's lines may have, for narrowing in SQL; the page is checked again per line. */
export const sectionsOfPage = (page: string): ReadonlyArray<string> => {
  if (page === PAGE.privacy.id) return ["retention"]
  const known = Object.entries(SECTIONS).filter(([, labels]) => labels.page.id === page).map(([section]) => section)
  return known.length > 0 ? known : [page]
}

const VALUES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  language: {
    "nl-NL": "Nederlands",
    "en-US": "Engels (VS)",
    "en-GB": "Engels (VK)",
    "de-DE": "Duits",
    "fr-FR": "Frans"
  },
  timeFormat: { "24h": "24-uurs", "12h": "12-uurs" },
  weekStart: { mon: "Maandag", sun: "Zondag", sat: "Zaterdag" },
  data: { off: "Uit", weekly: "Elke week", monthly: "Elke maand" }
}

/**
 * Made on first use: the first `Intl` formatter an isolate makes loads its locale's data, and at module scope that
 * counted against the API Worker's startup limit.
 */
let euroFormat: Intl.NumberFormat | undefined
const euros = (amount: number): string =>
  (euroFormat ??= new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }))
    .format(amount)

/** A value as the page shows it: a word for a code, a unit for a number, "—" for nothing. */
const said = (field: string | null, value: unknown): string => {
  if (value === null || value === undefined || value === "") return "—"
  if (typeof value === "boolean") return value ? "Aan" : "Uit"
  if (field === "retention" && typeof value === "number") return `${value} dagen`
  if (field === "delayHours" && typeof value === "number") return `${value} uur`
  if (field === "disputeAmountMinor" && typeof value === "number") return euros(value / 100)
  if (typeof value === "string") return (field === null ? undefined : VALUES[field]?.[value]) ?? value
  if (typeof value === "number") return String(value)
  return JSON.stringify(value)
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const fieldLabel = (labels: SectionLabels, field: string) => labels.fields?.[field] ?? field

/** The fields in the order their page lists them (a `jsonb` diff keeps its own order), unknown ones after. */
const inPageOrder = (labels: SectionLabels, keys: ReadonlyArray<string>) => {
  const order = Object.keys(labels.fields ?? {})
  const rank = (key: string) => (order.includes(key) ? order.indexOf(key) : order.length)
  return [...keys].sort((a, b) => rank(a) - rank(b))
}

/**
 * An audit row's changes as Logboek lines: `{ field: { from, to } }` per field, `{ from, to }` of a whole value (or of
 * an object, field by field), and `settings.<section>.<field>` with `{ before, after }`. A row whose diff says nothing
 * readable is one line naming the change.
 */
export const changesOf = (
  row: { readonly section: string; readonly action: string; readonly diff: unknown }
): Array<{ readonly field: string; readonly before: string; readonly after: string }> => {
  const labels = labelsOf(row.section, row.action)
  const diff = isRecord(row.diff) ? row.diff : {}
  const depthField = row.action.startsWith("settings.") ? row.action.split(".").slice(2).join(".") : ""
  if ("before" in diff || "after" in diff) {
    const field = depthField || row.section
    return [{
      field: fieldLabel(labels, field),
      before: said(field, diff["before"]),
      after: said(field, diff["after"])
    }]
  }
  if ("from" in diff || "to" in diff) {
    const from = diff["from"]
    const to = diff["to"]
    if (isRecord(from) || isRecord(to)) {
      const was = isRecord(from) ? from : {}
      const is = isRecord(to) ? to : {}
      return inPageOrder(labels, [...new Set([...Object.keys(was), ...Object.keys(is)])])
        .filter((key) => JSON.stringify(was[key]) !== JSON.stringify(is[key]))
        .map((key) => ({ field: fieldLabel(labels, key), before: said(key, was[key]), after: said(key, is[key]) }))
    }
    const field = row.section === "retention" ? "retention" : row.section
    return [{ field: labels.whole ?? labels.page.label, before: said(field, from), after: said(field, to) }]
  }
  const fields = inPageOrder(labels, Object.keys(diff)).filter((key) => {
    const change = diff[key]
    return isRecord(change) && ("from" in change || "to" in change)
  })
  if (fields.length > 0) {
    return fields.map((key) => {
      const c = diff[key] as Record<string, unknown>
      return { field: fieldLabel(labels, key), before: said(key, c["from"]), after: said(key, c["to"]) }
    })
  }
  return [{ field: labels.whole ?? labels.page.label, before: "—", after: "gewijzigd" }]
}

/** A CSV cell, quoted where it holds a separator, a quote or a line break. */
const cell = (value: string) => (/[",\n;]/.test(value) ? `"${value.replaceAll("\"", "\"\"")}"` : value)

/** "Wanneer", "Wie", "Pagina", "Wat", "Was", "Werd": the design's columns, as a CSV a spreadsheet opens as it is. */
export const toCsv = (lines: ReadonlyArray<AuditLine>, zone: string): string => {
  // "2026-11-12 13:57", in the workspace's zone: sorts as text, and a spreadsheet reads it as a time.
  const when = new Intl.DateTimeFormat("sv-SE", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  })
  const rows = [
    ["Wanneer", "Wie", "Pagina", "Wat", "Was", "Werd"],
    ...lines.map((l) => [when.format(l.at), l.actor.name, l.page, l.field, l.before, l.after])
  ]
  return `${rows.map((r) => r.map(cell).join(",")).join("\r\n")}\r\n`
}
