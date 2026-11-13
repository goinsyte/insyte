import { Schema } from "effect"
import { UndoTicket } from "../../shared/domain/Undo.ts"

/*
 * Chargebacks as the console, `/v1` and MCP read and change them (M13 step 3, the read side of step 4; domain.md §8,
 * §12.6, widgets/04 §E). Times are epoch milliseconds, money minor units of `currency`. A case opened by hand is
 * numbered `DSP-n` unless the team types its own number.
 */

export const Provider = Schema.Literals(["stripe", "klarna", "paypal"])
export type Provider = typeof Provider.Type
export const ChargebackStatus = Schema.Literals(["open", "awaiting_evidence", "submitted", "won", "lost"])
export type ChargebackStatus = typeof ChargebackStatus.Type

/** The reason analytics groups by (`fact_disputes_day`). */
export const Reason = Schema.Literals(["item_not_received", "not_as_described", "unauthorized", "duplicate", "other"])
export type Reason = typeof Reason.Type

/** The reasons "Nieuw bewijspakket" offers, as the design lists them; each maps onto a normalised reason. */
export const ReasonCode = Schema.Literals([
  "unauthorized",
  "not_received",
  "wrong_item",
  "not_as_described",
  "refund_requested",
  "service",
  "payment_dispute"
])
export type ReasonCode = typeof ReasonCode.Type

/**
 * The list's tabs, as the area panel cuts it (`?tab=`): `action_required` is open or waiting for evidence, the one
 * meaning of a case that needs the team.
 */
export const ChargebackTab = Schema.Literals(["action_required", "submitted", "won", "lost"])
export type ChargebackTab = typeof ChargebackTab.Type

export class ChargebackRow extends Schema.Class<ChargebackRow>("chargebacks/ChargebackRow")({
  id: Schema.String,
  caseNumber: Schema.String,
  provider: Provider,
  /** The case came in through a payment connection, not by hand. */
  fromProvider: Schema.Boolean,
  status: ChargebackStatus,
  reason: Reason,
  reasonCode: Schema.String,
  amountMinor: Schema.Int,
  currency: Schema.String,
  customerId: Schema.NullOr(Schema.String),
  customerName: Schema.String,
  orderId: Schema.NullOr(Schema.String),
  /** The order's number as the store shows it (`#1042`), not its id. */
  orderNumber: Schema.NullOr(Schema.String),
  storeId: Schema.NullOr(Schema.String),
  deadlineAt: Schema.Finite,
  openedAt: Schema.Finite,
  submittedAt: Schema.NullOr(Schema.Finite),
  outcomeAt: Schema.NullOr(Schema.Finite),
  note: Schema.String,
  /** The items in its pack, removed ones left out. */
  evidenceCount: Schema.Int,
  updatedAt: Schema.Finite
}) {}

/** One count per tab, for the area panel and the list's empty states. */
export const ChargebackCounts = Schema.Struct({
  all: Schema.Int,
  actionRequired: Schema.Int,
  submitted: Schema.Int,
  won: Schema.Int,
  lost: Schema.Int
})
export type ChargebackCounts = typeof ChargebackCounts.Type

/** The header's standing and the pack plate's record, counted from the cases on file. */
export class ChargebackStats extends Schema.Class<ChargebackStats>("chargebacks/ChargebackStats")({
  /** Open or waiting for evidence. */
  open: Schema.Int,
  won: Schema.Int,
  /** Won or lost. */
  decided: Schema.Int,
  /** `won / decided` in whole percent; 0 with nothing decided. */
  wonPct: Schema.Int,
  /** What the won cases kept, in the workspace's currency (cases in another currency are left out). */
  recoveredMinor: Schema.Int,
  currency: Schema.String
}) {}

const Limit = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(500))

export const ListInput = Schema.Struct({
  tab: Schema.optional(ChargebackTab),
  provider: Schema.optional(Provider),
  /** The table's search: the case number or the customer's name. */
  q: Schema.optional(Schema.String.check(Schema.isMaxLength(200))),
  limit: Schema.optional(Limit)
})

export class ChargebackList extends Schema.Class<ChargebackList>("chargebacks/ChargebackList")({
  /** Nearest deadline first. */
  rows: Schema.Array(ChargebackRow),
  counts: ChargebackCounts,
  stats: ChargebackStats
}) {}

export const EvidenceKind = Schema.Literals([
  "tracking",
  "delivery",
  "correspondence",
  "invoice",
  "refund_policy",
  "upload",
  "narrative"
])

export const EvidenceItem = Schema.Struct({
  id: Schema.String,
  kind: EvidenceKind,
  /** `insyte` gathered it, `upload` a teammate added it. */
  source: Schema.Literals(["insyte", "upload"]),
  name: Schema.String,
  sizeBytes: Schema.Int,
  /** Where the file can be opened (`/api/files/:id`); `null` without one. */
  fileId: Schema.NullOr(Schema.String),
  mime: Schema.NullOr(Schema.String),
  addedAt: Schema.Finite
})
export type EvidenceItem = typeof EvidenceItem.Type

export const EventKind = Schema.Literals([
  "opened",
  "evidence_added",
  "evidence_removed",
  "pack_assembled",
  "submitted",
  "accepted",
  "won",
  "lost",
  "deadline_reminder",
  "note"
])
export type EventKind = typeof EventKind.Type

