import { Db } from "@insyte/database/Db"
import { mintId, type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { OfflinePlan } from "@insyte/modules/first-analysis/domain/FirstAnalysis"
import { Effect, Layer, Option, Schema } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../../platform/RequestDb.ts"
import { devOnly, notInProduction, workspaceParam } from "./shared.ts"

const refused = HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
const invalid = HttpServerResponse.jsonUnsafe({ error: { code: "invalid" } }, { status: 400 })

/**
 * `GET /api/__dev/agent/actions?workspace=<id>`: every row of one workspace's agent log (M15 step 6), oldest first,
 * whatever was decided: the log's page lists only what ran, and the agent sink's tests check what it asked and refused
 * too. No reasons or labels: what it was about, by id. Refused in production.
 */
const ActionsOf = HttpRouter.add(
  "GET",
  "/api/__dev/agent/actions",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) return refused
    const workspace = yield* workspaceParam
    const db = yield* Db
    const actions = yield* db.scopedFor((sql) =>
      sql<{
        id: string
        action: string
        principalKind: string
        trigger: string
        decision: string
        outcome: string
        refuseReason: string | null
        subjectType: string | null
        subjectId: string | null
        storeId: string | null
        model: string | null
        undoable: boolean
      }>`
        select id, action, principal_kind, trigger, decision, outcome, refuse_reason, subject_type, subject_id,
               store_id, model, undo_token_hash is not null as undoable
        from agent_actions order by created_at, id`
    ).pipe(Effect.provideService(CurrentWorkspace, { id: workspace as WorkspaceId }))
    return HttpServerResponse.jsonUnsafe({ actions })
  }).pipe(withRequestDb)
)

const Setup = Schema.Struct({
  /** The agent's stores (`agents.scopes.stores`); `null`, every store. */
  stores: Schema.optional(Schema.NullOr(Schema.Array(Schema.String.check(Schema.isMaxLength(64))))),
  /** The offline plan as the offline step writes it, on the workspace's first analysis; `null`, none. */
  offline: Schema.optional(Schema.NullOr(OfflinePlan)),
  /** The agent switched off (`agents.disabled_at`), or on again. */
  disabled: Schema.optional(Schema.Boolean)
})
const decodeSetup = Schema.decodeUnknownEffect(Setup)

/**
 * `POST /api/__dev/agent/setup?workspace=<id>` `{ stores?, offline?, disabled? }`: the workspace's agent held to these
 * stores or switched off, and the offline plan its first analysis keeps, as the onboarding's offline step would have agreed it; for the agent sink's
 * tests of the store fence and the opening hours without walking the onboarding. Locally and on a preview only.
 */
const AgentSetup = HttpRouter.add(
  "POST",
  "/api/__dev/agent/setup",
  Effect.gen(function*() {
    if (!(yield* devOnly)) return refused
    const workspace = { id: (yield* workspaceParam) as WorkspaceId }
    const request = yield* HttpServerRequest.HttpServerRequest
    const body = yield* request.json.pipe(Effect.flatMap(decodeSetup), Effect.option)
    if (Option.isNone(body)) return invalid
    const { stores, offline, disabled } = body.value
    const db = yield* Db
    yield* db.scopedFor((sql) =>
      Effect.gen(function*() {
        if (stores !== undefined) {
          const scopes = JSON.stringify(stores === null ? {} : { stores })
          yield* sql`insert into agents (id, workspace_id, scopes) values (${mintId("agt")}, ${workspace.id}, ${scopes})
                     on conflict (workspace_id) do update set scopes = excluded.scopes`
        }
        if (disabled !== undefined) {
          yield* sql`insert into agents (id, workspace_id, disabled_at)
                     values (${mintId("agt")}, ${workspace.id}, ${disabled ? new Date() : null})
                     on conflict (workspace_id) do update set disabled_at = excluded.disabled_at`
        }
        if (offline !== undefined) {
          yield* sql`insert into first_analyses (id, workspace_id, store_id)
                     select ${mintId("fan")}, ${workspace.id}, s.id from stores s order by s.created_at limit 1
                     on conflict (store_id) do nothing`
          yield* sql`update first_analyses set offline = ${offline === null ? null : JSON.stringify(offline)},
                                               offline_at = ${offline === null ? null : new Date()}`
        }
      })
    ).pipe(Effect.provideService(CurrentWorkspace, workspace))
    return HttpServerResponse.jsonUnsafe({ ok: true })
  }).pipe(Effect.orDie, withRequestDb)
)

const Parcel = Schema.Struct({
  carrier: Schema.String.check(Schema.isMaxLength(40)),
  trackingNumber: Schema.String.check(Schema.isMaxLength(60)),
  trackingUrl: Schema.String.check(Schema.isMaxLength(300)),
  status: Schema.Literals(["pending", "in_transit", "out_for_delivery", "delivered", "exception"]),
  expected: Schema.optional(Schema.String)
})

