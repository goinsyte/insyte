import { Schema } from "effect"
import { UndoTicket } from "../../shared/domain/Undo.ts"

/*
 * Plates and proposals (M10.2; ADR-0014, domain.md §9.2, §12.7): a proposal is a record of what Insyte drew for a queue
 * row, with the typed command filing runs. The plate is its current revision as the design draws it (`Plate` in
 * `@insyte/ui`): a heading, a paragraph, the dimension (how long is left), the record as it stands and as drawn, the
 * store, the confidence with what it rests on, and what filing does. Times are epoch milliseconds.
 */

/**
 * The commands a plate can carry at M10.2, each with its own Undo. Approving a return or a quality check is a person's
 * button elsewhere. The delay mail and the supplier ticket carry the words the plate showed, so filing sends or opens
 * exactly what was drawn: the mail waits out the undo window before it leaves (ADR-0023).
 */
export const ProposalAction = Schema.Union([
  Schema.TaggedStruct("ApproveReturn", { returnId: Schema.String }),
  Schema.TaggedStruct("ApproveQualityCheck", { checkId: Schema.String }),
  Schema.TaggedStruct("NotifyDelayedOrder", {
    orderId: Schema.String,
    subject: Schema.String,
    paragraphs: Schema.Array(Schema.String)
  }),
  Schema.TaggedStruct("CreateSupplierTicket", {
    /** `null`: no supplier is linked to the product, and the ticket says so. */
    supplierId: Schema.NullOr(Schema.String),
    productId: Schema.String,
    title: Schema.String,
    description: Schema.String
  })
])
export type ProposalAction = typeof ProposalAction.Type

export const ProposalState = Schema.Literals([
  "open",
  "filed",
  "executed",
  "execution_failed",
  "discarded",
  "superseded",
  "reverted",
  "expired"
])
export type ProposalState = typeof ProposalState.Type

/** How sure the rule is, as the plate's title block words it: Hoog ≥ 0.9, Goed ≥ 0.75, else Redelijk. */
export const ConfidenceWord = Schema.Literals(["Hoog", "Goed", "Redelijk"])
export type ConfidenceWord = typeof ConfidenceWord.Type
export const wordOf = (confidence: number): ConfidenceWord =>
  confidence >= 0.9 ? "Hoog" : confidence >= 0.75 ? "Goed" : "Redelijk"

const Block = Schema.Struct({ label: Schema.String, value: Schema.String })

export const Evidence = Schema.Struct({ kind: Schema.String, ref: Schema.String, summary: Schema.String })

/** One drawing of a proposal: what the plate shows, and what it was drawn from. */
export const PlateRevision = Schema.Struct({
  revision: Schema.Int,
  heading: Schema.String,
  body: Schema.String,
  /** The dimension across the top of the drawing: how long is left, in words. */
  dimension: Schema.String,
  before: Block,
  after: Block,
  change: Schema.String,
  /** The store the record belongs to. */
  witness: Schema.String,
  /** 0–1, computed by the rule; the plate says the word and what it rests on. */
  confidence: Schema.Finite,
  confidenceWord: ConfidenceWord,
  confidenceBasis: Schema.String,
  /** What filing does, in Dutch: "Goedkeuren zoals getekend". */
  fileLabel: Schema.String,
  /** The rule's checks, as a sentence each. */
  why: Schema.String,
  evidence: Schema.Array(Evidence),
  createdAt: Schema.Finite
})
export type PlateRevision = typeof PlateRevision.Type

export const ProposalView = Schema.Struct({
  id: Schema.String,
  /** The drawing's number: the record's own (`R-1003`). */
  number: Schema.String,
  state: ProposalState,
  subjectType: Schema.String,
  subjectId: Schema.String,
  queueItemId: Schema.NullOr(Schema.String),
  action: ProposalAction,
  /** How many times it has been drawn; the current drawing is `plate`. */
  revisions: Schema.Int,
  plate: PlateRevision,
  filedAt: Schema.NullOr(Schema.Finite),
  executedAt: Schema.NullOr(Schema.Finite),
  /** Why it did not go (`execution_failed`): the plate offers "Opnieuw proberen". */
  executionError: Schema.NullOr(Schema.String)
})
export type ProposalView = typeof ProposalView.Type

export const IdInput = Schema.Struct({ id: Schema.String })

export class ProposalChange extends Schema.Class<ProposalChange>("proposals/ProposalChange")({
  proposal: ProposalView,
  undo: Schema.NullOr(UndoTicket)
}) {}

/** The proposal is not open: filed, set aside, superseded or reverted. */
export class ProposalClosed extends Schema.TaggedError<ProposalClosed>()("ProposalClosed", {
  id: Schema.String,
  state: ProposalState
}) {}

/** The record moved on since the plate was drawn (the return is no longer in review): the plate is superseded. */
export class ProposalStale extends Schema.TaggedError<ProposalStale>()("ProposalStale", { id: Schema.String }) {}

/**
 * A proposal as it was, for `Shared.undo` (`proposals.restore`): a discard put back, or a filing taken back. Keyed by
 * `kind`, not `_tag`: the compensation comes back from jsonb with its keys camelCased.
 */
export const ProposalRestore = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("discarded"), id: Schema.String }),
  Schema.Struct({
    kind: Schema.Literal("filed"),
    id: Schema.String,
    /**
     * The command's own undo token, by its SHA-256 (`Undo.hashOf`), spent on the undo's transaction to put the record
     * back. Never the token itself: no row holds a token that could be redeemed.
     */
    innerHash: Schema.NullOr(Schema.String)
  })
])
