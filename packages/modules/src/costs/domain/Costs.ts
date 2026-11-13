import { Schema } from "effect"
import { UndoTicket } from "../../shared/domain/Undo.ts"

/*
 * Kosten as the console, `/v1` and MCP read and change them (M13 step 5; domain.md §10.1, widgets/02 `/costs`). The
 * kinds are the design's (`lib/costs.ts`). Amounts are integer minor units in the workspace's currency; a month is
 * `YYYY-MM`, a calendar month in store time (the facts' days are already in it).
 */

export const CostKind = Schema.Literals(["fixed", "per_order", "percent", "ads"])
export type CostKind = typeof CostKind.Type

/** Where an ad line's spend is read from; every other kind is `manual`. */
export const CostSource = Schema.Literals(["manual", "meta", "google_ads"])
export type CostSource = typeof CostSource.Type

export const Month = Schema.String.check(Schema.isPattern(/^\d{4}-(0[1-9]|1[0-2])$/))
export type Month = typeof Month.Type

/**
 * One line's cost in one month, and where it comes from: `typed` by someone, read from the ad `account`, worked out by
 * the line's `rule` (a share of revenue, an amount per order), or `none` (nothing typed and nothing to read).
 */
export const CostCell = Schema.Struct({
  amountMinor: Schema.Int,
  typed: Schema.Boolean,
  source: Schema.Literals(["typed", "account", "rule", "none"])
})
export type CostCell = typeof CostCell.Type

export const CostLine = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  kind: CostKind,
  /** `percent`: the share of revenue, 0 to 100. */
  rate: Schema.NullOr(Schema.Finite),
  /** `per_order`: the amount per counted order. */
  rateMinor: Schema.NullOr(Schema.Int),
  source: CostSource,
  /** An ad line whose account is connected: its untyped months are what the account reports. */
  readsFromSource: Schema.Boolean,
  /** Whether any month of the line was typed (for "Weer uit … lezen"). */
  hasTyped: Schema.Boolean,
  /** Per month of the list, keyed `YYYY-MM`. */
  cells: Schema.Record(Schema.String, CostCell)
})
export type CostLine = typeof CostLine.Type

/** A month's figures (domain.md §10.1): revenue and orders from the facts, the costs from the lines. */
export const MonthFigures = Schema.Struct({
  month: Month,
  revenueMinor: Schema.Int,
  orders: Schema.Int,
  adsMinor: Schema.Int,
  otherMinor: Schema.Int,
  costsMinor: Schema.Int,
  netMinor: Schema.Int,
  /** net / revenue, 0 when there is no revenue. */
  margin: Schema.Finite,
  /** revenue / ads, 0 when there is no ad spend. */
  roas: Schema.Finite
})
export type MonthFigures = typeof MonthFigures.Type

export class CostsList extends Schema.Class<CostsList>("costs/CostsList")({
  /** The workspace's currency, every amount's. */
  currency: Schema.String,
  /** Oldest first; the last is `current` when the range runs to now. */
  months: Schema.Array(Month),
  /** The month in progress, in the workspace's time. */
  current: Month,
  lines: Schema.Array(CostLine),
  figures: Schema.Array(MonthFigures)
}) {}

export class CostsFigures extends Schema.Class<CostsFigures>("costs/CostsFigures")({
  currency: Schema.String,
  figures: Schema.Array(MonthFigures)
}) {}

/** Without a range: the five months up to the current one, as the design shows. */
export const ListInput = Schema.Struct({ from: Schema.optional(Month), to: Schema.optional(Month) })
export const FiguresInput = Schema.Struct({
  months: Schema.Array(Month).check(Schema.isMinLength(1), Schema.isMaxLength(36))
})
export const IdInput = Schema.Struct({ id: Schema.String })

/**
 * "Kostenpost toevoegen". `rate` for a share of revenue, `rateMinor` for an amount per order; `amountPerMonthMinor`
 * is typed into every month of `months` (the list's) for a fixed or ad line. `source` names an ad line's account.
 */
export const CreateInput = Schema.Struct({
  name: Schema.String,
  kind: CostKind,
  rate: Schema.optional(Schema.Finite),
  rateMinor: Schema.optional(Schema.Int),
  amountPerMonthMinor: Schema.optional(Schema.Int),
  months: Schema.optional(Schema.Array(Month).check(Schema.isMaxLength(36))),
  source: Schema.optional(CostSource)
})

/** "Opslaan" in the line's dialog: its name, kind and rule. */
export const UpdateInput = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  kind: CostKind,
  rate: Schema.optional(Schema.Finite),
  rateMinor: Schema.optional(Schema.Int),
  source: Schema.optional(CostSource)
})

/** A month typed (`amountMinor`) or cleared (`null`). */
export const SetAmountInput = Schema.Struct({
  lineId: Schema.String,
  month: Month,
  amountMinor: Schema.NullOr(Schema.Int)
})

export class CostChange extends Schema.Class<CostChange>("costs/CostChange")({
  id: Schema.String,
  /** `null` where nothing changed. */
  undo: Schema.NullOr(UndoTicket)
}) {}

/** A line with typed months cannot become a share of revenue or an amount per order: the months would be lost. */
export class KindChangeNotAllowed extends Schema.TaggedError<KindChangeNotAllowed>()("KindChangeNotAllowed", {
  lineId: Schema.String
}) {}

/** A share of revenue or an amount per order is worked out, never typed. */
export class NotEditable extends Schema.TaggedError<NotEditable>()("NotEditable", {
  lineId: Schema.String,
  kind: CostKind
}) {}

/** A month after the current one, or more than three years back. */
export class MonthOutOfRange extends Schema.TaggedError<MonthOutOfRange>()("MonthOutOfRange", {
  month: Schema.String
}) {}

const LineBefore = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  kind: CostKind,
  rate: Schema.NullOr(Schema.Finite),
  rateMinor: Schema.NullOr(Schema.Int),
  source: CostSource,
  deletedAt: Schema.NullOr(Schema.Finite)
})

/** `Shared.undo`'s snapshot: a new line taken away again, or a line and its typed months as they were. */
export const CostsRestore = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("created"), id: Schema.String }),
  Schema.Struct({
    kind: Schema.Literal("line"),
    line: LineBefore,
    amounts: Schema.Array(Schema.Struct({ month: Month, amountMinor: Schema.Int }))
  })
])
export type CostsRestore = typeof CostsRestore.Type
