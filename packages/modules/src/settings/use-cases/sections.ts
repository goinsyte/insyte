import { Db } from "@insyte/database/Db"
import { Conflict, Invalid } from "@insyte/domain/Errors"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Undo from "../../shared/use-cases/Undo.ts"
import {
  checkBrand,
  type Checked,
  checkLinks,
  checkRetention,
  checkSenders,
  checkShipping,
  checkVat,
  decodeOr
} from "../domain/Check.ts"
import {
  BrandValue,
  type GetSection,
  LinksValue,
  RETENTION_CLASSES,
  RETENTION_DEFAULTS,
  RetentionCount,
  RetentionValue,
  type SaveSection,
  type SettingsSectionId,
  SHIP_STATUSES,
  ShippingValue,
  VAT_CURRENCIES,
  type VatStore,
  VatValue
} from "../domain/Settings.ts"
import { domainNameOf, mailboxesOf, storedOf } from "./senders.ts"

/*
 * The settings sections (M17 step 20.1b; widgets/05 §7): read at Instellingen · Bekijken, saved at Bewerken (Gegevens
 * en privacy at Beheren: it decides what the nightly erase takes). A save names the version it read and writes the
 * next; it writes one audit line per changed field (`settings.<section>.<field>`, the diff's `before` and `after`,
 * with `key` naming the row), which is what the Logboek lists; and it answers an undo that writes the previous value
 * back as a version of its own.
 */

export const RESTORE = "settings.restore"

type Row = { value: unknown; version: number; updatedAt: Date | null }

export const readRow = (sql: SqlClient.SqlClient, section: SettingsSectionId, lock = false) =>
  Effect.map(
    lock
      ? sql<Row>`select value, version, updated_at from workspace_settings where section = ${section} for update`
      : sql<Row>`select value, version, updated_at from workspace_settings where section = ${section}`,
    (rows) => rows[0]
  )

const isRecord = (u: unknown): u is Record<string, unknown> => typeof u === "object" && u !== null

/** The workspace's stores as Btw lists them: every store not let go, oldest first. */
const storesOf = (sql: SqlClient.SqlClient) =>
  sql<{ id: string; name: string; currency: string | null }>`
    select id, name, currency from stores where status <> 'disconnected' order by created_at, id`

const SHIPPING_DEFAULTS: ShippingValue = { statuses: SHIP_STATUSES.map((s) => ({ ...s })) }
const LINKS_DEFAULTS: LinksValue = { review: "", unsubscribe: "", restock: "" }
const RETENTION_START: RetentionValue = {
  classes: RETENTION_CLASSES.map((id) => ({
    id,
    months: RETENTION_DEFAULTS[id] as RetentionValue["classes"][number]["months"]
  }))
}

const brandDefaults = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<{ name: string }>`select name from workspaces where id = app_workspace_id()`,
    (rows): BrandValue => ({
      logoFileId: null,
      color: "#1F3A5F",
      font: "Systeem",
      sender: rows[0]?.name ?? "",
      website: "",
      support: "",
      widget: "right"
    })
  )

/** Every store with its saved settings, or what a new one starts from: its Shopify currency, VAT counted both ways. */
const vatOf = (raw: unknown, stores: ReadonlyArray<{ id: string; currency: string | null }>): VatValue => {
  const saved = decodeOr(VatValue, raw, { stores: [], oss: false, ossNumber: "" })
  return {
    stores: stores.map((s) =>
      saved.stores.find((v) => v.storeId === s.id) ?? {
        storeId: s.id,
        currency: (VAT_CURRENCIES as ReadonlyArray<string>).includes(s.currency ?? "")
          ? (s.currency as VatValue["stores"][number]["currency"])
          : "EUR",
        vatOnShipping: true,
        refundInclVat: true
      }
    ),
    oss: saved.oss,
    ossNumber: saved.ossNumber
  }
}

/** The saved periods, every class present in the page's order. */
export const retentionOf = (raw: unknown): RetentionValue => {
  const saved = decodeOr(RetentionValue, raw, RETENTION_START)
  return {
    classes: RETENTION_CLASSES.map((id) =>
      saved.classes.find((c) => c.id === id) ??
        { id, months: RETENTION_DEFAULTS[id] as RetentionValue["classes"][number]["months"] }
    )
  }
}

export const erasingOf = (raw: unknown) => isRecord(raw) && raw["erasing"] === true

