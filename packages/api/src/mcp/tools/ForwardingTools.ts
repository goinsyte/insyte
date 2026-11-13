import { Schema } from "effect"
import { Tool, Toolkit } from "effect/ai"
import { ActionNotAllowedV1, NotFoundV1, ScopeMissingV1 } from "../../http/Errors.ts"
import { ForwardView, Leg, LegPageV1, Supplier, SupplierStatementsV1 } from "../../http/groups/ForwardingGroup.ts"
import { asKey, Governed, IdempotencyKey, WriteFailure } from "../Shared.ts"

/* Forwarding (M8): the suppliers and their statements, the queue of legs, forwarding and rerouting. */

export const ListSuppliers = Tool.make("list_suppliers", {
  description:
    "The workspace's suppliers: whether each is paused, how it takes its orders (portal, email or api), and its open and delayed orders. Use it to pick a supplier for reroute_leg. Needs suppliers.read.",
  success: Schema.Struct({ data: Schema.Array(Supplier) }),
  failure: ScopeMissingV1,
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const ListSupplierStatements = Tool.make("list_supplier_statements", {
  description:
    "A supplier's monthly statements, newest first: what the brand owes it per month (shipped lines at cost, less its returns that were refunded), in minor units of the workspace currency, and whether each is open (running month), processing (closed, to be paid) or paid. Find supplier ids with list_suppliers. Needs suppliers.read.",
  parameters: Schema.Struct({ supplier_id: Schema.String }),
  success: SupplierStatementsV1,
  failure: Schema.Union([ScopeMissingV1, NotFoundV1]),
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const ListForwarding = Tool.make("list_forwarding", {
  description:
    "The forwarding queue: each leg is one paid order's lines for one supplier. view to_forward (waiting to be sent), awaiting (sent, waiting for the supplier) or forward_error (failed, with the reason); without a view, every open leg. Needs orders.read.",
  parameters: Schema.Struct({ view: Schema.optional(ForwardView) }),
  success: LegPageV1,
  failure: ScopeMissingV1,
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const ForwardOrders = Tool.make("forward_orders", {
  description:
    "Sends legs to their suppliers: after a few seconds the supplier receives its own lines and the shipping address (never the customer's email or phone) by its API or mail, and that cannot be called back. Confirm the orders and suppliers with the person first, and pass an idempotency_key. Legs without a supplier or with a paused one are refused. Needs orders.write.",
  parameters: Schema.Struct({
    leg_ids: Schema.Array(Schema.String),
    note: Schema.optional(Schema.String).annotate({ description: "A note for the suppliers." }),
    idempotency_key: IdempotencyKey
  }),
  success: Governed(Schema.Struct({ data: Schema.Array(Leg) })),
  failure: Schema.Union([...WriteFailure.members, ActionNotAllowedV1]),
  dependencies: asKey()
}).annotate(Tool.Destructive, true)

export const RerouteLeg = Tool.make("reroute_leg", {
  description:
    "Moves a leg not yet sent (to forward, or failed) to another supplier that is not paused; it then waits to be forwarded there. Find suppliers with list_suppliers. Needs orders.write.",
  parameters: Schema.Struct({ leg_id: Schema.String, supplier_id: Schema.String, idempotency_key: IdempotencyKey }),
  success: Leg,
  failure: WriteFailure,
  dependencies: asKey()
}).annotate(Tool.Idempotent, true)

export const ForwardingTools = Toolkit.make(
  ListSuppliers,
  ListSupplierStatements,
  ListForwarding,
  ForwardOrders,
  RerouteLeg
)
