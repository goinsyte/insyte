import { Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import {
  CostChange,
  CostsFigures,
  CostsList,
  CreateInput,
  FiguresInput,
  IdInput,
  KindChangeNotAllowed,
  ListInput,
  MonthOutOfRange,
  NotEditable,
  SetAmountInput,
  UpdateInput
} from "@insyte/modules/costs/domain/Costs"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

/**
 * Kosten (M13 step 5): the lines and the months' figures, and every change with an undo token. Analyse · Bekijken to
 * read; `costs.write` ("Kosten bewerken") to change.
 */
export class CostsRpcs extends RpcGroup.make(
  Rpc.make("Costs.list", { payload: ListInput, success: CostsList, error: Schema.Union([Forbidden, Invalid]) }),
  Rpc.make("Costs.figures", { payload: FiguresInput, success: CostsFigures, error: Forbidden }),
  Rpc.make("Costs.create", {
    payload: CreateInput,
    success: CostChange,
    error: Schema.Union([Forbidden, Invalid, MonthOutOfRange])
  }),
  Rpc.make("Costs.update", {
    payload: UpdateInput,
    success: CostChange,
    error: Schema.Union([Forbidden, Invalid, NotFound, KindChangeNotAllowed])
  }),
  Rpc.make("Costs.setAmount", {
    payload: SetAmountInput,
    success: CostChange,
    error: Schema.Union([Forbidden, Invalid, NotFound, NotEditable, MonthOutOfRange])
  }),
  Rpc.make("Costs.readFromSource", {
    payload: IdInput,
    success: CostChange,
    error: Schema.Union([Forbidden, NotFound, NotEditable])
  }),
  Rpc.make("Costs.remove", { payload: IdInput, success: CostChange, error: Schema.Union([Forbidden, NotFound]) })
)
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
