import { Schema } from "effect"
import { Carrier, ProblemKind, StockReporting, SupplierView } from "./Portal.ts"

/*
 * What the portal's forms send (widgets/06 Part A, "Forms"). The schema is the form's: the console checks the same
 * shape before it calls, the server checks it again and answers the rules only it can know.
 */

const Trimmed = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200))
const Ids = Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(500))

export const OrdersListInput = Schema.Struct({
  view: Schema.optional(SupplierView),
  /** Only the orders with a line of this product ("Wacht op jou"). */
  productId: Schema.optional(Schema.String),
  limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 500 })))
})
export type OrdersListInput = typeof OrdersListInput.Type

export const OrderRef = Schema.Struct({ orderId: Schema.String })
export const ProductRef = Schema.Struct({ productId: Schema.String })

export const AcceptInput = Schema.Struct({ orderIds: Ids })
export type AcceptInput = typeof AcceptInput.Type

/** `ShipSupplierOrdersInput`: one carrier per batch in the UI, but each row carries its own. */
export const ShipInput = Schema.Struct({
  items: Schema.Array(Schema.Struct({
    orderId: Schema.String,
    carrier: Carrier,
    tracking: Trimmed,
    /** The supplier's own lines in the parcel; absent, every one of them. */
    lineIds: Schema.optional(Schema.Array(Schema.String).check(Schema.isMinLength(1)))
  })).check(Schema.isMinLength(1), Schema.isMaxLength(500))
})
export type ShipInput = typeof ShipInput.Type

/** `ReportSupplierProblemInput`: a new date is required for a delay or a stock problem. */
export const ReportProblemInput = Schema.Struct({
  orderId: Schema.String,
  kind: ProblemKind,
  note: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(1000)),
  /** `YYYY-MM-DD`, the supplier's local date; the hand-off moves to its 17:00. */
  newDate: Schema.optional(Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/)))
})
export type ReportProblemInput = typeof ReportProblemInput.Type

/** `SaveSupplierStockInput`. */
export const SaveStockInput = Schema.Struct({
  productId: Schema.String,
  variantStock: Schema.Record(Schema.String, Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  leadDays: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 30 })))
})
export type SaveStockInput = typeof SaveStockInput.Type

/** `SetStockReportingInput`. */
export const SetReportingInput = Schema.Struct({ productId: Schema.String, mode: StockReporting })
export type SetReportingInput = typeof SetReportingInput.Type

export const QualityListInput = Schema.Struct({ productId: Schema.optional(Schema.String) })
export type QualityListInput = typeof QualityListInput.Type

export const SubmitCheckInput = Schema.Struct({
  checkId: Schema.String,
  fileIds: Schema.Array(Schema.String).check(Schema.isMaxLength(40)),
  batch: Schema.optional(Schema.String.check(Schema.isMaxLength(200))),
  note: Schema.optional(Schema.String.check(Schema.isMaxLength(2000)))
})
export type SubmitCheckInput = typeof SubmitCheckInput.Type

export const UndoInput = Schema.Struct({ token: Schema.String })
