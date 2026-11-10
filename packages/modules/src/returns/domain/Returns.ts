import { Schema } from "effect"
import { UndoTicket } from "../../shared/domain/Undo.ts"

/*
 * Returns and claims as the console reads and changes them (M9.1; domain.md §4.7, widgets/03 `/returns`). Money is in
 * the order's currency, minor units. Times are epoch milliseconds. The vocabularies are `lib/returns.ts`'s.
 */

export const ReturnKind = Schema.Literals(["return", "claim"])
export const ReturnStatus = Schema.Literals([
  "review",
  "awaiting_parcel",
  "in_transit",
  "received",
  "ready",
  "resolved",
  "rejected"
])
export const Resolution = Schema.Literals(["refund", "exchange", "gift_card", "replacement", "discount"])
export const RuleKind = Schema.Literals(["not_returnable", "refund_only", "exchange_only"])
export const Carrier = Schema.Literals(["PostNL", "DHL", "DPD", "UPS"])
export const Condition = Schema.Literals(["ok", "damaged", "missing"])
export const Actor = Schema.Literals(["shopper", "team", "carrier", "insyte", "hub"])

export class ReturnRow extends Schema.Class<ReturnRow>("returns/ReturnRow")({
  id: Schema.String,
  /** `R-1042`. */
  number: Schema.String,
  kind: ReturnKind,
  orderId: Schema.String,
  orderNumber: Schema.String,
  customerId: Schema.NullOr(Schema.String),
  customerName: Schema.String,
  customerEmail: Schema.NullOr(Schema.String),
  storeId: Schema.String,
  country: Schema.NullOr(Schema.String),
  currency: Schema.String,
  source: Schema.Literals(["portal", "operator", "agent", "shopify"]),
  status: ReturnStatus,
  reasonId: Schema.String,
  reasonLabel: Schema.String,
  /** The shopper's own words. */
  note: Schema.String,
  requested: Resolution,
  exchangeTo: Schema.NullOr(Schema.String),
  keepItem: Schema.Boolean,
  units: Schema.Int,
  amountMinor: Schema.Int,
  createdAt: Schema.Finite,
  /** Beoordelen vóór: 48 hours after it came in. */
  deadline: Schema.Finite,
  deliveredAt: Schema.NullOr(Schema.Finite),
  assigneeId: Schema.NullOr(Schema.String),
  /** Counts toward the product's complaint rate: the reason's, when the return was made. */
  quality: Schema.Boolean,
  tags: Schema.Array(Schema.String),
  label: Schema.NullOr(Schema.Struct({ carrier: Carrier, tracking: Schema.String, sentAt: Schema.Finite })),
  resolution: Schema.NullOr(Schema.Struct({
    kind: Resolution,
    amountMinor: Schema.Int,
    at: Schema.Finite,
    /** Who settled it: the teammate's name, or the API key's. */
    by: Schema.String,
    replacementOrder: Schema.NullOr(Schema.Struct({ id: Schema.String, number: Schema.String }))
  })),
  rejectReason: Schema.NullOr(Schema.String)
}) {}

export const ReturnCounts = Schema.Struct({
  total: Schema.Int,
  review: Schema.Int,
  /** In review past the deadline. */
  late: Schema.Int,
  /** Waiting for their parcel: awaiting it or on the way. */
  awaiting: Schema.Int,
  received: Schema.Int,
  ready: Schema.Int,
  resolved: Schema.Int,
  rejected: Schema.Int,
  returns: Schema.Int,
  claims: Schema.Int
})

export const ListInput = Schema.Struct({
  /** One order's or one customer's; absent, the queue. */
  orderId: Schema.optional(Schema.String),
  customerId: Schema.optional(Schema.String),
  limit: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(500)))
})

export class ReturnList extends Schema.Class<ReturnList>("returns/ReturnList")({
  rows: Schema.Array(ReturnRow),
  counts: ReturnCounts
}) {}

export const ReturnLine = Schema.Struct({
  id: Schema.String,
  orderLineId: Schema.String,
  productId: Schema.NullOr(Schema.String),
  variantId: Schema.NullOr(Schema.String),
  title: Schema.String,
  variantTitle: Schema.String,
  qty: Schema.Int,
  unitPriceMinor: Schema.Int,
  image: Schema.NullOr(Schema.String),
  condition: Schema.NullOr(Condition),
  restock: Schema.Boolean
})

