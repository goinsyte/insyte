import { Conflict, Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import { AlreadyRefunded, RefundOverBalance, RefundOverLimit } from "@insyte/modules/orders/domain/Refunds"
import {
  AddTrackingInput,
  ApproveInput,
  AssignInput,
  IdInput,
  IllegalReturnMove,
  InspectInput,
  LabelNotPossible,
  LabelsUnavailable,
  LineNotReturnable,
  ListInput,
  RejectInput,
  ResolutionNotAllowed,
  ResolveInput,
  Returnable,
  ReturnChange,
  ReturnDetail,
  ReturnList,
  ReturnSettingsDoc,
  SendLabelInput,
  StartInput
} from "@insyte/modules/returns/domain/Returns"
import { UndoTicket } from "@insyte/modules/shared/domain/Undo"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

const Moved = Schema.Union([Forbidden, NotFound, IllegalReturnMove])

/**
 * Returns and claims (M9.1): the queue, one return, what an order can still send back, the lifecycle (each with an undo
 * token, a refund aside) and the returns policy (Retouren · Beheren to change it).
 */
export class ReturnsRpcs extends RpcGroup.make(
  Rpc.make("Returns.list", { payload: ListInput, success: ReturnList, error: Forbidden }),
  Rpc.make("Returns.get", { payload: IdInput, success: ReturnDetail, error: Schema.Union([Forbidden, NotFound]) }),
  Rpc.make("Returns.returnable", {
    payload: Schema.Struct({ orderId: Schema.String }),
    success: Returnable,
    error: Schema.Union([Forbidden, NotFound])
  }),
  Rpc.make("Returns.start", {
    payload: StartInput,
    success: ReturnChange,
    error: Schema.Union([Forbidden, NotFound, Invalid, LineNotReturnable, ResolutionNotAllowed])
  }),
  Rpc.make("Returns.approve", { payload: ApproveInput, success: ReturnChange, error: Moved }),
  Rpc.make("Returns.reject", { payload: RejectInput, success: ReturnChange, error: Moved }),
  Rpc.make("Returns.reopen", { payload: IdInput, success: ReturnChange, error: Moved }),
  Rpc.make("Returns.assign", {
    payload: AssignInput,
    success: ReturnChange,
    error: Schema.Union([Forbidden, NotFound])
  }),
  Rpc.make("Returns.addTracking", { payload: AddTrackingInput, success: ReturnChange, error: Moved }),
  Rpc.make("Returns.sendLabel", {
    payload: SendLabelInput,
    success: ReturnChange,
    error: Schema.Union([Forbidden, NotFound, IllegalReturnMove, LabelsUnavailable, LabelNotPossible])
  }),
  Rpc.make("Returns.markReceived", { payload: IdInput, success: ReturnChange, error: Moved }),
  Rpc.make("Returns.inspect", {
    payload: InspectInput,
    success: ReturnChange,
    error: Schema.Union([Forbidden, NotFound, IllegalReturnMove, LineNotReturnable])
  }),
  Rpc.make("Returns.resolve", {
    payload: ResolveInput,
    success: ReturnChange,
    error: Schema.Union([
      Forbidden,
      NotFound,
      Invalid,
      Conflict,
      IllegalReturnMove,
      ResolutionNotAllowed,
      RefundOverLimit,
      RefundOverBalance,
      AlreadyRefunded
    ])
  }),
  Rpc.make("Returns.settings", { success: ReturnSettingsDoc, error: Forbidden }),
  Rpc.make("Returns.setSettings", {
    payload: ReturnSettingsDoc,
    success: Schema.Struct({ settings: ReturnSettingsDoc, undo: UndoTicket }),
    error: Schema.Union([Forbidden, Invalid])
  })
)
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
