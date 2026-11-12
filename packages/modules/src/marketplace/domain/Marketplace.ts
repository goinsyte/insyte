import { Schema } from "effect"
import { UndoTicket } from "../../shared/domain/Undo.ts"

/*
 * The Marketplace as the console reads it (M17 step 3; widgets/05 §6). The catalogue is `@insyte/domain/Marketplace`,
 * served as it is; an install is the workspace's own row, or for a connector app its connection. Times are epoch
 * milliseconds.
 */

export const AppScopeView = Schema.Struct({ id: Schema.String, label: Schema.String })

export const AppInstallSpec = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("connect"), provider: Schema.Literal("klaviyo") }),
  Schema.Struct({ kind: Schema.Literal("key") }),
  Schema.Struct({ kind: Schema.Literal("soon") })
])

export const CatalogAppView = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  tagline: Schema.String,
  listing: Schema.String,
  kind: Schema.Literals(["Integration", "App", "Coaching", "Agency"]),
  category: Schema.Literals([
    "ecommerce",
    "marketing",
    "customer_service",
    "analytics",
    "finance",
    "logistics",
    "ai",
    "communication",
    "integrations",
    "productivity"
  ]),
  badge: Schema.optional(Schema.Literals(["editors_choice", "best_seller", "new", "trending"])),
  rating: Schema.Finite,
  installCount: Schema.Int,
  vendorUrl: Schema.String,
  pricing: Schema.String,
  features: Schema.Array(Schema.String),
  scopes: Schema.Array(AppScopeView),
  install: AppInstallSpec
})
export type CatalogAppView = typeof CatalogAppView.Type

/** The catalogue and the editors' shelves, by app id. */
export class Catalog extends Schema.Class<Catalog>("marketplace/Catalog")({
  apps: Schema.Array(CatalogAppView),
  collections: Schema.Struct({
    featured: Schema.Array(Schema.String),
    trending: Schema.Array(Schema.String),
    editors: Schema.Array(Schema.String)
  })
}) {}

/**
 * An app the workspace has: from its own row, or for a connector app from the connection (connected elsewhere in
 * Insyte, it is installed all the same). `revokedScopes` are the scope ids taken back.
 */
export class InstallView extends Schema.Class<InstallView>("marketplace/InstallView")({
  appId: Schema.String,
  installedAt: Schema.Finite,
  installedBy: Schema.NullOr(Schema.String),
  lastOpenedAt: Schema.NullOr(Schema.Finite),
  revokedScopes: Schema.Array(Schema.String),
  via: Schema.Literals(["app", "connection"])
}) {}

export class AppDetail extends Schema.Class<AppDetail>("marketplace/AppDetail")({
  app: CatalogAppView,
  install: Schema.NullOr(InstallView)
}) {}

export const AppRef = Schema.Struct({ appId: Schema.String })

/**
 * What installing answered. A recipe app: its row and the API key made for it, shown once. A connector app: nothing is
 * installed until its connection is, so `connect` names the flow the console starts next.
 */
export class InstallResult extends Schema.Class<InstallResult>("marketplace/InstallResult")({
  install: Schema.NullOr(InstallView),
  key: Schema.NullOr(Schema.Struct({ secret: Schema.String, prefix: Schema.String })),
  connect: Schema.NullOr(Schema.Literal("klaviyo"))
}) {}

/** Uninstalled: a recipe app's key revoked with it, and its Undo; a connector app's row, with none. */
export class UninstallResult extends Schema.Class<UninstallResult>("marketplace/UninstallResult")({
  undo: Schema.NullOr(UndoTicket)
}) {}

export const SetScopes = Schema.Struct({ appId: Schema.String, revoked: Schema.Array(Schema.String) })

export class ScopesChange extends Schema.Class<ScopesChange>("marketplace/ScopesChange")({
  install: InstallView,
  undo: UndoTicket
}) {}

export const FeedbackCategory = Schema.Literals(["suggest", "broken", "listing", "other"])
export type FeedbackCategory = typeof FeedbackCategory.Type

export const SendFeedback = Schema.Struct({ category: FeedbackCategory, message: Schema.String })
