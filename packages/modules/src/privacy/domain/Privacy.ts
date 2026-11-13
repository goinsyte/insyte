import { Schema } from "effect"

const Level = Schema.Literals([0, 1, 2, 3])

/*
 * Je gegevens (M17 step 5, PLAN 48; widgets/05 Account "Je data", security.md §6): what the workspace holds and where,
 * who may see it, a full export (a ZIP of CSV and JSON), exports Insyte makes by itself, a shopper's access and
 * erasure requests, and deleting the workspace after a waiting period. Times are epoch milliseconds. Copy is the
 * console's, except the fixed facts of where data lives, which are Insyte's own and the same for every workspace.
 */

/** The days a workspace waits between "Werkruimte verwijderen" and the purge (security.md §6: a 7-day grace). */
export const DELETION_DAYS = 7

/** The days an export's file stays downloadable before it expires (domain.md §12.15: a 7-day link). */
export const EXPORT_DAYS = 7

/** What the inventory counts, each over its own tables (`use-cases/inventory.ts`). */
export const CategoryId = Schema.Literals([
  "customers",
  "orders",
  "products",
  "support",
  "chats",
  "returns",
  "chargebacks",
  "files",
  "team",
  "log"
])
export type CategoryId = typeof CategoryId.Type

export const Category = Schema.Struct({ id: CategoryId, count: Schema.Int })
export type Category = typeof Category.Type

/** Where one kind of data is kept (security.md §6 "Residency"). */
export const Place = Schema.Struct({ what: Schema.String, where: Schema.String })
export type Place = typeof Place.Type

/** A service that handles some of the workspace's data on Insyte's behalf. */
export const SubProcessor = Schema.Struct({
  name: Schema.String,
  purpose: Schema.String,
  where: Schema.String,
  outsideEu: Schema.Boolean
})
export type SubProcessor = typeof SubProcessor.Type

/** A role, how many people hold it, and how far it reaches into the shoppers' data. */
export const RoleReach = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  members: Schema.Int,
  customers: Level,
  orders: Level,
  support: Level,
  /** Holds Exporteren (`data.export`), or is the owner. */
  exports: Schema.Boolean,
  /** Held to some stores, not all. */
  someStores: Schema.Boolean
})
export type RoleReach = typeof RoleReach.Type

export const Inventory = Schema.Struct({
  categories: Schema.Array(Category),
  countedAt: Schema.Finite,
  places: Schema.Array(Place),
  subProcessors: Schema.Array(SubProcessor),
  roles: Schema.Array(RoleReach)
})
export type Inventory = typeof Inventory.Type

export const RequestState = Schema.Literals(["open", "running", "ready", "failed", "waiting", "done", "cancelled"])
export type RequestState = typeof RequestState.Type

export const ExportSchedule = Schema.Literals(["off", "weekly", "monthly"])
export type ExportSchedule = typeof ExportSchedule.Type

/** One workspace export: asked for by someone, or made on the schedule. */
export const ExportRow = Schema.Struct({
  id: Schema.String,
  source: Schema.Literals(["operator", "insyte"]),
  state: RequestState,
  /** Who asked, by name; null for a scheduled one. */
  requestedBy: Schema.NullOr(Schema.String),
  requestedAt: Schema.Finite,
  readyAt: Schema.NullOr(Schema.Finite),
  /** The ZIP, while it may still be downloaded. */
  fileId: Schema.NullOr(Schema.String),
  sizeBytes: Schema.NullOr(Schema.Finite),
  expiresAt: Schema.NullOr(Schema.Finite)
})
export type ExportRow = typeof ExportRow.Type

/** A shopper's request: to see what is held about them, or to have it erased. */
export const ShopperRequest = Schema.Struct({
  id: Schema.String,
  kind: Schema.Literals(["access", "erasure"]),
  source: Schema.Literals(["shopify", "operator"]),
  /** The shopper as Insyte knows them: a name or an address; null when the request names nobody Insyte holds. */
  subject: Schema.NullOr(Schema.String),
  state: RequestState,
  receivedAt: Schema.Finite,
  /** The 30 days the law gives to answer. */
  dueAt: Schema.Finite,
  completedAt: Schema.NullOr(Schema.Finite),
  /** The access package, once made. */
  fileId: Schema.NullOr(Schema.String)
})
export type ShopperRequest = typeof ShopperRequest.Type

export const Deletion = Schema.Struct({
  id: Schema.String,
  requestedAt: Schema.Finite,
  requestedBy: Schema.NullOr(Schema.String),
  /** When the workspace goes, unless the deletion is stopped first. */
  dueAt: Schema.Finite
})
export type Deletion = typeof Deletion.Type

export const PrivacyRequests = Schema.Struct({
  /** The name the deletion asks to be typed. */
  workspaceName: Schema.String,
  schedule: ExportSchedule,
  exports: Schema.Array(ExportRow),
  shoppers: Schema.Array(ShopperRequest),
  deletion: Schema.NullOr(Deletion),
  /** The viewer is the owner: the export, its schedule and the deletion are theirs alone. */
  owner: Schema.Boolean
})
export type PrivacyRequests = typeof PrivacyRequests.Type

/* ── inputs ───────────────────────────────────────────────────────────────────────────────────── */

export const SetExportSchedule = Schema.Struct({ schedule: ExportSchedule })
export type SetExportSchedule = typeof SetExportSchedule.Type

const Email = Schema.String.check(Schema.isMinLength(3), Schema.isMaxLength(320))

/** "Gegevens opvragen": by the shopper's address, or answering a request Shopify sent. */
export const RequestAccess = Schema.Struct({
  email: Schema.optional(Email),
  requestId: Schema.optional(Schema.String.check(Schema.isMaxLength(80)))
})
export type RequestAccess = typeof RequestAccess.Type

/** "Gegevens wissen": the shopper by address. Irreversible: the page asks first. */
export const RequestErasure = Schema.Struct({ email: Email })
export type RequestErasure = typeof RequestErasure.Type

/** "Werkruimte verwijderen": the workspace's name typed as it is, so a slip of the hand cannot do it. */
export const RequestDeletion = Schema.Struct({ confirmName: Schema.String.check(Schema.isMaxLength(200)) })
export type RequestDeletion = typeof RequestDeletion.Type

/* ── answers and refusals ─────────────────────────────────────────────────────────────────────── */

export const RequestMade = Schema.Struct({ id: Schema.String })
export type RequestMade = typeof RequestMade.Type

/** No shopper in the workspace has this address. */
export class ShopperNotFound extends Schema.TaggedError<ShopperNotFound>()("ShopperNotFound", {}) {}
