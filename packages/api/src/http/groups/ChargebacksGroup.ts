import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { NotFoundV1, ScopeMissingV1 } from "../Errors.ts"
import { ById } from "../Requests.ts"

/* Chargebacks (M13): the cases by deadline, and one with its evidence pack and timeline. */

/** A chargeback (M13): a payment the shopper disputed at Stripe, Klarna or PayPal, or a case opened by hand. */
export const Chargeback = Schema.Struct({
  id: Schema.String,
  case_number: Schema.String,
  provider: Schema.Literals(["stripe", "klarna", "paypal"]),
  from_provider: Schema.Boolean.annotate({
    description: "The case came in through a payment connection; false for one opened by hand in Insyte."
  }),
  status: Schema.Literals(["open", "awaiting_evidence", "submitted", "won", "lost"]),
  reason: Schema.String.annotate({
    description: "item_not_received, not_as_described, unauthorized, duplicate or other."
  }),
  reason_code: Schema.String.annotate({ description: "The reason as the provider or the team named it." }),
  amount: Schema.Struct({ amount_minor: Schema.Int, currency: Schema.String }),
  customer: Schema.Struct({ id: Schema.NullOr(Schema.String), name: Schema.String }),
  order: Schema.NullOr(Schema.Struct({ id: Schema.String, number: Schema.NullOr(Schema.String) })),
  store_id: Schema.NullOr(Schema.String),
  deadline_at: Schema.String.annotate({ description: "When the evidence must be in at the provider." }),
  opened_at: Schema.String,
  submitted_at: Schema.NullOr(Schema.String),
  outcome_at: Schema.NullOr(Schema.String),
  note: Schema.String,
  evidence_count: Schema.Int
}).annotate({ identifier: "Chargeback" })

export const ChargebackStatsV1 = Schema.Struct({
  open: Schema.Int,
  won: Schema.Int,
  decided: Schema.Int,
  won_pct: Schema.Int.annotate({ description: "Won out of decided, in whole percent." }),
  recovered: Schema.Struct({ amount_minor: Schema.Int, currency: Schema.String })
})

export const ChargebackPageV1 = Schema.Struct({
  data: Schema.Array(Chargeback),
  counts: Schema.Struct({
    all: Schema.Int,
    action_required: Schema.Int,
    submitted: Schema.Int,
    won: Schema.Int,
    lost: Schema.Int
  }),
  stats: ChargebackStatsV1
}).annotate({ identifier: "ChargebackPage" })

export const ChargebackDetailV1 = Schema.Struct({
  ...Chargeback.fields,
  evidence: Schema.Array(Schema.Struct({
    id: Schema.String,
    kind: Schema.String,
    source: Schema.Literals(["insyte", "upload"]),
    name: Schema.String,
    size_bytes: Schema.Int,
    file_id: Schema.NullOr(Schema.String),
    added_at: Schema.String
  })).annotate({ description: "The pack, in its order." }),
  timeline: Schema.Array(Schema.Struct({
    id: Schema.String,
    at: Schema.String,
    kind: Schema.String,
    actor: Schema.Struct({ kind: Schema.String, name: Schema.String }),
    data: Schema.Record(Schema.String, Schema.Unknown)
  })).annotate({ description: "Oldest first." })
}).annotate({ identifier: "ChargebackDetail" })

export const ChargebackTabV1 = Schema.Literals(["action_required", "submitted", "won", "lost"])

export class ChargebacksGroup extends HttpApiGroup.make("chargebacks")
  .add(
    HttpApiEndpoint.get("chargebacks", "/chargebacks", {
      query: Schema.Struct({
        tab: Schema.optional(ChargebackTabV1),
        provider: Schema.optional(Schema.Literals(["stripe", "klarna", "paypal"]))
      }),
      success: ChargebackPageV1,
      error: [ScopeMissingV1]
    }).annotate(
      OpenApi.Description,
      "Chargebacks, nearest deadline first, up to 500: action_required (open or waiting for evidence), submitted, won or lost; with each tab's count and the workspace's record. Needs `chargebacks.read`."
    ),
    HttpApiEndpoint.get("chargeback", "/chargebacks/:id", {
      params: ById,
      success: ChargebackDetailV1,
      error: [ScopeMissingV1, NotFoundV1]
    }).annotate(
      OpenApi.Description,
      "One chargeback with its evidence pack and its timeline. Needs `chargebacks.read`."
    )
  )
  .annotate(OpenApi.Title, "Chargebacks")
{}