export const ReturnEvent = Schema.Struct({
  at: Schema.Finite,
  who: Actor,
  name: Schema.NullOr(Schema.String),
  text: Schema.String
})

export const WindowState = Schema.Struct({
  inside: Schema.Boolean,
  daysSince: Schema.Int,
  days: Schema.Int,
  closesOn: Schema.Finite
})

export const AppliedRule = Schema.Struct({ id: Schema.String, kind: RuleKind, note: Schema.String })

export class ReturnDetail extends Schema.Class<ReturnDetail>("returns/ReturnDetail")({
  record: ReturnRow,
  lines: Schema.Array(ReturnLine),
  /** The shopper's photos, as links the console can open. */
  photos: Schema.Array(Schema.String),
  photoRequired: Schema.Boolean,
  events: Schema.Array(ReturnEvent),
  window: WindowState,
  rule: Schema.NullOr(AppliedRule),
  /** What it may be settled with, and what each moves. */
  allowed: Schema.Array(Schema.Struct({ kind: Resolution, amountMinor: Schema.Int })),
  earlierReturns: Schema.Int,
  address: Schema.NullOr(Schema.Struct({ label: Schema.String, address: Schema.String, carrier: Carrier })),
  assignee: Schema.NullOr(Schema.Struct({ id: Schema.String, name: Schema.String }))
}) {}

/** "Retour starten": an order's lines, what is still free to send back, and the rule on each. */
export class Returnable extends Schema.Class<Returnable>("returns/Returnable")({
  orderId: Schema.String,
  orderNumber: Schema.String,
  customerName: Schema.String,
  currency: Schema.String,
  deliveredAt: Schema.NullOr(Schema.Finite),
  lines: Schema.Array(Schema.Struct({
    id: Schema.String,
    productId: Schema.NullOr(Schema.String),
    variantId: Schema.NullOr(Schema.String),
    title: Schema.String,
    variantTitle: Schema.String,
    unitPriceMinor: Schema.Int,
    image: Schema.NullOr(Schema.String),
    /** Bought, less what is already in a return that is not rejected. */
    free: Schema.Int,
    rule: Schema.NullOr(AppliedRule)
  }))
}) {}

/* ── the settings, as one document ─────────────────────────────────────────────────────────────── */

const Days = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(365))
const OwnDays = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(365))
const MonthDay = Schema.String.check(Schema.isPattern(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/))
const Text = (max: number) => Schema.String.check(Schema.isMaxLength(max))
const NonEmpty = (max: number) => Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(max))

export const SpecialWindowDoc = Schema.Struct({
  id: Schema.String,
  label: NonEmpty(80),
  days: OwnDays,
  from: MonthDay,
  to: MonthDay
})

export const ReasonDoc = Schema.Struct({
  id: NonEmpty(40),
  label: NonEmpty(80),
  claim: Schema.Boolean,
  photoRequired: Schema.Boolean,
  quality: Schema.Boolean,
  windowDays: Schema.NullOr(OwnDays)
})

export const RuleDoc = Schema.Struct({
  id: Schema.String,
  kind: RuleKind,
  target: Schema.Union([
    Schema.Struct({ by: Schema.Literal("product"), productId: Schema.String, label: Schema.String }),
    Schema.Struct({ by: Schema.Literal("variant"), variantId: Schema.String, label: Schema.String }),
    Schema.Struct({ by: Schema.Literal("tag"), tag: NonEmpty(80) })
  ]),
  /** Why, in the shopper's words: the portal shows it. */
  note: NonEmpty(300)
})

export const AddressDoc = Schema.Struct({
  country: Schema.String.check(Schema.isPattern(/^[A-Z]{2}$/)),
  label: NonEmpty(80),
  address: NonEmpty(300),
  carrier: Carrier
})

export class ReturnSettingsDoc extends Schema.Class<ReturnSettingsDoc>("returns/ReturnSettingsDoc")({
  returnDays: Days,
  claimDays: Days,
  specialWindows: Schema.Array(SpecialWindowDoc).check(Schema.isMaxLength(20)),
  reasons: Schema.Array(ReasonDoc).check(Schema.isMinLength(1), Schema.isMaxLength(30)),
  rules: Schema.Array(RuleDoc).check(Schema.isMaxLength(200)),
  offered: Schema.Array(Resolution).check(Schema.isMinLength(1)),
  giftCardBonusPct: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(100)),
  exchangeFeeMinor: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  addresses: Schema.Array(AddressDoc).check(Schema.isMaxLength(50)),
  claimSteps: Schema.Array(NonEmpty(200)).check(Schema.isMaxLength(10)),
  rejectReasons: Schema.Array(NonEmpty(200)).check(Schema.isMaxLength(20)),
  portal: Schema.Struct({
    on: Schema.Boolean,
    /** `goinsyte.com/retour/{handle}`: the workspace's, not editable yet. */
    handle: Schema.String,
    intro: Text(500),
    done: Text(1000)
  })
}) {}