/** The newest dry run, with the periods it counted. */
export const lastCount = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<{ perClass: unknown; total: number; ranAt: Date; periods: unknown }>`
      select per_class, total, ran_at, periods from retention_runs where kind = 'count'
      order by ran_at desc limit 1`,
    (rows) => {
      const row = rows[0]
      if (row === undefined) return null
      return Schema.decodeUnknownSync(RetentionCount)({
        perClass: row.perClass,
        total: row.total,
        at: row.ranAt.getTime(),
        classes: retentionOf(row.periods).classes
      })
    }
  )

/** A section as the page reads it, from its row (or none). */
export const sectionOf = Effect.fn("WorkspaceSettings.sectionOf")(function*(
  sql: SqlClient.SqlClient,
  section: SettingsSectionId,
  row: Row | undefined
) {
  const stamp = { version: row?.version ?? 0, updatedAt: row?.updatedAt?.getTime() ?? null }
  switch (section) {
    case "shipping":
      return { section, value: decodeOr(ShippingValue, row?.value, SHIPPING_DEFAULTS), ...stamp } as const
    case "links":
      return { section, value: decodeOr(LinksValue, row?.value, LINKS_DEFAULTS), ...stamp } as const
    case "brand": {
      const value = decodeOr(BrandValue, row?.value, yield* brandDefaults(sql))
      const [file] = value.logoFileId === null
        ? []
        : yield* sql<{ id: string }>`select id from files where id = ${value.logoFileId} and deleted_at is null`
      return { section, value, logoUrl: file === undefined ? null : `/api/files/${file.id}`, ...stamp } as const
    }
    case "domain_senders": {
      const stored = storedOf(row?.value)
      return {
        section,
        value: { from: stored.from, replyTo: stored.replyTo },
        domain: yield* domainNameOf(sql, stored.domain),
        ...stamp
      } as const
    }
    case "vat": {
      const stores = yield* storesOf(sql)
      return {
        section,
        value: vatOf(row?.value, stores),
        stores: stores.map((s): VatStore => ({ id: s.id, name: s.name })),
        ...stamp
      } as const
    }
    case "retention": {
      const value = retentionOf(row?.value)
      return {
        section,
        value,
        state: { classes: value.classes, erasing: erasingOf(row?.value), lastCount: yield* lastCount(sql) },
        ...stamp
      } as const
    }
  }
})

/** Retention decides what is erased for good, so its periods take Beheren; the rest Bewerken. */
const saveLevel = (section: SettingsSectionId) => (section === "retention" ? 3 : 2)

export const get = Effect.fn("WorkspaceSettings.get")(function*(input: GetSection) {
  yield* Policy.require("settings", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.flatMap(readRow(sql, input.section), (row) => sectionOf(sql, input.section, row))
  )
})

/** One changed field, as the Logboek lists it. */
export interface FieldChange {
  readonly field: string
  readonly key?: string
  readonly before: unknown
  readonly after: unknown
}

const changes = (section: SettingsSectionId, before: unknown, after: unknown): Array<FieldChange> => {
  const out: Array<FieldChange> = []
  const field = (name: string, a: unknown, b: unknown, key?: string) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      out.push({ field: name, ...(key === undefined ? {} : { key }), before: a ?? null, after: b ?? null })
    }
  }
  const a = before as Record<string, unknown>
  const b = after as Record<string, unknown>
  switch (section) {
    case "shipping": {
      const prev = (a as ShippingValue).statuses
      for (const s of (b as ShippingValue).statuses) {
        const o = prev.find((x) => x.id === s.id)
        field("label", o?.label, s.label, s.id)
        field("show", o?.show, s.show, s.id)
      }
      break
    }
    case "vat": {
      const prev = (a as VatValue).stores
      for (const s of (b as VatValue).stores) {
        const o = prev.find((x) => x.storeId === s.storeId)
        field("currency", o?.currency, s.currency, s.storeId)
        field("vatOnShipping", o?.vatOnShipping, s.vatOnShipping, s.storeId)
        field("refundInclVat", o?.refundInclVat, s.refundInclVat, s.storeId)
      }
      field("oss", a["oss"], b["oss"])
      field("ossNumber", a["ossNumber"], b["ossNumber"])
      break
    }
    case "retention": {
      const prev = (a as RetentionValue).classes
      for (const c of (b as RetentionValue).classes) {
        field(
          "months",
          prev.find((x) => x.id === c.id)?.months,
          c.months,
          c.id
        )
      }
      break
    }
    default:
      for (const k of Object.keys(b)) field(k === "logoFileId" ? "logo" : k, a[k], b[k])
  }
  return out
}

