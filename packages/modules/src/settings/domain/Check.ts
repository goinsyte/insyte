import { Option, Schema } from "effect"
import type { SendersValue } from "./SendingDomain.ts"
import {
  type BrandValue,
  FONTS,
  LINK_KEYS,
  type LinksValue,
  RETENTION_CLASSES,
  RETENTION_DEFAULTS,
  RETENTION_MONTHS,
  type RetentionValue,
  SHIP_SHOWS,
  SHIP_STATUSES,
  type ShippingValue,
  type StoreVat,
  VAT_CURRENCIES,
  type VatValue,
  WIDGET_SIDES
} from "./Settings.ts"

/*
 * Each section's value, checked and normalised (widgets/05 §7 Forms): trimmed text, every fixed id once and in the
 * page's order. A failing field answers its reason code under its own name, `statuses.<id>.label` or `stores.<id>`,
 * so the console can say which row. Pure: the use case calls these after the permission.
 */

export type Checked<A> = { readonly ok: A } | { readonly fields: Record<string, string> }

const done = <A>(fields: Record<string, string>, ok: () => A): Checked<A> =>
  Object.keys(fields).length > 0 ? { fields } : { ok: ok() }

const isRecord = (u: unknown): u is Record<string, unknown> => typeof u === "object" && u !== null && !Array.isArray(u)
const text = (u: unknown) => (typeof u === "string" ? u.trim() : undefined)
const oneOf = <T extends string | number>(values: ReadonlyArray<T>, u: unknown): u is T =>
  (values as ReadonlyArray<unknown>).includes(u)

/** A link a customer can open: https, a host with a dot, no spaces (the page's own rule). */
export const HTTPS = /^https:\/\/[^\s.]+\.[^\s]+$/
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
/** An OSS number: the country code and then eight to twelve digits or letters, spaces taken out. */
const OSS = /^[A-Z]{2}[0-9A-Z]{8,12}$/

export const checkShipping = (value: unknown): Checked<ShippingValue> => {
  const rows = isRecord(value) && Array.isArray(value["statuses"]) ? value["statuses"] : undefined
  if (rows === undefined) return { fields: { statuses: "required" } }
  const fields: Record<string, string> = {}
  const byId = new Map<string, Record<string, unknown>>()
  for (const row of rows) {
    if (!isRecord(row) || typeof row["id"] !== "string") return { fields: { statuses: "invalid" } }
    if (byId.has(row["id"])) fields[`statuses.${row["id"]}`] = "duplicate"
    byId.set(row["id"], row)
  }
  for (const id of byId.keys()) {
    if (!SHIP_STATUSES.some((s) => s.id === id)) fields[`statuses.${id}`] = "unknown"
  }
  for (const s of SHIP_STATUSES) {
    const row = byId.get(s.id)
    if (row === undefined) {
      fields[`statuses.${s.id}`] = "required"
      continue
    }
    const label = text(row["label"])
    if (label === undefined || label === "") fields[`statuses.${s.id}.label`] = "required"
    else if (label.length > 120) fields[`statuses.${s.id}.label`] = "too_long"
    if (!oneOf(SHIP_SHOWS, row["show"])) fields[`statuses.${s.id}.show`] = "invalid"
  }
  return done(fields, () => ({
    statuses: SHIP_STATUSES.map((s) => {
      const row = byId.get(s.id)!
      return { id: s.id, label: text(row["label"])!, show: row["show"] as ShippingValue["statuses"][number]["show"] }
    })
  }))
}

export const checkLinks = (value: unknown): Checked<LinksValue> => {
  if (!isRecord(value)) return { fields: { links: "required" } }
  const fields: Record<string, string> = {}
  const out: Record<string, string> = {}
  for (const key of LINK_KEYS) {
    const link = text(value[key])
    if (link === undefined) fields[key] = "required"
    else if (link !== "" && (link.length > 500 || !HTTPS.test(link))) fields[key] = "format"
    else out[key] = link
  }
  return done(fields, () => out as LinksValue)
}

export const checkBrand = (value: unknown): Checked<BrandValue> => {
  if (!isRecord(value)) return { fields: { brand: "required" } }
  const fields: Record<string, string> = {}
  const logoFileId = value["logoFileId"] ?? null
  if (logoFileId !== null && typeof logoFileId !== "string") fields["logoFileId"] = "invalid"
  const color = text(value["color"]) ?? ""
  if (!HEX.test(color)) fields["color"] = "format"
  if (!oneOf(FONTS, value["font"])) fields["font"] = "invalid"
  const sender = text(value["sender"]) ?? ""
  if (sender === "") fields["sender"] = "required"
  else if (sender.length > 60) fields["sender"] = "too_long"
  const website = text(value["website"]) ?? ""
  if (website !== "" && (website.length > 500 || !HTTPS.test(website))) fields["website"] = "format"
  const support = text(value["support"]) ?? ""
  if (support !== "" && (support.length > 254 || !EMAIL.test(support))) fields["support"] = "format"
  if (!oneOf(WIDGET_SIDES, value["widget"])) fields["widget"] = "invalid"
  return done(fields, () => ({
    logoFileId: logoFileId as string | null,
    color: color.toUpperCase(),
    font: value["font"] as BrandValue["font"],
    sender,
    website,
    support,
    widget: value["widget"] as BrandValue["widget"]
  }))
}