/* ── commands ──────────────────────────────────────────────────────────────────────────────────── */

const Ids = Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(500))

export const StartInput = Schema.Struct({
  orderId: Schema.String,
  lines: Schema.Array(Schema.Struct({ lineId: Schema.String, qty: Schema.Int.check(Schema.isGreaterThan(0)) })).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(50)
  ),
  reasonId: Schema.String,
  note: Schema.optional(Text(2000)),
  requested: Resolution,
  exchangeTo: Schema.optional(Text(120))
})

export const ApproveInput = Schema.Struct({ ids: Ids, keepItem: Schema.optional(Schema.Boolean) })
export const RejectInput = Schema.Struct({ ids: Ids, reason: NonEmpty(500) })
export const AssignInput = Schema.Struct({ ids: Ids, memberId: Schema.NullOr(Schema.String) })
export const IdInput = Schema.Struct({ id: Schema.String })

export const InspectInput = Schema.Struct({
  id: Schema.String,
  /** Per line; absent, every line is in order and goes back on the shelf ("Gecontroleerd, in orde"). */
  lines: Schema.optional(Schema.Array(Schema.Struct({
    lineId: Schema.String,
    condition: Condition,
    restock: Schema.Boolean
  })))
})

export const ResolveInput = Schema.Struct({
  id: Schema.String,
  resolution: Resolution,
  /** A refund's id, minted by the caller, so a resolve sent twice refunds once. */
  refundId: Schema.optional(Schema.String),
  exchangeTo: Schema.optional(Text(120))
})

export class ReturnChange extends Schema.Class<ReturnChange>("returns/ReturnChange")({
  returns: Schema.Array(ReturnRow),
  /** `null` where nothing changed, and for a refund, which cannot be taken back. */
  undo: Schema.NullOr(UndoTicket)
}) {}

/** A return's fields as they were, for `Shared.undo`. */
const Before = Schema.Struct({
  id: Schema.String,
  status: ReturnStatus,
  assigneeId: Schema.NullOr(Schema.String),
  keepItem: Schema.Boolean,
  rejectedReason: Schema.NullOr(Schema.String),
  receivedAt: Schema.NullOr(Schema.Finite),
  inspectedAt: Schema.NullOr(Schema.Finite),
  resolution: Schema.NullOr(Resolution),
  resolutionMinor: Schema.NullOr(Schema.Int),
  resolvedAt: Schema.NullOr(Schema.Finite),
  resolvedBy: Schema.NullOr(Schema.String),
  exchangeTo: Schema.NullOr(Schema.String),
  /** The history rows the command added, taken away again. */
  events: Schema.Array(Schema.String),
  lines: Schema.Array(Schema.Struct({
    id: Schema.String,
    condition: Schema.NullOr(Condition),
    restock: Schema.Boolean
  }))
})
export type Before = typeof Before.Type

export const ReturnsRestore = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("fields"), returns: Schema.Array(Before) }),
  Schema.Struct({ kind: Schema.Literal("created"), id: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("settings"), document: Schema.Unknown })
])
export type ReturnsRestore = typeof ReturnsRestore.Type

/** The resolution is not one this return allows (its product rule, or what the store offers). */
export class ResolutionNotAllowed extends Schema.TaggedError<ResolutionNotAllowed>()("ResolutionNotAllowed", {
  resolution: Resolution
}) {}

/** The return is not in a state that allows this; the move is named. */
export class IllegalReturnMove extends Schema.TaggedError<IllegalReturnMove>()("IllegalReturnMove", {
  id: Schema.String,
  from: ReturnStatus,
  move: Schema.String
}) {}

/** A line that cannot go back: more than is free, not this order's, or its product rule says no. */
export class LineNotReturnable extends Schema.TaggedError<LineNotReturnable>()("LineNotReturnable", {
  lineId: Schema.String,
  why: Schema.Literals(["unknown", "taken", "rule"])
}) {}
