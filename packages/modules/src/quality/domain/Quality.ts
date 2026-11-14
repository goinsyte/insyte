import { Schema } from "effect"
import { UndoTicket } from "../../shared/domain/Undo.ts"

/*
 * Product quality (M9.4; widgets/03 `/products/$productId?tab=quality`): the checks the team asks a supplier for, what
 * came back and the verdict, the complaints (returns whose reason counts for quality), the rate against 90 days of
 * sales, and the product's phase. The vocabularies are `lib/quality.ts`'s. Times are epoch milliseconds.
 */

export const CheckKind = Schema.Literals(["sample", "batch", "test_order"])
export const Deliverable = Schema.Literals(["photos", "video", "batch", "measurements"])
export const CheckStatus = Schema.Literals(["requested", "submitted", "approved", "rejected"])
export const Phase = Schema.Literals(["test", "active", "watch", "phased_out"])

const Text = (max: number) => Schema.String.check(Schema.isMaxLength(max))
const NonEmpty = (max: number) => Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(max))

export const QualityCheckRow = Schema.Struct({
  id: Schema.String,
  productId: Schema.String,
  supplierId: Schema.String,
  kind: CheckKind,
  /** The sizes it covers; empty is every size. */
  variants: Schema.Array(Schema.String),
  deliverables: Schema.Array(Deliverable),
  dueAt: Schema.Finite,
  status: CheckStatus,
  requestedAt: Schema.Finite,
  /** Who asked: the teammate's name. */
  requestedBy: Schema.String,
  note: Schema.String,
  submission: Schema.NullOr(Schema.Struct({
    at: Schema.Finite,
    by: Schema.String,
    /** Links the console can open. */
    photos: Schema.Array(Schema.String),
    video: Schema.Boolean,
    batch: Schema.NullOr(Schema.String),
    note: Schema.NullOr(Schema.String)
  })),
  verdict: Schema.NullOr(Schema.Struct({ at: Schema.Finite, by: Schema.String, reason: Schema.NullOr(Schema.String) }))
})
export type QualityCheckRow = typeof QualityCheckRow.Type

/** A complaint: one product line of a return whose reason counts for quality, rejected ones aside. */
export const Complaint = Schema.Struct({
  id: Schema.String,
  returnId: Schema.String,
  at: Schema.Finite,
  text: Schema.String,
  customer: Schema.String,
  variant: Schema.NullOr(Schema.String)
})

export class QualityView extends Schema.Class<QualityView>("quality/QualityView")({
  productId: Schema.String,
  /** The product's primary supplier, whom checks go to. */
  supplier: Schema.NullOr(Schema.Struct({ id: Schema.String, name: Schema.String })),
  phase: Phase,
  /** The complaint rate above which a product wants watching, as a fraction. */
  threshold: Schema.Finite,
  /** Units sold in the last 90 days. */
  sold90: Schema.Int,
  /** In the last 90 days, newest first. */
  complaints: Schema.Array(Complaint),
  /** Newest first. */
  checks: Schema.Array(QualityCheckRow),
  /** The product's variants, to ask about a size. */
  sizes: Schema.Array(Schema.String)
}) {}

export const ProductIdInput = Schema.Struct({ productId: Schema.String })
export const CheckIdInput = Schema.Struct({ id: Schema.String })

export const RequestInput = Schema.Struct({
  productId: Schema.String,
  kind: CheckKind,
  variants: Schema.Array(Text(80)).check(Schema.isMaxLength(30)),
  deliverables: Schema.Array(Deliverable).check(Schema.isMinLength(1), Schema.isMaxLength(4)),
  dueAt: Schema.Finite,
  note: Schema.optional(Text(2000))
})

export const RejectInput = Schema.Struct({
  id: Schema.String,
  /** What the supplier reads and acts on. */
  note: NonEmpty(2000),
  /** Put the product under watch in the same move. */
  watch: Schema.Boolean,
  /** Open a ticket with the supplier in the same move (Klantenservice · Bewerken); the verdict's Undo takes it away. */
  ticket: Schema.optional(Schema.Boolean)
})

export const SetPhaseInput = Schema.Struct({ productId: Schema.String, phase: Phase })