/** `storeIds`: the workspace's stores; one not among them is `unknown`, one left out keeps its defaults. */
export const checkVat = (value: unknown, storeIds: ReadonlyArray<string>): Checked<VatValue> => {
  const rows = isRecord(value) && Array.isArray(value["stores"]) ? value["stores"] : undefined
  if (rows === undefined || !isRecord(value)) return { fields: { stores: "required" } }
  const fields: Record<string, string> = {}
  const stores: Array<StoreVat> = []
  for (const row of rows) {
    if (!isRecord(row) || typeof row["storeId"] !== "string") return { fields: { stores: "invalid" } }
    const id = row["storeId"]
    if (!storeIds.includes(id)) fields[`stores.${id}`] = "unknown"
    else if (stores.some((s) => s.storeId === id)) fields[`stores.${id}`] = "duplicate"
    else if (
      !oneOf(VAT_CURRENCIES, row["currency"]) || typeof row["vatOnShipping"] !== "boolean" ||
      typeof row["refundInclVat"] !== "boolean"
    ) fields[`stores.${id}`] = "invalid"
    else {
      stores.push({
        storeId: id,
        currency: row["currency"],
        vatOnShipping: row["vatOnShipping"],
        refundInclVat: row["refundInclVat"]
      })
    }
  }
  if (typeof value["oss"] !== "boolean") fields["oss"] = "invalid"
  const ossNumber = (text(value["ossNumber"]) ?? "").replace(/\s/g, "").toUpperCase()
  if (value["oss"] === true && !OSS.test(ossNumber)) fields["ossNumber"] = "format"
  return done(fields, () => ({ stores, oss: value["oss"] as boolean, ossNumber }))
}

export const checkRetention = (value: unknown): Checked<RetentionValue> => {
  const rows = isRecord(value) && Array.isArray(value["classes"]) ? value["classes"] : undefined
  if (rows === undefined) return { fields: { classes: "required" } }
  const fields: Record<string, string> = {}
  const months = new Map<string, number | null>()
  for (const row of rows) {
    if (!isRecord(row) || !oneOf(RETENTION_CLASSES, row["id"])) return { fields: { classes: "invalid" } }
    const m = row["months"] ?? null
    if (m !== null && !oneOf(RETENTION_MONTHS, m)) fields[`classes.${row["id"]}`] = "invalid"
    else months.set(row["id"], m)
  }
  return done(fields, () => ({
    classes: RETENTION_CLASSES.map((id) => ({
      id,
      months: (months.has(id) ? months.get(id)! : RETENTION_DEFAULTS[id]) as RetentionValue["classes"][number]["months"]
    }))
  }))
}

/**
 * E-mail en domein's senders (step 20.1c), both optional. "Mails van Insyte" is an address on the sending domain
 * (`domain`: the made one, or the website's; none, it stays empty); "Antwoorden naar" one of the workspace's connected
 * mailboxes (`mailboxes`, lower case), so an answer lands in the Inbox.
 */
export const checkSenders = (
  value: unknown,
  domain: string | null,
  mailboxes: ReadonlyArray<string>
): Checked<SendersValue> => {
  if (!isRecord(value)) return { fields: { senders: "required" } }
  const fields: Record<string, string> = {}
  const from = (text(value["from"]) ?? "").toLowerCase()
  if (from !== "") {
    if (from.length > 254 || !EMAIL.test(from)) fields["from"] = "format"
    else if (domain === null) fields["from"] = "no_domain"
    else if (!from.endsWith(`@${domain}`)) fields["from"] = "not_on_domain"
  }
  const replyTo = (text(value["replyTo"]) ?? "").toLowerCase()
  if (replyTo !== "") {
    if (replyTo.length > 254 || !EMAIL.test(replyTo)) fields["replyTo"] = "format"
    else if (!mailboxes.includes(replyTo)) fields["replyTo"] = "not_a_mailbox"
  }
  return done(fields, () => ({ from, replyTo }))
}

/** A stored value read back; a row from an older shape falls back to the defaults rather than failing the page. */
export const decodeOr = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  value: unknown,
  fallback: S["Type"]
): S["Type"] => Option.getOrElse(Schema.decodeUnknownOption(schema)(value), () => fallback)
