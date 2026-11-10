import { Db } from "@insyte/database/Db"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Schema } from "effect"
import { Tool, Toolkit } from "effect/ai"
import {
  ConflictV1,
  CurrentApiKey,
  CustomerPageV1,
  ForwardView,
  IdempotencyKeyReusedV1,
  InvalidRequestV1,
  Leg,
  LegPageV1,
  Me,
  Member,
  NotFoundV1,
  Order,
  OrderDetailV1,
  OrderPageV1,
  ProductPageV1,
  ProposalV1,
  QueuePageV1,
  QueueTabV1,
  Refund,
  RefundOverLimitV1,
  Return,
  ReturnDetailV1,
  ReturnPageV1,
  ReturnStatusFilter,
  Role,
  ScopeMissingV1,
  Supplier,
  Ticket,
  TicketComment,
  TicketDetailV1,
  TicketPageV1,
  TicketPriorityV1,
  TicketStatusV1,
  TicketViewFilter,
  TrackingV1,
  ValidationFailedV1
} from "../http/PublicApi.ts"

/*
 * The MCP server's tools (M19.3): what an agent with an API key may read, in the public API's shapes, and the order
 * commands (M7), forwarding (M8), returns (M9) and tickets (M11) as `/v1` has them. The same key, the same scopes, the same request log; inviting, removing and
 * changing roles stay with people.
 */

/** What the key door provides: every tool runs as the key. */
const asKey = () => [CurrentPrincipal, CurrentApiKey, Db]

