import { Schema } from "effect"

/*
 * The first analysis (M6.5; widgets/01 analysis step, `lib/first-analysis.ts` shapes): what Insyte says straight after
 * a store's first import. Until mail is read (M15) it is always the early read: what the store's setup already tells
 * (delivery promises, countries, policies, payment methods), each prediction naming the fact it came from, and what
 * Insyte watches for, with how much data each watch still waits on. It never names a problem the data does not show.
 */

export const PreparedId = Schema.Literals(["automation", "agent", "sheet"])
export type PreparedId = typeof PreparedId.Type

/** One source the reading goes through, ticked off as it is read. */
export const Read = Schema.Struct({
  id: Schema.Literals(["orders", "products", "policies"]),
  label: Schema.String,
  done: Schema.Boolean
})
export type Read = typeof Read.Type

/** One fact read from the setup, and what it predicts; `prepares` names what it makes ready. */
export const Prediction = Schema.Struct({
  read: Schema.String,
  expect: Schema.String,
  prepares: Schema.optional(PreparedId)
})
export type Prediction = typeof Prediction.Type

/** What Insyte waits for before it judges something: `have` of `need`. */
export const Watch = Schema.Struct({
  label: Schema.String,
  /** What the operator sees once it is in ("dan zie je …"). */
  reveals: Schema.String,
  have: Schema.Int,
  need: Schema.Int
})
export type Watch = typeof Watch.Type

/** A delivery time a product page or the shipping policy promises, in days. */
export const DeliveryPromise = Schema.Struct({
  min: Schema.Int,
  max: Schema.Int,
  working: Schema.Boolean,
  source: Schema.Literals(["product", "policy"])
})
export type DeliveryPromise = typeof DeliveryPromise.Type

/** The facts the early read stands on: from Shopify (countries, policies) and from the mirror. */
export const SetupFacts = Schema.Struct({
  /** Countries the store ships to; `null` where Shopify did not say. */
  shipsTo: Schema.NullOr(Schema.Array(Schema.String)),
  /** The shipping and refund policies' text; `null` where they could not be read (the scope is missing). */
  policies: Schema.NullOr(
    Schema.Struct({ shipping: Schema.NullOr(Schema.String), refund: Schema.NullOr(Schema.String) })
  ),
  promises: Schema.Array(DeliveryPromise),
  /** Payment gateways the store's orders were paid through. */
  gateways: Schema.Array(Schema.String),
  orders: Schema.Int,
  products: Schema.Int,
  customers: Schema.Int,
  /** Days since the store's first order Insyte holds. */
  days: Schema.Int,
  /** Parcels delivered with a delivery date, and refunds with a reason: what the watches count. */
  delivered: Schema.Int,
  refundReasons: Schema.Int
})
export type SetupFacts = typeof SetupFacts.Type

export const Prepared = Schema.Struct({ title: Schema.String, does: Schema.String })

/** The step's view of the analysis. */
export class FirstAnalysisView extends Schema.Class<FirstAnalysisView>("firstAnalysis/View")({
  /** `none` before it was started (or without a store), `reading` while it reads. */
  state: Schema.Literals(["none", "reading", "early", "failed"]),
  store: Schema.Struct({ products: Schema.Int, customers: Schema.Int, orders: Schema.Int, days: Schema.Int }),
  /** Whether the history would be enough to judge if mail were read: the title says why there is no finding. */
  history: Schema.Literals(["young", "enough"]),
  reads: Schema.Array(Read),
  predictions: Schema.Array(Prediction),
  watch: Schema.Array(Watch),
  prepared: Schema.Struct({ automation: Prepared, agent: Prepared, sheet: Prepared }),
  /** What the operator chose, once `prepare` ran. */
  chosen: Schema.NullOr(Schema.Struct({
    ids: Schema.Array(PreparedId),
    answers: Schema.Record(Schema.String, Schema.String)
  }))
}) {}

export const Answers = Schema.Struct({
  fulfilment: Schema.Literals(["one", "many", "self"]),
  reply: Schema.Literals(["ask", "auto"])
})

export const PrepareInput = Schema.Struct({ ids: Schema.Array(PreparedId), answers: Answers })
export type PrepareInput = typeof PrepareInput.Type

/** The analysis has not finished reading: there is nothing to prepare from yet. */
export class AnalysisNotReady extends Schema.TaggedError<AnalysisNotReady>()("AnalysisNotReady", {}) {}