/** The section's value as the checks have it, or the fields that failed. */
const check = (sql: SqlClient.SqlClient, section: SettingsSectionId, value: unknown) =>
  Effect.gen(function*() {
    switch (section) {
      case "shipping":
        return checkShipping(value) as Checked<unknown>
      case "links":
        return checkLinks(value) as Checked<unknown>
      case "brand": {
        const checked = checkBrand(value)
        if ("fields" in checked || checked.ok.logoFileId === null) return checked as Checked<unknown>
        // A logo is one of this workspace's own, uploaded as one.
        const [file] = yield* sql<{ id: string }>`
          select id from files where id = ${checked.ok.logoFileId} and kind = 'logo' and deleted_at is null`
        return (file === undefined ? { fields: { logoFileId: "unknown" } } : checked) as Checked<unknown>
      }
      case "domain_senders": {
        const domain = yield* domainNameOf(sql, storedOf((yield* readRow(sql, section))?.value).domain)
        return checkSenders(value, domain, yield* mailboxesOf(sql)) as Checked<unknown>
      }
      case "vat":
        return checkVat(value, (yield* storesOf(sql)).map((s) => s.id)) as Checked<unknown>
      case "retention":
        return checkRetention(value) as Checked<unknown>
    }
  })

/**
 * Writes `next` as the section's next version, with an audit line per changed field; `current` is the row it read
 * under lock (none: never saved). Retention keeps whether erasing is on: only `Retention.setErasing` switches it; E-mail
 * en domein keeps its domain: only `SendingDomain.get` and `verify` write that.
 */
export const writeSection = Effect.fn("WorkspaceSettings.writeSection")(function*(
  sql: SqlClient.SqlClient,
  section: SettingsSectionId,
  current: Row | undefined,
  next: unknown
) {
  const principal = yield* CurrentPrincipal
  const before = (yield* sectionOf(sql, section, current)).value
  const stored = section === "retention"
    ? { ...(next as object), erasing: erasingOf(current?.value) }
    : section === "domain_senders"
    ? { ...(next as object), domain: storedOf(current?.value).domain ?? null }
    : next
  const json = JSON.stringify(stored)
  if (current === undefined) {
    yield* sql`insert into workspace_settings (workspace_id, section, value, updated_by)
               values (${principal.workspaceId}, ${section}, ${json}::jsonb, ${principal.id})`
  } else {
    yield* sql`update workspace_settings set value = ${json}::jsonb, version = version + 1, updated_by = ${principal.id},
                 updated_at = now()
               where section = ${section}`
  }
  for (const c of changes(section, before, next)) {
    yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
      action: `settings.${section}.${c.field}`,
      subjectType: "workspace_settings",
      subjectId: section,
      section,
      diff: { ...(c.key === undefined ? {} : { key: c.key }), before: c.before, after: c.after }
    })
  }
  return before
})

/** A save on the caller's transaction, after its permission: checked, over the version read, audited, undoable. */
export const saveIn = Effect.fn("WorkspaceSettings.saveIn")(function*(sql: SqlClient.SqlClient, input: SaveSection) {
  const checked = yield* check(sql, input.section, input.value)
  if ("fields" in checked) return yield* new Invalid({ fields: checked.fields })
  const current = yield* readRow(sql, input.section, true)
  if ((current?.version ?? 0) !== input.baseVersion) {
    return yield* new Conflict({ entity: "workspace_settings", reason: "stale_version" })
  }
  const before = yield* writeSection(sql, input.section, current, checked.ok)
  const undo = yield* Undo.issue(sql, { command: RESTORE, compensation: { section: input.section, before } })
  const section = yield* sectionOf(sql, input.section, yield* readRow(sql, input.section))
  return { section, undo }
})

export const save = Effect.fn("WorkspaceSettings.save")(function*(input: SaveSection) {
  yield* Policy.require("settings", saveLevel(input.section))
  const db = yield* Db
  return yield* db.scoped((sql) => saveIn(sql, input))
})

const decodeRestore = Schema.decodeUnknownEffect(
  Schema.Struct({
    section: Schema.Literals(["shipping", "links", "brand", "domain_senders", "vat", "retention"]),
    before: Schema.Json
  })
)

/** `Shared.undo` for `settings.restore`: the section as it was, written as its next version (audited as any save). */
export const restore = Effect.fn("WorkspaceSettings.restore")(function*(
  sql: SqlClient.SqlClient,
  compensation: unknown
) {
  const { section, before } = yield* decodeRestore(compensation).pipe(Effect.orDie)
  yield* Policy.require("settings", saveLevel(section))
  yield* writeSection(sql, section, yield* readRow(sql, section, true), before)
})
