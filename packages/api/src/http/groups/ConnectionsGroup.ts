import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { ScopeMissingV1 } from "../Errors.ts"

/* Sync health (M17 step 6, PLAN 49): every store's connection, its state, and its incidents with what Insyte tried. */

export const IncidentKindV1 = Schema.Literals([
  "webhook_gap",
  "token_expiring",
  "token_expired",
  "scope_missing",
  "rate_limited",
  "sync_failed"
]).annotate({
  description:
    "webhook_gap: no order webhook for two hours while Shopify still changes orders; token_expiring: the grant lapses within seven days; token_expired: Shopify refused a new token; scope_missing: a grant the sync needs is missing; rate_limited: Shopify's request bucket ran nearly empty; sync_failed: the import gave up, or two sweeps in a row failed."
})

export const IncidentV1 = Schema.Struct({
  id: Schema.String,
  kind: IncidentKindV1,
  opened_at: Schema.String,
  resolved_at: Schema.NullOr(Schema.String),
  summary: Schema.String.annotate({ description: "What is wrong, in Dutch, as the console says it." }),
  facts: Schema.Struct({
    missing_scopes: Schema.optional(Schema.Array(Schema.String)),
    expires_at: Schema.optional(Schema.String),
    since: Schema.optional(Schema.String),
    headroom: Schema.optional(Schema.Finite.annotate({ description: "The lowest share of the bucket left, 0 to 1." }))
  }),
  tried: Schema.Array(Schema.Struct({
    at: Schema.String,
    step: Schema.Literals(["backfill", "refresh", "reconcile", "throttle"]),
    outcome: Schema.Literals(["done", "failed", "refused"]),
    since: Schema.NullOr(Schema.String),
    text: Schema.String.annotate({ description: "The step in Dutch, as the console says it." })
  })).annotate({ description: "What Insyte already did about it, oldest first." })
}).annotate({ identifier: "ConnectionIncident" })

export const ConnectionHealthV1 = Schema.Struct({
  connection_id: Schema.String,
  provider: Schema.Literal("shopify"),
  store_id: Schema.String,
  store_name: Schema.String,
  shop_domain: Schema.String,
  state: Schema.Literals(["ok", "warning", "broken", "importing", "disconnected"]).annotate({
    description: "warning: Insyte is handling an incident; broken: the store needs the operator (connect it again)."
  }),
  last_synced_at: Schema.NullOr(Schema.String),
  last_delivery_at: Schema.NullOr(Schema.String).annotate({ description: "The newest order webhook received." }),
  incidents: Schema.Array(IncidentV1).annotate({
    description: "Open ones first, then those resolved in the last seven days (five at most)."
  })
}).annotate({ identifier: "ConnectionHealth" })

export const ConnectionsHealthV1 = Schema.Struct({ data: Schema.Array(ConnectionHealthV1) }).annotate({
  identifier: "ConnectionsHealth"
})

export class ConnectionsGroup extends HttpApiGroup.make("connections")
  .add(
    HttpApiEndpoint.get("health", "/connections/health", {
      success: ConnectionsHealthV1,
      error: [ScopeMissingV1]
    }).annotate(
      OpenApi.Description,
      "Sync health: every store in the key's stores with its connection's state, its open incidents and the week's resolved ones, each with what Insyte already tried. Checked every 15 minutes. Needs `data.read`."
    )
  )
  .annotate(OpenApi.Title, "Connections")
{}
