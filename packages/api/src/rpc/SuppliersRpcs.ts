import { Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import {
  AssignInput,
  CreateInput,
  SetPausedInput,
  SupplierChange,
  UpdateInput
} from "@insyte/modules/suppliers/domain/Commands"
import { ListInput, SupplierDetail, SupplierList } from "@insyte/modules/suppliers/domain/Suppliers"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

const ById = Schema.Struct({ id: Schema.String })

/**
 * Suppliers (M8.1): the list with each supplier's standing, one supplier, and the commands on them (Leveranciers at
 * Bewerken; removing at Beheren), each with an undo token.
 */
export class SuppliersRpcs extends RpcGroup.make(
  Rpc.make("Suppliers.list", { payload: ListInput, success: SupplierList, error: Forbidden }),
  Rpc.make("Suppliers.get", { payload: ById, success: SupplierDetail, error: Schema.Union([Forbidden, NotFound]) }),
  Rpc.make("Suppliers.create", {
    payload: CreateInput,
    success: SupplierChange,
    error: Schema.Union([Forbidden, Invalid])
  }),
  Rpc.make("Suppliers.update", {
    payload: UpdateInput,
    success: SupplierChange,
    error: Schema.Union([Forbidden, NotFound, Invalid])
  }),
  Rpc.make("Suppliers.setPaused", {
    payload: SetPausedInput,
    success: SupplierChange,
    error: Schema.Union([Forbidden, NotFound])
  }),
  Rpc.make("Suppliers.assignProducts", {
    payload: AssignInput,
    success: SupplierChange,
    error: Schema.Union([Forbidden, NotFound])
  }),
  Rpc.make("Suppliers.remove", { payload: ById, success: SupplierChange, error: Schema.Union([Forbidden, NotFound]) })
)
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
