import { Schema } from "effect"
import { UndoTicket } from "../../shared/domain/Undo.ts"

/*
 * Settings depth (M17 track 1, step 20.1b; domain.md §16.1, widgets/05 §7): the workspace's sections the settings
 * pages Verzending, Sjablonen, Huisstijl, Btw and Gegevens en privacy edit, one `workspace_settings` row each. A section
 * never saved answers its defaults at version 0. The save names the version it read (`baseVersion`, api.md §1.1; the
 * widget map calls it `expectedVersion`) and a stale one is `Conflict { reason: "stale_version" }`. The payload's
 * value is plain JSON, checked by the use case after the permission, so a refusal names its field and a role without
 * the level is told so first. Codes only: the console says the sentences.
 */

/* ── sections ─────────────────────────────────────────────────────────────────────────────────── */

/** The sections this step saves; `domain_senders` (E-mail en domein) waits for the sending domain (20.1c). */
export const SECTIONS = ["shipping", "links", "brand", "vat", "retention"] as const
export const SettingsSectionId = Schema.Literals(SECTIONS)
export type SettingsSectionId = typeof SettingsSectionId.Type

/* ── Verzending ───────────────────────────────────────────────────────────────────────────────── */

/** The twelve carrier statuses, in the page's order, with the wording a new workspace starts from. */
export const SHIP_STATUSES = [
  { id: "info", label: "Je bestelling is verzonden", show: "all" },
  { id: "supplier", label: "We maken je bestelling klaar", show: "line" },
  { id: "country", label: "Onderweg", show: "line" },
  { id: "local", label: "Onderweg met {vervoerder}", show: "all" },
  { id: "noinfo", label: "Verzonden", show: "all" },
  { id: "transit", label: "Onderweg", show: "all" },
  { id: "pickup", label: "Ligt klaar om op te halen", show: "all" },
  { id: "out", label: "Wordt vandaag bezorgd", show: "all" },
  { id: "failed", label: "Bezorgpoging mislukt", show: "all" },
  { id: "exception", label: "We kijken naar je zending", show: "all" },
  { id: "stale", label: "Onderweg", show: "line" },
  { id: "delivered", label: "Bezorgd", show: "all" }
] as const
export const SHIP_STATUS_IDS = [
  "info",
  "supplier",
  "country",
  "local",
  "noinfo",
  "transit",
  "pickup",
  "out",
  "failed",
  "exception",
  "stale",
  "delivered"
] as const satisfies ReadonlyArray<(typeof SHIP_STATUSES)[number]["id"]>
export type ShipStatusId = (typeof SHIP_STATUS_IDS)[number]
export const SHIP_SHOWS = ["all", "line", "hidden"] as const

export const ShipWording = Schema.Struct({
  id: Schema.Literals(SHIP_STATUS_IDS),
  label: Schema.String,
  show: Schema.Literals(SHIP_SHOWS)
})
export type ShipWording = typeof ShipWording.Type
export const ShippingValue = Schema.Struct({ statuses: Schema.Array(ShipWording) })
export type ShippingValue = typeof ShippingValue.Type

/* ── Sjablonen ────────────────────────────────────────────────────────────────────────────────── */

export const LINK_KEYS = ["review", "unsubscribe", "restock"] as const
export type LinkKey = (typeof LINK_KEYS)[number]
/** The variable a reply template writes for each link. */
export const LINK_VARIABLES: Record<LinkKey, string> = {
  review: "{review_link}",
  unsubscribe: "{uitschrijf_link}",
  restock: "{voorraad_link}"
}
export const LinksValue = Schema.Struct({ review: Schema.String, unsubscribe: Schema.String, restock: Schema.String })
export type LinksValue = typeof LinksValue.Type

/** How many of the workspace's reply templates use each link's variable. */
export const LinkUsage = Schema.Struct({ review: Schema.Int, unsubscribe: Schema.Int, restock: Schema.Int })
export type LinkUsage = typeof LinkUsage.Type

/* ── Huisstijl ────────────────────────────────────────────────────────────────────────────────── */

export const FONTS = ["Systeem", "Inter", "Georgia"] as const
export const WIDGET_SIDES = ["right", "left"] as const

/** What is saved: the logo as a file of the workspace (`files.kind = logo`), or none. */
export const BrandValue = Schema.Struct({
  logoFileId: Schema.NullOr(Schema.String),
  color: Schema.String,
  font: Schema.Literals(FONTS),
  sender: Schema.String,
  website: Schema.String,
  support: Schema.String,
  widget: Schema.Literals(WIDGET_SIDES)
})
export type BrandValue = typeof BrandValue.Type

/** A logo to keep: its bytes in base64, at most `LOGO_BYTES`. */
export const UploadLogo = Schema.Struct({ name: Schema.String, mime: Schema.String, data: Schema.String })
export type UploadLogo = typeof UploadLogo.Type
export const LOGO_MIMES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const
export const LOGO_BYTES = 400_000
export const UploadedLogo = Schema.Struct({ fileId: Schema.String, url: Schema.String })
export type UploadedLogo = typeof UploadedLogo.Type

