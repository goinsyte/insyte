import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { NotFoundV1, RefundOverLimitV1, ScopeMissingV1 } from "../Errors.ts"
import { ById, WriteErrors, Writes } from "../Requests.ts"

/* Returns and claims (M9): the queue, one return, and every move from starting one to settling it. */

/** A return or claim (M9.1): what goes back, why, what the shopper asked for, and where it stands. */
export const Return = Schema.Struct({
  id: Schema.String,
  number: Schema.String,
  kind: Schema.String.annotate({
    description: "return (something comes back) or claim (a problem, maybe nothing comes back)."
  }),
  order: Schema.Struct({ id: Schema.String, number: Schema.String }),
  store_id: Schema.String,
  customer: Schema.Struct({
    id: Schema.NullOr(Schema.String),
    name: Schema.String,
    email: Schema.NullOr(Schema.String)
  }),
  status: Schema.String.annotate({
    description: "review, awaiting_parcel, in_transit, received, ready, resolved or rejected."
  }),
  reason: Schema.Struct({ id: Schema.String, label: Schema.String }),
  note: Schema.String.annotate({ description: "The shopper's own words." }),
  requested_resolution: Schema.String.annotate({
    description: "refund, exchange, gift_card, replacement or discount."
  }),
  units: Schema.Int,
  amount: Schema.Struct({ amount_minor: Schema.Int, currency: Schema.String }),
  review_by: Schema.String,
  late: Schema.Boolean,
  resolution: Schema.NullOr(Schema.Struct({
    kind: Schema.String,
    amount_minor: Schema.Int,
    resolved_at: Schema.String
  })),
  rejected_reason: Schema.NullOr(Schema.String),
  label: Schema.NullOr(Schema.Struct({
    state: Schema.String.annotate({
      description: "requested (made at the carrier in a few seconds), issued, or failed (with the carrier's reason)."
    }),
    carrier: Schema.NullOr(Schema.String),
    tracking: Schema.NullOr(Schema.String),
    tracking_url: Schema.NullOr(Schema.String),
    reason: Schema.NullOr(Schema.String)
  })).annotate({ description: "The return label, once asked for." }),
  created_at: Schema.String
}).annotate({ identifier: "Return" })

export const ReturnPageV1 = Schema.Struct({
  data: Schema.Array(Return),
  counts: Schema.Struct({
    total: Schema.Int,
    review: Schema.Int,
    late: Schema.Int,
    awaiting: Schema.Int,
    ready: Schema.Int
  })
})

export const ReturnDetailV1 = Schema.Struct({
  ...Return.fields,
  lines: Schema.Array(Schema.Struct({
    id: Schema.String,
    order_line_id: Schema.String,
    title: Schema.String,
    variant_title: Schema.String,
    quantity: Schema.Int,
    condition: Schema.NullOr(Schema.String)
  })),
  window: Schema.Struct({ inside: Schema.Boolean, days: Schema.Int, closes_on: Schema.String }),
  allowed_resolutions: Schema.Array(Schema.Struct({ kind: Schema.String, amount_minor: Schema.Int }))
}).annotate({ identifier: "ReturnDetail" })

export const ReturnStatusFilter = Schema.Literals([
  "review",
  "awaiting_parcel",
  "in_transit",
  "received",
  "ready",
  "resolved",
  "rejected"
])

