import { Schema } from "effect"

/*
 * Instellingen → Winkels and onboarding's store step (M6.2, domain.md §3): the workspace's stores and connecting one.
 * A shop domain is connected to one workspace at a time; reconnecting in the same workspace keeps the store's id.
 */

export const StoreStatus = Schema.Literals(["connecting", "connected", "action_required", "disconnected"])
export type StoreStatus = typeof StoreStatus.Type

export class StoreView extends Schema.Class<StoreView>("stores/StoreView")({
  id: Schema.String,
  name: Schema.String,
  shopDomain: Schema.String,
  status: StoreStatus,
  currency: Schema.NullOr(Schema.String),
  country: Schema.NullOr(Schema.String),
  timezone: Schema.NullOr(Schema.String),
  connectedAt: Schema.NullOr(Schema.Finite),
  lastSyncedAt: Schema.NullOr(Schema.Finite)
}) {}

/** Where a store's first import is (M6.3): per resource, and the mirror's counts so far. */
export const SyncPhase = Schema.Literals(["queued", "running", "reading", "done"])
export class SyncStatus extends Schema.Class<SyncStatus>("stores/SyncStatus")({
  storeId: Schema.String,
  status: StoreStatus,
  lastSyncedAt: Schema.NullOr(Schema.Finite),
  counts: Schema.Struct({ products: Schema.Int, customers: Schema.Int, orders: Schema.Int }),
  resources: Schema.Array(Schema.Struct({
    resource: Schema.Literals(["products", "customers", "orders"]),
    phase: SyncPhase
  }))
}) {}

/** A shop address as typed (`northwind`, `northwind.myshopify.com`, a full URL) and where to come back to. */
export const BeginConnect = Schema.Struct({ shopDomain: Schema.String, returnPath: Schema.String })
export type BeginConnect = typeof BeginConnect.Type

export const StoreRef = Schema.Struct({ id: Schema.String })

/** No shop answers at that address. */
export class ShopNotFound extends Schema.TaggedError<ShopNotFound>()("ShopNotFound", { shopDomain: Schema.String }) {}

/** The shop is connected to another workspace; it is never moved silently. */
export class StoreConnectedElsewhere extends Schema.TaggedError<StoreConnectedElsewhere>()("StoreConnectedElsewhere", {
  shopDomain: Schema.String
}) {}

/** This stage has no Shopify app (no client id and secret): stores can only be connected later. */
export class ShopifyUnavailable extends Schema.TaggedError<ShopifyUnavailable>()("ShopifyUnavailable", {}) {}

/** The callback could not be trusted or completed: the state was unknown, used or late, or Shopify said no. */
export class ConnectFailed extends Schema.TaggedError<ConnectFailed>()("ConnectFailed", {
  reason: Schema.Literals(["signature", "state", "shop", "exchange"])
}) {}

/** Normalise what was typed to `<handle>.myshopify.com`, or `undefined` when it cannot be a Shopify address. */
export const normaliseShop = (typed: string): string | undefined => {
  const handle = typed.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(
    /\.myshopify\.com$/,
    ""
  )
  return /^[a-z0-9][a-z0-9-]*$/.test(handle) ? `${handle}.myshopify.com` : undefined
}

/** A return path inside the console: a path, never another origin. */
export const safeReturn = (path: string) => (path.startsWith("/") && !path.startsWith("//") ? path : "/settings/stores")