/* ── Btw ──────────────────────────────────────────────────────────────────────────────────────── */

export const VAT_CURRENCIES = ["EUR", "USD", "GBP"] as const

export const StoreVat = Schema.Struct({
  storeId: Schema.String,
  currency: Schema.Literals(VAT_CURRENCIES),
  vatOnShipping: Schema.Boolean,
  refundInclVat: Schema.Boolean
})
export type StoreVat = typeof StoreVat.Type
export const VatValue = Schema.Struct({ stores: Schema.Array(StoreVat), oss: Schema.Boolean, ossNumber: Schema.String })
export type VatValue = typeof VatValue.Type

/** A store as the page names it, beside its saved VAT settings. */
export const VatStore = Schema.Struct({ id: Schema.String, name: Schema.String })
export type VatStore = typeof VatStore.Type

/* ── Gegevens en privacy ──────────────────────────────────────────────────────────────────────── */

export const RETENTION_CLASSES = ["contact", "uploads", "logs", "ads", "courses", "customers"] as const
export type RetentionClassId = (typeof RETENTION_CLASSES)[number]
export const RETENTION_MONTHS = [3, 6, 12, 24, 36] as const
/** Where a new workspace starts: nothing is erased until someone turns erasing on. */
export const RETENTION_DEFAULTS: Record<RetentionClassId, number | null> = {
  contact: 24,
  uploads: 24,
  logs: 12,
  ads: 24,
  courses: 12,
  customers: 36
}

export const RetentionClass = Schema.Struct({
  id: Schema.Literals(RETENTION_CLASSES),
  months: Schema.NullOr(Schema.Literals(RETENTION_MONTHS))
})
export type RetentionClass = typeof RetentionClass.Type
export const RetentionValue = Schema.Struct({ classes: Schema.Array(RetentionClass) })
export type RetentionValue = typeof RetentionValue.Type

/** A dry run's or an erase's result: per class, the total, when, and the periods it ran with. */
export const RetentionCount = Schema.Struct({
  perClass: Schema.Record(Schema.String, Schema.Int),
  total: Schema.Int,
  at: Schema.Finite,
  classes: Schema.Array(RetentionClass)
})
export type RetentionCount = typeof RetentionCount.Type

/** The page's state: the saved periods, whether the nightly erase is on, and the newest count. */
export const RetentionState = Schema.Struct({
  classes: Schema.Array(RetentionClass),
  erasing: Schema.Boolean,
  lastCount: Schema.NullOr(RetentionCount)
})
export type RetentionState = typeof RetentionState.Type

/** "Nu tellen" with the periods given (the page's draft), or the saved ones. */
export const CountRetention = Schema.Struct({ classes: Schema.optional(Schema.Array(RetentionClass)) })
export type CountRetention = typeof CountRetention.Type

export const SetErasing = Schema.Struct({ on: Schema.Boolean })
export type SetErasing = typeof SetErasing.Type
export const ErasingChange = Schema.Struct({ state: RetentionState, undo: UndoTicket })
export type ErasingChange = typeof ErasingChange.Type

/** Erasing turned on before the saved periods were counted ("Tel eerst wat er weg zou gaan"). */
export class NotCounted extends Schema.TaggedError<NotCounted>()("NotCounted", {}) {}

/* ── read and save ────────────────────────────────────────────────────────────────────────────── */

const stamp = { version: Schema.Int, updatedAt: Schema.NullOr(Schema.Finite) }

/** A section as it stands, by its id: the value and the version the next save names. */
export const SettingsSection = Schema.Union([
  Schema.Struct({ section: Schema.Literal("shipping"), value: ShippingValue, ...stamp }),
  Schema.Struct({ section: Schema.Literal("links"), value: LinksValue, ...stamp }),
  Schema.Struct({
    section: Schema.Literal("brand"),
    value: BrandValue,
    /** Where the console reads the saved logo; none without one. */
    logoUrl: Schema.NullOr(Schema.String),
    ...stamp
  }),
  Schema.Struct({ section: Schema.Literal("vat"), value: VatValue, stores: Schema.Array(VatStore), ...stamp }),
  Schema.Struct({ section: Schema.Literal("retention"), value: RetentionValue, state: RetentionState, ...stamp })
])
export type SettingsSection = typeof SettingsSection.Type

export const GetSection = Schema.Struct({ section: SettingsSectionId })
export type GetSection = typeof GetSection.Type

export const SaveSection = Schema.Struct({ section: SettingsSectionId, value: Schema.Json, baseVersion: Schema.Int })
export type SaveSection = typeof SaveSection.Type

export const SectionChange = Schema.Struct({ section: SettingsSection, undo: UndoTicket })
export type SectionChange = typeof SectionChange.Type

/** Orders in each carrier status now, by status id. */
export const StatusCounts = Schema.Record(Schema.String, Schema.Int)
export type StatusCounts = typeof StatusCounts.Type
