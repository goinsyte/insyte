import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { NotFoundV1, ScopeMissingV1 } from "../Errors.ts"
import { ById, WriteErrors, Writes } from "../Requests.ts"

/* The plates Insyte draws for the queue's rows: one read, and filed as the key. */

export const ProposalV1 = Schema.Struct({
  id: Schema.String,
  number: Schema.String,
  state: Schema.Literals([
    "open",
    "filed",
    "executed",
    "execution_failed",
    "discarded",
    "superseded",
    "reverted",
    "expired"
  ]).annotate({
    description:
      "`filed`: what it sends leaves once the undo window has passed. `execution_failed`: it did not go (see `execution_error`); filing it again tries again."
  }),
  subject_type: Schema.String,
  subject_id: Schema.String,
  action: Schema.Struct({
    kind: Schema.Literals([
      "approve_return",
      "approve_quality_check",
      "notify_delayed_order",
      "create_supplier_ticket",
      "cancel_order",
      "refund_order",
      "resolve_return",
      "forward_orders",
      "send_return_label",
      "tag_order",
      "set_order_note",
      "create_ticket",
      "update_ticket",
      "set_ticket_status",
      "assign_ticket",
      "comment_on_ticket"
    ]),
    subject_id: Schema.String
  }).annotate({
    description:
      "What filing runs, as the key's own call would: approving the return or the check, mailing the shopper of a delayed order the words in `after`, or opening a reorder ticket for a sold-out product. A plate an agent asked for (its autonomy is Eerst vragen) carries the tool it called, by that tool's name."
  }),
  revision: Schema.Int,
  heading: Schema.String,
  body: Schema.String,
  dimension: Schema.String.annotate({ description: "How long is left, in words (Dutch)." }),
  before: Schema.String,
  after: Schema.String,
  store: Schema.String,
  confidence: Schema.Finite.annotate({ description: "0–1, computed by the rule from the records." }),
  confidence_basis: Schema.String,
  file_label: Schema.String,
  why: Schema.String,
  evidence: Schema.Array(Schema.Struct({ kind: Schema.String, ref: Schema.String, summary: Schema.String })),
  filed_at: Schema.NullOr(Schema.String),
  executed_at: Schema.NullOr(Schema.String),
  execution_error: Schema.NullOr(Schema.String)
}).annotate({ identifier: "Proposal" })

export class ProposalsGroup extends HttpApiGroup.make("proposals")
  .add(
    HttpApiEndpoint.get("proposal", "/proposals/:id", {
      params: ById,
      success: ProposalV1,
      error: [ScopeMissingV1, NotFoundV1]
    }).annotate(
      OpenApi.Description,
      "One plate Insyte drew for a queue row: what it found, the record as it stands and as drawn, how sure the rule is and why, and what filing runs. Readable with the scope of its record (`returns.read`, `products.read`)."
    ),
    HttpApiEndpoint.post("file", "/proposals/:id/file", {
      params: ById,
      headers: Writes,
      success: ProposalV1,
      error: WriteErrors
    }).annotate(
      OpenApi.Description,
      "Files a plate: the command it carries runs as this key, with the scopes that command needs (approving a return takes `returns.write` and `returns.approve`; the delay mail `orders.write`; a reorder ticket `support.write`). A plate no longer open, or whose record moved on, is refused (`409`, `closed` or `stale`); one whose command did not go (`execution_failed`) is tried again."
    )
  )
  .annotate(OpenApi.Title, "Proposals")
{}