const Order = Schema.Struct({
  /** The customer it is theirs, by their e-mail address, in their own store. */
  email: Schema.String.check(Schema.isMaxLength(200)),
  number: Schema.String.check(Schema.isMaxLength(20)),
  status: Schema.Literals(["placed", "paid", "at_supplier", "shipped", "delivered", "cancelled", "refunded"]),
  /** Shopify's payment and fulfilment status; by default paid, and fulfilled when it has a parcel. */
  payment: Schema.optional(Schema.Literals(["pending", "paid", "partially_refunded", "refunded", "voided"])),
  fulfilment: Schema.optional(Schema.Literals(["unfulfilled", "partial", "fulfilled", "returned"])),
  /** Its parcel: the carrier, its tracking, AfterShip's state and when it expects it. */
  parcel: Schema.optional(Parcel),
  /** More parcels of the same order, each sent after the one before. */
  more: Schema.optional(Schema.Array(Parcel).check(Schema.isMaxLength(5))),
  /** The postcode on its shipping address (the customer agent's proof of an order). */
  postcode: Schema.optional(Schema.String.check(Schema.isMaxLength(10)))
})
const decodeOrder = Schema.decodeUnknownEffect(Order)

/**
 * `POST /api/__dev/agent/order?workspace=<id>` `{ email, number, status, payment?, fulfilment?, parcel?, more? }`: an order of one customer's, with
 * its parcel, as an import would have brought it in; for the agent sink's tests of the reply it sends from an order's
 * facts, each with a customer of its own. Locally and on a preview only.
 */
const AgentOrder = HttpRouter.add(
  "POST",
  "/api/__dev/agent/order",
  Effect.gen(function*() {
    if (!(yield* devOnly)) return refused
    const workspace = { id: (yield* workspaceParam) as WorkspaceId }
    const request = yield* HttpServerRequest.HttpServerRequest
    const body = yield* request.json.pipe(Effect.flatMap(decodeOrder), Effect.option)
    if (Option.isNone(body)) return invalid
    const o = body.value
    const db = yield* Db
    const orderId = mintId("ord")
    const made = yield* db.scopedFor((sql) =>
      Effect.gen(function*() {
        const [c] = yield* sql<{ id: string; storeId: string; name: string }>`
          select id, store_id, name from customers where lower(email) = lower(${o.email}) and deleted_at is null
          order by id desc limit 1`
        if (c === undefined) return false
        const parcels = [...(o.parcel === undefined ? [] : [o.parcel]), ...(o.more ?? [])]
        const fulfilment = o.fulfilment ?? (parcels.length > 0 ? "fulfilled" : "unfulfilled")
        yield* sql`
          insert into orders (id, workspace_id, store_id, shopify_id, number, customer_id, customer_name, customer_email,
                              status, payment_status, fulfillment_status, total_minor, subtotal_minor, shipping_minor,
                              tax_minor, discounts_minor, currency, placed_at, external_updated_at, shipping_address)
          values (${orderId}, ${workspace.id}, ${c.storeId}, ${`dev-${orderId}`}, ${o.number}, ${c.id}, ${c.name},
                  ${o.email}, ${o.status}, ${o.payment ?? "paid"}, ${fulfilment}, 4995, 4995, 0, 0, 0,
                  'EUR', now() - interval '3 days', now(),
                  ${o.postcode === undefined ? null : JSON.stringify({ postcode: o.postcode })}::jsonb)`
        for (const [i, p] of parcels.entries()) {
          const fulfilmentId = mintId("ful")
          yield* sql`
            insert into fulfilments (id, workspace_id, store_id, order_id, shopify_id, status, carrier, tracking_number,
                                     tracking_url, shipped_at)
            values (${fulfilmentId}, ${workspace.id}, ${c.storeId}, ${orderId}, ${`dev-${fulfilmentId}`}, 'success',
                    ${p.carrier}, ${p.trackingNumber}, ${p.trackingUrl},
                    now() - interval '2 days' + ${i} * interval '1 hour')`
          yield* sql`
            insert into deliveries (id, workspace_id, order_id, fulfilment_id, carrier, tracking_number, status,
                                    estimated_delivery, delivered_at)
            values (${mintId("dlv")}, ${workspace.id}, ${orderId}, ${fulfilmentId}, ${p.carrier}, ${p.trackingNumber},
                    ${p.status}, ${p.expected === undefined ? null : new Date(p.expected)},
                    ${p.status === "delivered" ? new Date() : null})`
        }
        return true
      })
    ).pipe(Effect.provideService(CurrentWorkspace, workspace))
    return made ? HttpServerResponse.jsonUnsafe({ orderId }) : invalid
  }).pipe(Effect.orDie, withRequestDb)
)

export const AgentRoutes = Layer.mergeAll(ActionsOf, AgentSetup, AgentOrder)