export class QualityChange extends Schema.Class<QualityChange>("quality/QualityChange")({
  checkId: Schema.NullOr(Schema.String),
  undo: Schema.NullOr(UndoTicket),
  /** The ticket a rejection opened with the supplier, where it opened one. */
  ticket: Schema.optional(Schema.Struct({ id: Schema.String, number: Schema.Int }))
}) {}

/**
 * `Quality.stats`: per product, or per supplier over its products (primary), in the last 90 days: units sold and
 * returned (rejected returns aside), the complaints among them and those of the last 30 days, the checks still running
 * and those judged and passed. Only products or suppliers with any of these have a row.
 */
export const StatsInput = Schema.Struct({
  /** One product's figures. */
  productId: Schema.optional(Schema.String),
  /** Summed per supplier. */
  bySupplier: Schema.optional(Schema.Boolean)
})

export const StatsRow = Schema.Struct({
  /** The product's id, or the supplier's. */
  id: Schema.String,
  sold: Schema.Int,
  returned: Schema.Int,
  complaints: Schema.Int,
  recentComplaints: Schema.Int,
  running: Schema.Int,
  passed: Schema.Int,
  judged: Schema.Int
})
export type StatsRow = typeof StatsRow.Type

export class QualityStats extends Schema.Class<QualityStats>("quality/QualityStats")({
  /** The complaint rate above which a product wants watching, as a fraction. */
  threshold: Schema.Finite,
  rows: Schema.Array(StatsRow)
}) {}

/** The link the supplier answers through until the partner portal (M16): copied by the team, later mailed. */
export class SupplierLink extends Schema.Class<SupplierLink>("quality/SupplierLink")({
  /** On the console's origin: `/kwaliteit/<id>?k=<token>`. */
  path: Schema.String
}) {}

/** A check's fields as they were, and the phase, for `Shared.undo`. */
export const QualityRestore = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("requested"), id: Schema.String }),
  Schema.Struct({
    kind: Schema.Literal("judged"),
    id: Schema.String,
    phase: Schema.NullOr(Schema.Struct({ productId: Schema.String, phase: Schema.NullOr(Phase) })),
    /** The ticket the rejection opened. */
    ticketId: Schema.optional(Schema.String)
  }),
  Schema.Struct({ kind: Schema.Literal("phase"), productId: Schema.String, phase: Schema.NullOr(Phase) })
])
export type QualityRestore = typeof QualityRestore.Type

/* ── the supplier's side, through the signed link ──────────────────────────────────────────────── */

export class SupplierCheck extends Schema.Class<SupplierCheck>("quality/SupplierCheck")({
  /** Whose check: the store's name, as the supplier knows it. */
  brand: Schema.String,
  productTitle: Schema.String,
  productImage: Schema.NullOr(Schema.String),
  supplierName: Schema.String,
  kind: CheckKind,
  variants: Schema.Array(Schema.String),
  deliverables: Schema.Array(Deliverable),
  dueAt: Schema.Finite,
  status: CheckStatus,
  note: Schema.String,
  submittedAt: Schema.NullOr(Schema.Finite),
  /** Why it was rejected, where it was. */
  rejection: Schema.NullOr(Schema.String)
}) {}

export const SupplierTokenInput = Schema.Struct({ token: Text(1024) })

export const SubmitInput = Schema.Struct({
  token: Text(1024),
  /** Uploaded with this token (`PUT /api/quality/media`). */
  fileIds: Schema.Array(Schema.String).check(Schema.isMaxLength(12)),
  batch: Schema.optional(Text(80)),
  note: Schema.optional(Text(1000)),
  /** Who sends it, as the team will read it. */
  by: Schema.optional(Text(120))
})

/** The check is not in a state that allows this; the move is named. */
export class IllegalCheckMove extends Schema.TaggedError<IllegalCheckMove>()("IllegalCheckMove", {
  id: Schema.String,
  from: CheckStatus,
  move: Schema.String
}) {}

/** The product has no supplier to ask. */
export class NoSupplier extends Schema.TaggedError<NoSupplier>()("NoSupplier", {}) {}

/** The link is spent, tampered with, or not ours. */
export class LinkExpired extends Schema.TaggedError<LinkExpired>()("LinkExpired", {}) {}

/** What the check asks for did not come: photos, or the batch number. */
export class DeliverableMissing extends Schema.TaggedError<DeliverableMissing>()("DeliverableMissing", {
  what: Schema.Literals(["photos", "batch"])
}) {}
