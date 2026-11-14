import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { ProposalV1 } from "./ProposalsGroup.ts"

/* What needs the team on Start: the ranked queue, each open row with the plate drawn for it. */

export const QueueItemV1 = Schema.Struct({
  id: Schema.String,
  kind: Schema.Literals([
    "order_delayed",
    "return_review",
    "quality_review",
    "stock_out",
    "store_disconnected",
    "chargeback_deadline",
    "connection_incident",
    "forwarding_failed",
    "chargeback_opened"
  ]),
  subject_type: Schema.String,
  subject_id: Schema.String,
  store: Schema.NullOr(Schema.String),
  signal: Schema.Literals(["red", "amber", "green", "idle"]),
  title: Schema.String,
  value_minor: Schema.NullOr(Schema.Int),
  currency: Schema.NullOr(Schema.String),
  due_at: Schema.NullOr(Schema.String),
  state: Schema.Literals(["open", "seen", "resolved"]),
  proposal: Schema.NullOr(ProposalV1).annotate({
    description: "The plate Insyte drew for the row, while it is open; file it with `POST /proposals/{id}/file`."
  })
}).annotate({ identifier: "QueueItem" })

export const QueuePageV1 = Schema.Struct({
  data: Schema.Array(QueueItemV1),
  counts: Schema.Struct({ needs_you: Schema.Int, drawn: Schema.Int, all: Schema.Int })
}).annotate({ identifier: "QueuePage" })

export const QueueTabV1 = Schema.Literals(["needs_you", "drawn", "all"])

export class QueueGroup extends HttpApiGroup.make("queue")
  .add(
    HttpApiEndpoint.get("queue", "/queue", {
      query: Schema.Struct({ tab: Schema.optional(QueueTabV1) }),
      success: QueuePageV1
    }).annotate(
      OpenApi.Description,
      "What needs the team on Start, ranked by how soon: a delayed order, a return waiting for review, a quality check sent in, a sold-out variant, a store without its link. `needs_you` (the default) is what is red or amber; `all` adds the rest and what was seen in the last day. The rows narrow to what the key's scopes may read."
    )
  )
  .annotate(OpenApi.Title, "Queue")
{}
