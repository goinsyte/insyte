import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { NotFoundV1, ScopeMissingV1 } from "../Errors.ts"
import { ById, WriteErrors, Writes } from "../Requests.ts"

/* Forwarding (M8.2, M13 step 6): the suppliers with their statements, the queue of legs, forwarding and rerouting. */

const Party = Schema.Struct({ id: Schema.String, name: Schema.String })

/** A forwarding leg (M8.2): one order's lines for one supplier, and where it stands. */
export const Leg = Schema.Struct({
  id: Schema.String,
  order: Schema.Struct({ id: Schema.String, number: Schema.String }),
  store_id: Schema.String,
  supplier: Schema.NullOr(Party),
  from_supplier: Schema.NullOr(Party),
  lines: Schema.Array(Schema.Struct({
    title: Schema.String,
    variant_title: Schema.NullOr(Schema.String),
    quantity: Schema.Int
  })),
  state: Schema.String.annotate({ description: "to_forward, sending, awaiting, confirmed, error or cancelled." }),
  via: Schema.NullOr(Schema.String).annotate({ description: "portal, email or api." }),
  since: Schema.String,
  confirm_by: Schema.NullOr(Schema.String),
  late: Schema.Boolean,
  error: Schema.NullOr(Schema.Struct({
    kind: Schema.String.annotate({
      description: "stock, address, no_supplier, rejected, send_failed or supplier_paused."
    }),
    note: Schema.NullOr(Schema.String)
  }))
}).annotate({ identifier: "Leg" })

export const LegPageV1 = Schema.Struct({
  data: Schema.Array(Leg),
  counts: Schema.Struct({ to_forward: Schema.Int, awaiting: Schema.Int, late: Schema.Int, error: Schema.Int })
})

export const Supplier = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  paused: Schema.Boolean,
  forward_channel: Schema.String,
  auto_forward: Schema.Boolean,
  contact_email: Schema.NullOr(Schema.String),
  stats: Schema.Struct({ products: Schema.Int, open: Schema.Int, delayed: Schema.Int })
}).annotate({ identifier: "Supplier" })

/** A supplier's statement for one month (M13 step 6): what the brand owes it, in the workspace's currency. */
export const SupplierStatement = Schema.Struct({
  id: Schema.NullOr(Schema.String).annotate({ description: "Null for the running month, which is not closed yet." }),
  month: Schema.String.annotate({ description: "YYYY-MM." }),
  status: Schema.String.annotate({ description: "open (running month), processing (closed, to be paid) or paid." }),
  currency: Schema.String,
  shipped_minor: Schema.Int,
  corrections_minor: Schema.Int.annotate({ description: "Supplier-fault returns refunded; zero or negative." }),
  total_minor: Schema.Int,
  shipped_lines: Schema.Int,
  missing_lines: Schema.Int.annotate({ description: "Lines that count nothing: no cost price or no exchange rate." }),
  pay_day: Schema.String,
  closed_at: Schema.NullOr(Schema.String),
  paid_at: Schema.NullOr(Schema.String),
  paid_reference: Schema.NullOr(Schema.String)
}).annotate({ identifier: "SupplierStatement" })

export const SupplierStatementsV1 = Schema.Struct({
  supplier: Party,
  data: Schema.Array(SupplierStatement),
  summary: Schema.Struct({ currency: Schema.String, paid_ytd_minor: Schema.Int, pay_day: Schema.Int })
})

export const ForwardView = Schema.Literals(["to_forward", "awaiting", "forward_error"])

export class ForwardingGroup extends HttpApiGroup.make("forwarding")
  .add(
    HttpApiEndpoint.get("suppliers", "/suppliers", {
      success: Schema.Struct({ data: Schema.Array(Supplier) }),
      error: [ScopeMissingV1]
    }).annotate(
      OpenApi.Description,
      "The workspace's suppliers and how each takes its orders. Needs `suppliers.read`."
    ),
    HttpApiEndpoint.get("statements", "/suppliers/:id/statements", {
      params: ById,
      success: SupplierStatementsV1,
      error: [ScopeMissingV1, NotFoundV1]
    }).annotate(
      OpenApi.Description,
      "A supplier's monthly statements, newest first: the lines it shipped at their cost price less its returns refunded, and whether each is paid; the running month first while it has lines. Needs `suppliers.read`."
    ),
    HttpApiEndpoint.get("legs", "/forwarding", {
      query: Schema.Struct({ view: Schema.optional(ForwardView) }),
      success: LegPageV1,
      error: [ScopeMissingV1]
    }).annotate(
      OpenApi.Description,
      "The forwarding queue: every open leg, or one view of it (`to_forward`, `awaiting`, `forward_error`), oldest first, with the counts. Needs `orders.read`."
    ),
    HttpApiEndpoint.post("forward", "/forwarding/forward", {
      headers: Writes,
      payload: Schema.Struct({
        leg_ids: Schema.Array(Schema.String),
        note: Schema.optional(Schema.String).annotate({ description: "For the suppliers; never the internal note." }),
        via: Schema.optional(Schema.Record(Schema.String, Schema.Literals(["portal", "email", "api"]))).annotate({
          description: "How a supplier gets them, by supplier id, where it should differ from its own setting."
        })
      }),
      success: Schema.Struct({ data: Schema.Array(Leg) }),
      error: WriteErrors
    }).annotate(
      OpenApi.Description,
      "Forwards legs to their suppliers. They wait a few seconds, then go by the supplier's API or mail; a supplier gets only its own lines and the address, never the customer's email or phone. Legs without a supplier or with a paused one are refused (`409`). Needs `orders.write`."
    ),
    HttpApiEndpoint.post("reroute", "/forwarding/:id/reroute", {
      params: ById,
      headers: Writes,
      payload: Schema.Struct({ supplier_id: Schema.String }),
      success: Leg,
      error: WriteErrors
    }).annotate(
      OpenApi.Description,
      "Moves a leg not yet sent to another supplier that is not paused; it is to be forwarded again, there. Needs `orders.write`."
    )
  )
  .annotate(OpenApi.Title, "Forwarding")
{}
