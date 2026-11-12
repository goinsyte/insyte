import { Schema } from "effect"
import { UndoTicket } from "../../shared/domain/Undo.ts"

/*
 * Supplier statements, the brand's side (M13 step 6; domain.md §5, widgets/06 §0.5): per supplier and month, the lines
 * it shipped at their cost price less the supplier-fault returns that were refunded, in the workspace's currency. A
 * closed month is `processing` ("Wordt verwerkt") until the brand marks it `paid`; the running month is `open`
 * ("Lopend"), read live and never stored. The supplier's own view is the portal's (M16).
 */

const Month = Schema.String.check(Schema.isPattern(/^\d{4}-(0[1-9]|1[0-2])$/))
export type Month = typeof Month.Type

export const StatementStatus = Schema.Literals(["open", "processing", "paid"])
export type StatementStatus = typeof StatementStatus.Type

/** Why a line counts nothing: no cost price on its product, or no rate into the workspace's currency that day. */
export const Missing = Schema.Literals(["cost", "rate"])

export const StatementLine = Schema.Struct({
  id: Schema.String,
  kind: Schema.Literals(["shipped", "correction"]),
  orderId: Schema.NullOr(Schema.String),
  orderLineId: Schema.NullOr(Schema.String),
  orderNumber: Schema.String,
  /** `YYYY-MM-DD` in the workspace's timezone: the day it shipped, or the day its return was refunded. */
  day: Schema.String,
  title: Schema.String,
  qty: Schema.Int,
  /** In the statement's currency; `null` when `missing`. */
  unitCostMinor: Schema.NullOr(Schema.Int),
  /** Negative for a correction; 0 when `missing`. */
  totalMinor: Schema.Int,
  missing: Schema.NullOr(Missing),
  /** A correction's return reason, as the workspace names it. */
  reason: Schema.NullOr(Schema.String),
  returnId: Schema.NullOr(Schema.String)
})
export type StatementLine = typeof StatementLine.Type

export class StatementRow extends Schema.Class<StatementRow>("suppliers/StatementRow")({
  /** `null` for the running month, which is not stored. */
  id: Schema.NullOr(Schema.String),
  supplierId: Schema.String,
  supplierName: Schema.String,
  month: Month,
  status: StatementStatus,
  currency: Schema.String,
  shippedMinor: Schema.Int,
  correctionsMinor: Schema.Int,
  totalMinor: Schema.Int,
  shippedLines: Schema.Int,
  /** Lines that count nothing for want of a cost price or a rate. */
  missingLines: Schema.Int,
  /** `YYYY-MM-DD`: the 15th of the month after. */
  payDay: Schema.String,
  closedAt: Schema.NullOr(Schema.Finite),
  paidAt: Schema.NullOr(Schema.Finite),
  paidReference: Schema.NullOr(Schema.String),
  /** The statement's PDF (`GET /api/files/:id`), once it is made. */
  invoiceFileId: Schema.NullOr(Schema.String)
}) {}

export class StatementList extends Schema.Class<StatementList>("suppliers/StatementList")({
  supplier: Schema.Struct({ id: Schema.String, name: Schema.String }),
  /** Newest first; the running month leads while it has lines. */
  rows: Schema.Array(StatementRow),
  summary: Schema.Struct({
    currency: Schema.String,
    /** "Betaald dit jaar": the paid statements of this calendar year. */
    paidYtdMinor: Schema.Int,
    /** The day of the month after on which a month is paid. */
    payDay: Schema.Int
  })
}) {}

export class StatementDetail extends Schema.Class<StatementDetail>("suppliers/StatementDetail")({
  statement: StatementRow,
  /** By day. */
  lines: Schema.Array(StatementLine)
}) {}

export class StatementChange extends Schema.Class<StatementChange>("suppliers/StatementChange")({
  statement: StatementRow,
  undo: Schema.NullOr(UndoTicket)
}) {}

export const StatementsInput = Schema.Struct({ supplierId: Schema.String })

export const StatementInput = Schema.Struct({ supplierId: Schema.String, month: Month })

/** Marking a closed statement paid (or, with `paid: false`, back to be paid), with the payment's reference. */
export const MarkPaidInput = Schema.Struct({
  id: Schema.String,
  paid: Schema.optional(Schema.Boolean),
  reference: Schema.optional(Schema.String.check(Schema.isMaxLength(120)))
})

/** For `Shared.undo`: the statement as it was before it was marked. */
export const StatementRestore = Schema.Struct({
  kind: Schema.Literal("statement_paid"),
  id: Schema.String,
  status: Schema.Literals(["processing", "paid"]),
  paidAt: Schema.NullOr(Schema.Finite),
  paidBy: Schema.NullOr(Schema.String),
  paidReference: Schema.NullOr(Schema.String)
})
