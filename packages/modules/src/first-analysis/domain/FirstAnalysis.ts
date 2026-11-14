import { Schema } from "effect"
import { UndoTicket } from "../../shared/domain/Undo.ts"

/*
 * The first analysis (M6.5, M15 step 5; widgets/01 analysis and offline steps, `lib/first-analysis.ts` shapes): what
 * Insyte says straight after a store's first import. With enough history and the team's mail in Insyte it names one
 * finding: the biggest problem the store's own mail and parcels show, each piece of evidence with its basis, and the
 * fix ready to switch on. Without, it is the early read: what the store's setup already tells (delivery promises,
 * countries, policies, payment methods), each prediction naming the fact it came from, and what Insyte watches for,
 * with how much data each watch still waits on. It never names a problem the data does not show.
 */

export const PreparedId = Schema.Literals(["automation", "agent", "sheet"])
export type PreparedId = typeof PreparedId.Type

/** One source the reading goes through, ticked off as it is read. */
export const Read = Schema.Struct({
  id: Schema.Literals(["orders", "mail", "products", "policies"]),
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

/**
 * What the inbox showed over the window (M15 step 5), counts only: no mail's words are kept. `mails` are the customer
 * conversations with a mail in, `status` those about where an order is, `linked` those whose sender has an order of
 * this store placed before the mail, `early` those of them sent before the parcel was delivered, and `dayLow` to
 * `dayHigh` the middle half of how many days after the order they came.
 */
export const MailFacts = Schema.Struct({
  window: Schema.Int,
  mails: Schema.Int,
  status: Schema.Int,
  linked: Schema.Int,
  early: Schema.Int,
  dayLow: Schema.Int,
  dayHigh: Schema.Int
})
export type MailFacts = typeof MailFacts.Type

/** Delivered parcels per country over the window: how many, and the median days from order to delivery. */
export const CountryDelivery = Schema.Struct({ country: Schema.String, delivered: Schema.Int, days: Schema.Finite })
export type CountryDelivery = typeof CountryDelivery.Type

/** The facts the reading stands on: from Shopify (countries, policies), the mirror, and the inbox. */
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
  refundReasons: Schema.Int,
  /** The inbox over the window; `null` where the workspace has no mailbox. Absent on a reading from before M15. */
  mail: Schema.optional(Schema.NullOr(MailFacts)),
  /** Delivery per country over the window. Absent on a reading from before M15. */
  countries: Schema.optional(Schema.Array(CountryDelivery))
})
export type SetupFacts = typeof SetupFacts.Type

/** One piece of a finding's evidence: the figure as shown, what it means, and where it was read. */
export const Evidence = Schema.Struct({ figure: Schema.String, says: Schema.String, basis: Schema.String })

/** The one problem worth fixing first, its evidence, the standard fix, and its effect worked out from the evidence. */
export const Finding = Schema.Struct({
  headline: Schema.String,
  evidence: Schema.Array(Evidence),
  fix: Schema.Struct({ title: Schema.String, why: Schema.String }),
  effect: Schema.Struct({ figure: Schema.String, basis: Schema.String })
})
export type Finding = typeof Finding.Type

/** When the operator is usually offline (the offline step's tiles). */
export const OfflineWindow = Schema.Literals(["evening", "late", "shifts"])
export type OfflineWindow = typeof OfflineWindow.Type

/** What the offline step may set: Zelf doen, or Klaarzetten voor mij (Eerst vragen). */
export const OfflineLevel = Schema.Literals(["auto", "ask"])
export type OfflineLevel = typeof OfflineLevel.Type

/** One day of the customer agent's opening hours, Monday first: open is when someone is online. */
export const Hours = Schema.Struct({ open: Schema.Boolean, from: Schema.String, to: Schema.String })
export type Hours = typeof Hours.Type

/** The offline plan as agreed: the window, the levels set, the hours they imply, and the policy version written. */
export const OfflinePlan = Schema.Struct({
  window: OfflineWindow,
  levels: Schema.Record(Schema.String, OfflineLevel),
  hours: Schema.Array(Hours),
  version: Schema.NullOr(Schema.Int),
  at: Schema.Finite
})
export type OfflinePlan = typeof OfflinePlan.Type

export const Prepared = Schema.Struct({ title: Schema.String, does: Schema.String })

/** The step's view of the analysis. */
export class FirstAnalysisView extends Schema.Class<FirstAnalysisView>("firstAnalysis/View")({
  /** `none` before it was started (or without a store), `reading` while it reads, `found` with a finding. */
  state: Schema.Literals(["none", "reading", "early", "found", "failed"]),
  store: Schema.Struct({
    products: Schema.Int,
    customers: Schema.Int,
    orders: Schema.Int,
    days: Schema.Int,
    /** Customer conversations read from the inbox (0 without one). */
    mails: Schema.Int
  }),
  /** Whether the history would be enough to judge if mail were read: the title says why there is no finding. */
  history: Schema.Literals(["young", "enough"]),
  reads: Schema.Array(Read),
  /** Present when the state is `found`. */
  finding: Schema.NullOr(Finding),
  predictions: Schema.Array(Prediction),
  watch: Schema.Array(Watch),
  prepared: Schema.Struct({ automation: Prepared, agent: Prepared, sheet: Prepared }),
  /** What the operator chose, once `prepare` ran. */
  chosen: Schema.NullOr(Schema.Struct({
    ids: Schema.Array(PreparedId),
    answers: Schema.Record(Schema.String, Schema.String)
  })),
  /** What "Klaarzetten" made, by id: the automation draft and the sheet. The agent waits on the customer agent. */
  made: Schema.Struct({ automationId: Schema.NullOr(Schema.String), sheetId: Schema.NullOr(Schema.String) }),
  /** The offline plan, once agreed. */
  offline: Schema.NullOr(OfflinePlan)
}) {}

export const Answers = Schema.Struct({
  fulfilment: Schema.Literals(["one", "many", "self"]),
  reply: Schema.Literals(["ask", "auto"])
})

export const PrepareInput = Schema.Struct({ ids: Schema.Array(PreparedId), answers: Answers })
export type PrepareInput = typeof PrepareInput.Type

export const AgreeOfflineInput = Schema.Struct({
  window: OfflineWindow,
  /** By catalogue id; only the offline step's actions, never a locked one at `auto`. */
  levels: Schema.Record(Schema.String, OfflineLevel),
  /** The autonomy policy's version the step showed: a save made since refuses the plan (`AutonomyStale`). */
  baseVersion: Schema.Int
})
export type AgreeOfflineInput = typeof AgreeOfflineInput.Type

/** The plan saved: the analysis with it, and the undo that puts the autonomy policy back as it was. */
export class OfflineAgreed extends Schema.Class<OfflineAgreed>("firstAnalysis/OfflineAgreed")({
  analysis: FirstAnalysisView,
  undo: Schema.NullOr(UndoTicket)
}) {}

/** The analysis has not finished reading: there is nothing to prepare from yet. */
export class AnalysisNotReady extends Schema.TaggedError<AnalysisNotReady>()("AnalysisNotReady", {}) {}

/** The person's onboarding is not on the offline step: the plan is agreed there only, later on Zelfstandigheid. */
export class OfflineClosed extends Schema.TaggedError<OfflineClosed>()("OfflineClosed", {}) {}
