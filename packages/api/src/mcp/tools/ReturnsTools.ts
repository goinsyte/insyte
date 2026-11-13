import { Schema } from "effect"
import { Tool, Toolkit } from "effect/ai"
import {
  ActionNotAllowedV1,
  ConflictV1,
  IdempotencyKeyReusedV1,
  NotFoundV1,
  RefundOverLimitV1,
  ScopeMissingV1,
  ValidationFailedV1
} from "../../http/Errors.ts"
import { Return, ReturnDetailV1, ReturnPageV1, ReturnStatusFilter } from "../../http/groups/ReturnsGroup.ts"
import { asKey, Governed, IdempotencyKey, OrderId, WriteFailure } from "../Shared.ts"

/* Returns and claims (M9): the queue, one return, and every move from starting one to settling it. */

const ReturnId = Schema.String.annotate({ description: "The return's id (ret_…), as list_returns gives it." })
const ResolutionKind = Schema.Literals(["refund", "exchange", "gift_card", "replacement", "discount"])
const ReturnMoveFailure = WriteFailure

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
  success: Governed(Return),
  failure: Schema.Union([...ReturnMoveFailure.members, ActionNotAllowedV1]),
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
  success: Governed(Return),
  failure: Schema.Union([...ReturnMoveFailure.members, ActionNotAllowedV1]),
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
  success: Governed(Return),
  failure: Schema.Union([
    ActionNotAllowedV1,
    ScopeMissingV1,
    NotFoundV1,
    ConflictV1,
    ValidationFailedV1,
    IdempotencyKeyReusedV1,
    RefundOverLimitV1
  ]),
  dependencies: asKey()
}).annotate(Tool.Destructive, true)

export const ReturnsTools = Toolkit.make(
  ListReturns,
  GetReturn,
  StartReturn,
  ApproveReturn,
  RejectReturn,
  SendReturnLabel,
  AddReturnTracking,
  ReceiveReturn,
  InspectReturn,
  ResolveReturn
)