export class ReturnsGroup extends HttpApiGroup.make("returns")
  .add(
    HttpApiEndpoint.get("returns", "/returns", {
      query: Schema.Struct({ status: Schema.optional(ReturnStatusFilter) }),
      success: ReturnPageV1,
      error: [ScopeMissingV1]
    }).annotate(
      OpenApi.Description,
      "Returns and claims, newest first, up to 500, or those in one status; with the queue's counts. Needs `returns.read`."
    ),
    HttpApiEndpoint.get("return", "/returns/:id", {
      params: ById,
      success: ReturnDetailV1,
      error: [ScopeMissingV1, NotFoundV1]
    }).annotate(
      OpenApi.Description,
      "One return with its lines, its window and the resolutions it allows with what each moves. Needs `returns.read`."
    ),
    HttpApiEndpoint.post("start", "/returns", {
      headers: Writes,
      payload: Schema.Struct({
        order_id: Schema.String,
        lines: Schema.Array(Schema.Struct({ line_id: Schema.String, quantity: Schema.Int })),
        reason_id: Schema.String.annotate({ description: "One of the workspace's reasons: too_small, damaged, …" }),
        requested_resolution: Schema.Literals(["refund", "exchange", "gift_card", "replacement", "discount"]),
        note: Schema.optional(Schema.String),
        exchange_to: Schema.optional(Schema.String)
      }),
      success: Return,
      error: WriteErrors
    }).annotate(
      OpenApi.Description,
      "Starts a return for a shopper; it waits for review. A claim reason makes it a claim. Lines already in a return, or whose product rule allows no return, are refused (`422`). Needs `returns.write`."
    ),
    HttpApiEndpoint.post("approve", "/returns/:id/approve", {
      params: ById,
      headers: Writes,
      payload: Schema.Struct({
        keep_item: Schema.optional(Schema.Boolean).annotate({
          description: "A claim settled without sending anything back."
        })
      }),
      success: Return,
      error: WriteErrors
    }).annotate(OpenApi.Description, "Approves a return in review. Needs `returns.write` and `returns.approve`."),
    HttpApiEndpoint.post("reject", "/returns/:id/reject", {
      params: ById,
      headers: Writes,
      payload: Schema.Struct({ reason: Schema.String.annotate({ description: "What the shopper reads." }) }),
      success: Return,
      error: WriteErrors
    }).annotate(OpenApi.Description, "Rejects a return, with the reason. Needs `returns.write` and `returns.approve`."),
    HttpApiEndpoint.post("label", "/returns/:id/label", {
      params: ById,
      headers: Writes,
      success: Return,
      error: WriteErrors
    }).annotate(
      OpenApi.Description,
      "Asks for a return label from the carrier the return address names; it is made a few seconds later (`label.state`). Refused (`409`) where no carrier is set up (`labels_unavailable`) or a label cannot be made (`no_return_address`, `no_shopper_address`). Needs `returns.write`."
    ),
    HttpApiEndpoint.post("tracking", "/returns/:id/tracking", {
      params: ById,
      headers: Writes,
      payload: Schema.Struct({
        carrier: Schema.Literals(["PostNL", "DHL", "DPD", "UPS"]),
        tracking: Schema.String.annotate({ description: "The tracking number the shopper sent the parcel with." })
      }),
      success: Return,
      error: WriteErrors
    }).annotate(
      OpenApi.Description,
      "The shopper sent the parcel themselves (\"zelf versturen\"): its carrier and tracking number, followed like a label's. Needs `returns.write`."
    ),
    HttpApiEndpoint.post("receive", "/returns/:id/receive", {
      params: ById,
      headers: Writes,
      success: Return,
      error: WriteErrors
    }).annotate(OpenApi.Description, "Marks the parcel received. Needs `returns.write`."),
    HttpApiEndpoint.post("inspect", "/returns/:id/inspect", {
      params: ById,
      headers: Writes,
      payload: Schema.Struct({
        lines: Schema.optional(Schema.Array(Schema.Struct({
          line_id: Schema.String,
          condition: Schema.Literals(["ok", "damaged", "missing"]),
          restock: Schema.Boolean
        }))).annotate({ description: "Per line; without, every line is in order and goes back on the shelf." })
      }),
      success: Return,
      error: WriteErrors
    }).annotate(
      OpenApi.Description,
      "Records the inspection; the return is then ready to settle. Needs `returns.write`."
    ),
    HttpApiEndpoint.post("resolve", "/returns/:id/resolve", {
      params: ById,
      headers: Writes,
      payload: Schema.Struct({
        resolution: Schema.Literals(["refund", "exchange", "gift_card", "replacement", "discount"]),
        exchange_to: Schema.optional(Schema.String)
      }),
      success: Return,
      error: [...WriteErrors, RefundOverLimitV1]
    }).annotate(
      OpenApi.Description,
      "Settles a return that is ready, with a resolution it allows, at the amount the rules give. A refund goes back through the order's payments and is irreversible: send an `Idempotency-Key`, which also makes Shopify refund once. Needs `returns.write`, and `refunds.write` within the key's limit for a refund."
    )
  )
  .annotate(OpenApi.Title, "Returns")
{}