export const ChargebackEvent = Schema.Struct({
  id: Schema.String,
  at: Schema.Finite,
  kind: EventKind,
  /** Who: a teammate by name, the provider, or Insyte. */
  actor: Schema.Struct({ kind: Schema.String, id: Schema.NullOr(Schema.String), name: Schema.String }),
  data: Schema.Record(Schema.String, Schema.Unknown)
})
export type ChargebackEvent = typeof ChargebackEvent.Type

/**
 * The pack Insyte gathered for a case (`Chargebacks.assemblePack`): assembling (`done` of `total` documents in), ready,
 * submitted, or failed with why. Absent until it is first asked for.
 */
export const PackState = Schema.Literals(["assembling", "ready", "submitted", "failed"])
export type PackState = typeof PackState.Type

export const EvidencePack = Schema.Struct({
  state: PackState,
  done: Schema.Int,
  total: Schema.Int,
  startedAt: Schema.Finite,
  readyAt: Schema.NullOr(Schema.Finite),
  /** The account Insyte drafted, as the pack's `narrative` document has it. */
  narrative: Schema.String,
  error: Schema.NullOr(Schema.String)
})
export type EvidencePack = typeof EvidencePack.Type

export class ChargebackDetail extends Schema.Class<ChargebackDetail>("chargebacks/ChargebackDetail")({
  chargeback: ChargebackRow,
  pack: Schema.NullOr(EvidencePack),
  /** The pack, in its order. */
  evidence: Schema.Array(EvidenceItem),
  /** Oldest first, as the timeline reads. */
  timeline: Schema.Array(ChargebackEvent),
  stats: ChargebackStats
}) {}

/* ── commands ──────────────────────────────────────────────────────────────────────────────────── */

const Ids = Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(500))
export const IdInput = Schema.Struct({ id: Schema.String })
export const IdsInput = Schema.Struct({ ids: Ids })

/** "Bewijspakket samenstellen" and the selection bar's "Bewijspakketten samenstellen": one Workflow per case. */
export const AssemblePackInput = Schema.Struct({
  ids: Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(50))
})

/** "Nieuw bewijspakket": a case opened by hand, in the workspace's currency, its deadline fourteen days out. */
export const CreateManualInput = Schema.Struct({
  /** Empty or absent: the next `DSP-n`. */
  caseNumber: Schema.optional(Schema.String.check(Schema.isMaxLength(40))),
  provider: Provider,
  customer: Schema.Struct({
    id: Schema.optional(Schema.String),
    /** Required: empty after trimming is `Invalid { customer: "required" }`. */
    name: Schema.String.check(Schema.isMaxLength(200))
  }),
  /** More than zero, or `Invalid { amount: "invalid" }`. */
  amountMinor: Schema.Int,
  reasonCode: ReasonCode,
  note: Schema.optional(Schema.String.check(Schema.isMaxLength(2000))),
  orderId: Schema.optional(Schema.String)
})

export const SetNoteInput = Schema.Struct({
  id: Schema.String,
  note: Schema.String.check(Schema.isMaxLength(2000))
})

/** Files already uploaded (`PUT /api/chargebacks/:id/evidence`), put in the case's pack. */
export const AddEvidenceInput = Schema.Struct({
  chargebackId: Schema.String,
  fileIds: Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(20))
})
export const RemoveEvidenceInput = Schema.Struct({ chargebackId: Schema.String, itemId: Schema.String })
/** The pack's items in their new order: every item, each once. */
export const ReorderEvidenceInput = Schema.Struct({
  chargebackId: Schema.String,
  itemIds: Schema.Array(Schema.String).check(Schema.isMinLength(1), Schema.isMaxLength(200))
})

export class ChargebackChange extends Schema.Class<ChargebackChange>("chargebacks/ChargebackChange")({
  chargebacks: Schema.Array(ChargebackRow),
  /** `null` where nothing changed, for a reorder, and for accepting, which cannot be taken back. */
  undo: Schema.NullOr(UndoTicket)
}) {}

export const NextCaseNumber = Schema.Struct({ caseNumber: Schema.String })

/** What `Shared.undo` puts back. */
export const ChargebacksRestore = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("created"), ids: Schema.Array(Schema.String) }),
  Schema.Struct({ kind: Schema.Literal("note"), id: Schema.String, note: Schema.String }),
  /** Items added, taken out again. */
  Schema.Struct({
    kind: Schema.Literal("added"),
    chargebackId: Schema.String,
    itemIds: Schema.Array(Schema.String),
    eventId: Schema.String
  }),
  /** An item removed, back where it was. */
  Schema.Struct({
    kind: Schema.Literal("removed"),
    chargebackId: Schema.String,
    itemId: Schema.String,
    eventId: Schema.String
  })
])
export type ChargebacksRestore = typeof ChargebacksRestore.Type

/** The case number is another case's. */
export class CaseNumberTaken extends Schema.TaggedError<CaseNumberTaken>()("CaseNumberTaken", {
  caseNumber: Schema.String
}) {}

/** The case is submitted, won or lost: nothing more goes into its pack, and it cannot be accepted. */
export class CaseClosed extends Schema.TaggedError<CaseClosed>()("CaseClosed", {
  id: Schema.String,
  status: ChargebackStatus
}) {}