export const Whoami = Tool.make("whoami", {
  description: "The API key in use: its label, its scopes and the Insyte workspace it belongs to.",
  success: Me,
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const ListMembers = Tool.make("list_members", {
  description: "The workspace's team members: name, email, role and whether they are active. Needs team.read.",
  success: Schema.Struct({ data: Schema.Array(Member) }),
  failure: ScopeMissingV1,
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const ListRoles = Tool.make("list_roles", {
  description: "The workspace's roles and what each may do per area (none, read, write, manage). Needs team.read.",
  success: Schema.Struct({ data: Schema.Array(Role) }),
  failure: ScopeMissingV1,
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

/** What every list tool takes: the `/v1` list's query, typed. */
const ListParameters = Schema.Struct({
  limit: Schema.optional(Schema.Int).annotate({ description: "Rows per page, 1 to 200; 50 by default." }),
  cursor: Schema.optional(Schema.String).annotate({ description: "The next_cursor of the previous page." }),
  q: Schema.optional(Schema.String).annotate({ description: "Search text." }),
  store_id: Schema.optional(Schema.String).annotate({ description: "One store only." }),
  status: Schema.optional(Schema.String).annotate({ description: "One status only." })
})

export const ListOrders = Tool.make("list_orders", {
  description:
    "The workspace's orders as Shopify holds them, newest first: number, customer, status, payment, fulfilment, total, tracking. `q` searches the number and the customer. Needs orders.read.",
  parameters: ListParameters,
  success: OrderPageV1,
  failure: Schema.Union([ScopeMissingV1, InvalidRequestV1]),
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const ListProducts = Tool.make("list_products", {
  description: "The workspace's products by title: status, vendor, price range and stock. Needs products.read.",
  parameters: ListParameters,
  success: ProductPageV1,
  failure: Schema.Union([ScopeMissingV1, InvalidRequestV1]),
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const ListCustomers = Tool.make("list_customers", {
  description:
    "The workspace's customers by name: email, country, order count and lifetime value. Needs customers.read.",
  parameters: ListParameters,
  success: CustomerPageV1,
  failure: Schema.Union([ScopeMissingV1, InvalidRequestV1]),
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

const OrderId = Schema.String.annotate({ description: "The order's id (ord_…), as list_orders gives it." })
const IdempotencyKey = Schema.optional(Schema.String).annotate({
  description: "Your own key for doing this once: the same key again answers the first result instead of acting twice."
})
const WriteFailure = Schema.Union([ScopeMissingV1, NotFoundV1, ConflictV1, ValidationFailedV1, IdempotencyKeyReusedV1])

export const GetOrder = Tool.make("get_order", {
  description:
    "One order with its lines, shipping address, the team's internal note and its refunds. Needs orders.read.",
  parameters: Schema.Struct({ order_id: OrderId }),
  success: OrderDetailV1,
  failure: Schema.Union([ScopeMissingV1, NotFoundV1]),
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const TagOrder = Tool.make("tag_order", {
  description:
    "Adds and removes the order's tags; Shopify hears it a few seconds later. Insyte's own markers (at_risk, tracking_sent, draft) cannot be set. Needs orders.write.",
  parameters: Schema.Struct({
    order_id: OrderId,
    add: Schema.optional(Schema.Array(Schema.String)),
    remove: Schema.optional(Schema.Array(Schema.String)),
    idempotency_key: IdempotencyKey
  }),
  success: Order,
  failure: WriteFailure,
  dependencies: asKey()
}).annotate(Tool.Idempotent, true)

export const SetOrderNote = Tool.make("set_order_note", {
  description:
    "Sets the team's internal note on the order; an empty body clears it. Never sent to Shopify or a supplier. Needs orders.write.",
  parameters: Schema.Struct({ order_id: OrderId, body: Schema.String, idempotency_key: IdempotencyKey }),
  success: OrderDetailV1,
  failure: WriteFailure,
  dependencies: asKey()
}).annotate(Tool.Idempotent, true)

export const UpdateShippingAddress = Tool.make("update_shipping_address", {
  description:
    "Changes the order's shipping address (the name and phone stay); Shopify hears it a few seconds later. country is ISO 3166 alpha-2. Needs orders.write.",
  parameters: Schema.Struct({
    order_id: OrderId,
    line1: Schema.String,
    line2: Schema.optional(Schema.NullOr(Schema.String)),
    city: Schema.String,
    postcode: Schema.String,
    region: Schema.optional(Schema.String),
    country: Schema.String,
    idempotency_key: IdempotencyKey
  }),
  success: Order,
  failure: WriteFailure,
  dependencies: asKey()
}).annotate(Tool.Idempotent, true)

export const CancelOrder = Tool.make("cancel_order", {
  description:
    "Cancels the order in Insyte and Shopify, without a refund. IRREVERSIBLE: confirm with the person first, and pass an idempotency_key. Refused for an order already closed or with parcels on their way. Needs orders.write.",
  parameters: Schema.Struct({
    order_id: OrderId,
    restock: Schema.Boolean,
    notify_customer: Schema.Boolean,
    idempotency_key: IdempotencyKey
  }),
  success: Order,
  failure: WriteFailure,
  dependencies: asKey()
}).annotate(Tool.Destructive, true)

export const RefundOrder = Tool.make("refund_order", {
  description:
    "Refunds part or all of what is left on the order, through its original payments. IRREVERSIBLE: money leaves; confirm the amount with the person first, and pass an idempotency_key. Needs orders.write and refunds.write, within the key's limit.",
  parameters: Schema.Struct({
    order_id: OrderId,
    amount_minor: Schema.Int.annotate({ description: "In the order's currency, minor units (cents)." }),
    note: Schema.optional(Schema.String),
    idempotency_key: IdempotencyKey
  }),
  success: Refund,
  failure: Schema.Union([
    ScopeMissingV1,
    NotFoundV1,
    ConflictV1,
    ValidationFailedV1,
    IdempotencyKeyReusedV1,
    RefundOverLimitV1
  ]),
  dependencies: asKey()
}).annotate(Tool.Destructive, true)

export const GetOrderTracking = Tool.make("get_order_tracking", {
  description:
    "Where an order's parcels are: carrier, tracking number, status (pending, in_transit, out_for_delivery, delivered, exception), the latest checkpoint and any exception; whether the order is delayed. Needs orders.read.",
  parameters: Schema.Struct({ order_id: OrderId }),
  success: TrackingV1,
  failure: Schema.Union([ScopeMissingV1, NotFoundV1]),
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const ListSuppliers = Tool.make("list_suppliers", {
  description:
    "The workspace's suppliers: whether each is paused, how it takes its orders (portal, email or api), and its open and delayed orders. Use it to pick a supplier for reroute_leg. Needs suppliers.read.",
  success: Schema.Struct({ data: Schema.Array(Supplier) }),
  failure: ScopeMissingV1,
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
  success: Schema.Struct({ data: Schema.Array(Leg) }),
  failure: WriteFailure,
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

const ReturnId = Schema.String.annotate({ description: "The return's id (ret_…), as list_returns gives it." })
const ResolutionKind = Schema.Literals(["refund", "exchange", "gift_card", "replacement", "discount"])
const ReturnMoveFailure = WriteFailure

export const ListQueue = Tool.make("list_queue", {
  description:
    "What needs the team on Start, ranked by how soon: delayed orders, returns waiting for review, quality checks sent in, sold-out variants, stores without their link. tab needs_you (default: red or amber), drawn, or all (with what was seen in the last day).",
  parameters: Schema.Struct({ tab: Schema.optional(QueueTabV1) }),
  success: QueuePageV1,
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

const ProposalId = Schema.String.annotate({
  description: "The plate's id (prp_…), as a list_queue row's proposal gives it."
})

export const GetProposal = Tool.make("get_proposal", {
  description:
    "One plate Insyte drew for a queue row: what it found, the record as it stands and as drawn, the confidence (0–1, computed from the records) with what it rests on, and what filing runs. Needs the read scope of its record.",
  parameters: Schema.Struct({ proposal_id: ProposalId }),
  success: ProposalV1,
  failure: Schema.Union([ScopeMissingV1, NotFoundV1]),
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const FileProposal = Tool.make("file_proposal", {
  description:
    "Files an open plate: the command it carries runs as this key (approve_return needs returns.write and returns.approve; a quality check needs quality.approve). Read the plate first and file only what the person you act for would; refused with a conflict when it is no longer open (closed) or its record moved on (stale).",
  parameters: Schema.Struct({ proposal_id: ProposalId, idempotency_key: IdempotencyKey }),
  success: ProposalV1,
  failure: WriteFailure,
  dependencies: asKey()
}).annotate(Tool.Idempotent, true)

export const ListReturns = Tool.make("list_returns", {
  description:
    "Returns and claims, newest first, with the queue's counts: status review (to approve or reject; late past review_by), awaiting_parcel, in_transit, received, ready (to settle), resolved or rejected. Needs returns.read.",
  parameters: Schema.Struct({ status: Schema.optional(ReturnStatusFilter) }),
  success: ReturnPageV1,
  failure: ScopeMissingV1,
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const GetReturn = Tool.make("get_return", {
  description:
    "One return with its lines, whether it is inside its window, and the resolutions it allows with what each moves. Needs returns.read.",
  parameters: Schema.Struct({ return_id: ReturnId }),
  success: ReturnDetailV1,
  failure: Schema.Union([ScopeMissingV1, NotFoundV1]),
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const StartReturn = Tool.make("start_return", {
  description:
    "Starts a return or claim for a shopper on an order's lines (line ids from get_order); it waits for review. A claim reason (damaged, wrong_item, quality) makes it a claim. Needs returns.write.",
  parameters: Schema.Struct({
    order_id: OrderId,
    lines: Schema.Array(Schema.Struct({ line_id: Schema.String, quantity: Schema.Int })),
    reason_id: Schema.String.annotate({
      description: "too_small, too_big, not_as_expected, damaged, wrong_item, quality, or the workspace's own."
    }),
    requested_resolution: ResolutionKind,
    note: Schema.optional(Schema.String).annotate({ description: "What the shopper said." }),
    idempotency_key: IdempotencyKey
  }),
  success: Return,
  failure: ReturnMoveFailure,
  dependencies: asKey()
}).annotate(Tool.Idempotent, true)

export const ApproveReturn = Tool.make("approve_return", {
  description:
    "Approves a return in review: it then waits for its parcel; a claim with keep_item goes straight to be settled. Needs returns.write and returns.approve.",
  parameters: Schema.Struct({
    return_id: ReturnId,
    keep_item: Schema.optional(Schema.Boolean),
    idempotency_key: IdempotencyKey
  }),
  success: Return,
  failure: ReturnMoveFailure,
  dependencies: asKey()
}).annotate(Tool.Idempotent, true)

export const RejectReturn = Tool.make("reject_return", {
  description:
    "Rejects a return in review or waiting for its parcel, with a reason the shopper reads. Needs returns.write and returns.approve.",
  parameters: Schema.Struct({ return_id: ReturnId, reason: Schema.String, idempotency_key: IdempotencyKey }),
  success: Return,
  failure: ReturnMoveFailure,
  dependencies: asKey()
}).annotate(Tool.Idempotent, true)

export const AddReturnTracking = Tool.make("add_return_tracking", {
  description:
    "Records the carrier and tracking number a shopper sent their return parcel with themselves (\"zelf versturen\"), for a return waiting for its parcel without a label from Insyte; AfterShip then follows it. Needs returns.write.",
  parameters: Schema.Struct({
    return_id: ReturnId,
    carrier: Schema.Literals(["PostNL", "DHL", "DPD", "UPS"]),
    tracking: Schema.String,
    idempotency_key: IdempotencyKey
  }),
  success: Return,
  failure: ReturnMoveFailure,
  dependencies: asKey()
}).annotate(Tool.Idempotent, true)

export const SendReturnLabel = Tool.make("send_return_label", {
  description:
    "Asks for a return label for a return waiting for its parcel, from the carrier its return address names; the label is made a few seconds later and costs the store the carrier's price, so confirm with the person first. Refused where no carrier is set up or the return has no address to make one with. Needs returns.write.",
  parameters: Schema.Struct({ return_id: ReturnId, idempotency_key: IdempotencyKey }),
  success: Return,
  failure: ReturnMoveFailure,
  dependencies: asKey()
}).annotate(Tool.Idempotent, true).annotate(Tool.Destructive, true)

export const ReceiveReturn = Tool.make("receive_return", {
  description: "Marks a return's parcel received. Needs returns.write.",
  parameters: Schema.Struct({ return_id: ReturnId, idempotency_key: IdempotencyKey }),
  success: Return,
  failure: ReturnMoveFailure,
  dependencies: asKey()
}).annotate(Tool.Idempotent, true)

export const InspectReturn = Tool.make("inspect_return", {
  description:
    "Records a received return's inspection (each line ok, damaged or missing, and whether it goes back on the shelf; without lines, all in order); it is then ready to settle. Needs returns.write.",
  parameters: Schema.Struct({
    return_id: ReturnId,
    lines: Schema.optional(Schema.Array(Schema.Struct({
      line_id: Schema.String,
      condition: Schema.Literals(["ok", "damaged", "missing"]),
      restock: Schema.Boolean
    }))),
    idempotency_key: IdempotencyKey
  }),
  success: Return,
  failure: ReturnMoveFailure,
  dependencies: asKey()
}).annotate(Tool.Idempotent, true)

export const ResolveReturn = Tool.make("resolve_return", {
  description:
    "Settles a return that is ready, with one of its allowed resolutions (get_return). A refund is IRREVERSIBLE: money goes back through the order's payments; confirm it with the person first and pass an idempotency_key. Needs returns.write, and refunds.write within the key's limit for a refund.",
  parameters: Schema.Struct({ return_id: ReturnId, resolution: ResolutionKind, idempotency_key: IdempotencyKey }),
  success: Return,
  failure: Schema.Union([
    ScopeMissingV1,
    NotFoundV1,
    ConflictV1,
    ValidationFailedV1,
    IdempotencyKeyReusedV1,
    RefundOverLimitV1
  ]),
  dependencies: asKey()
}).annotate(Tool.Destructive, true)

const TicketId = Schema.String.annotate({ description: "The ticket's id (tkt_…), as list_tickets gives it." })
const MemberId = Schema.String.annotate({ description: "A teammate's member id (mem_…), as list_members gives it." })

export const ListTickets = Tool.make("list_tickets", {
  description:
    "Tickets in the board's order, with each view's count: by default every one, or one view (all is the board, open is not done and not set aside, unassigned, snoozed, done, archived, spam, trash). Needs support.read.",
  parameters: Schema.Struct({ view: Schema.optional(TicketViewFilter) }),
  success: TicketPageV1,
  failure: ScopeMissingV1,
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const GetTicket = Tool.make("get_ticket", {
  description: "One ticket with its comments, newest first. Needs support.read.",
  parameters: Schema.Struct({ ticket_id: TicketId }),
  success: TicketDetailV1,
  failure: Schema.Union([ScopeMissingV1, NotFoundV1]),
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const CreateTicket = Tool.make("create_ticket", {
  description:
    "Writes a ticket, at the top of the board, optionally about one order or one customer; its assignees hear of it. Needs support.write.",
  parameters: Schema.Struct({
    title: Schema.String,
    description: Schema.optional(Schema.String),
    status: Schema.optional(TicketStatusV1),
    priority: Schema.optional(TicketPriorityV1),
    assignee_ids: Schema.optional(Schema.Array(MemberId)),
    labels: Schema.optional(Schema.Array(Schema.String)),
    due_at: Schema.optional(Schema.String).annotate({ description: "ISO 8601." }),
    order_id: Schema.optional(OrderId),
    customer_id: Schema.optional(Schema.String),
    idempotency_key: IdempotencyKey
  }),
  success: Ticket,
  failure: WriteFailure,
  dependencies: asKey()
}).annotate(Tool.Idempotent, true)

export const UpdateTicket = Tool.make("update_ticket", {
  description:
    "Changes a ticket's title, description, priority, deadline (null clears it) or its whole set of labels. Needs support.write.",
  parameters: Schema.Struct({
    ticket_id: TicketId,
    title: Schema.optional(Schema.String),
    description: Schema.optional(Schema.String),
    priority: Schema.optional(TicketPriorityV1),
    due_at: Schema.optional(Schema.NullOr(Schema.String)),
    labels: Schema.optional(Schema.Array(Schema.String)),
    idempotency_key: IdempotencyKey
  }),
  success: Ticket,
  failure: WriteFailure,
  dependencies: asKey()
}).annotate(Tool.Idempotent, true)

export const SetTicketStatus = Tool.make("set_ticket_status", {
  description: "Moves a ticket to intake, in_progress, awaiting_reply or done. Needs support.write.",
  parameters: Schema.Struct({ ticket_id: TicketId, status: TicketStatusV1, idempotency_key: IdempotencyKey }),
  success: Ticket,
  failure: WriteFailure,
  dependencies: asKey()
}).annotate(Tool.Idempotent, true)

export const AssignTicket = Tool.make("assign_ticket", {
  description: "Puts a teammate on a ticket (they hear of it), or takes them off with unassign. Needs support.write.",
  parameters: Schema.Struct({
    ticket_id: TicketId,
    member_id: MemberId,
    unassign: Schema.optional(Schema.Boolean),
    idempotency_key: IdempotencyKey
  }),
  success: Ticket,
  failure: WriteFailure,
  dependencies: asKey()
}).annotate(Tool.Idempotent, true)

export const CommentOnTicket = Tool.make("comment_on_ticket", {
  description:
    "Adds a comment to a ticket's activity, as the key; the teammates in mentions hear of it. Needs support.write.",
  parameters: Schema.Struct({
    ticket_id: TicketId,
    body: Schema.String,
    mentions: Schema.optional(Schema.Array(MemberId)),
    idempotency_key: IdempotencyKey
  }),
  success: TicketComment,
  failure: WriteFailure,
  dependencies: asKey()
}).annotate(Tool.Idempotent, true)

export const InsyteTools = Toolkit.make(
  Whoami,
  ListMembers,
  ListRoles,
  ListOrders,
  ListProducts,
  ListCustomers,
  GetOrder,
  TagOrder,
  SetOrderNote,
  UpdateShippingAddress,
  CancelOrder,
  RefundOrder,
  GetOrderTracking,
  ListSuppliers,
  ListForwarding,
  ForwardOrders,
  RerouteLeg,
  ListQueue,
  GetProposal,
  FileProposal,
  ListReturns,
  GetReturn,
  StartReturn,
  ApproveReturn,
  RejectReturn,
  SendReturnLabel,
  AddReturnTracking,
  ReceiveReturn,
  InspectReturn,
  ResolveReturn,
  ListTickets,
  GetTicket,
  CreateTicket,
  UpdateTicket,
  SetTicketStatus,
  AssignTicket,
  CommentOnTicket
)
