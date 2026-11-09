import { Conflict, Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import { CustomerDetail, CustomerPage } from "@insyte/modules/customers/domain/Customers"
import {
  CancelInput,
  IdsInput,
  NoteInput,
  OrderChange,
  ShippingInput,
  TagCount,
  TagInput
} from "@insyte/modules/orders/domain/Commands"
import { OrderDetail, OrderPage } from "@insyte/modules/orders/domain/Orders"
import {
  AlreadyRefunded,
  RefundInput,
  RefundOverBalance,
  RefundOverLimit,
  RefundResult
} from "@insyte/modules/orders/domain/Refunds"
import {
  EditInput,
  ProductChange,
  RepriceInput,
  RepriceResult,
  StatusInput
} from "@insyte/modules/products/domain/Commands"
import { ProductDetail, ProductPage } from "@insyte/modules/products/domain/Products"
import { CursorInvalid, FilterFieldUnknown, ListInput } from "@insyte/modules/shared/domain/Filter"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

/**
 * Bestellingen, Producten and Klanten (M6.4): each list takes the list contract (filter, search, cursor, page size,
 * store) and answers a page with its counts; each detail one record. At the area's Bekijken, inside the role's stores.
 * The order commands (M7.1) at Bestellingen · Bewerken answer the orders they changed and, where it can be taken
 * back, the undo token (`Shared.undo`); a cancellation has none.
 */
const ListError = Schema.Union([Forbidden, FilterFieldUnknown, CursorInvalid])
const ById = Schema.Struct({ id: Schema.String })
const GetError = Schema.Union([Forbidden, NotFound])

export class CommerceRpcs extends RpcGroup.make(
  Rpc.make("Orders.list", { payload: ListInput, success: OrderPage, error: ListError }),
  Rpc.make("Orders.get", { payload: ById, success: OrderDetail, error: GetError }),
  Rpc.make("Orders.tags", { success: Schema.Array(TagCount), error: Forbidden }),
  Rpc.make("Orders.tag", {
    payload: TagInput,
    success: OrderChange,
    error: Schema.Union([Forbidden, NotFound, Invalid])
  }),
  Rpc.make("Orders.markFulfilled", {
    payload: IdsInput,
    success: OrderChange,
    error: Schema.Union([Forbidden, NotFound, Conflict])
  }),
  Rpc.make("Orders.updateShipping", {
    payload: ShippingInput,
    success: OrderChange,
    error: Schema.Union([Forbidden, NotFound, Invalid, Conflict])
  }),
  Rpc.make("Orders.cancel", {
    payload: CancelInput,
    success: OrderChange,
    error: Schema.Union([Forbidden, NotFound, Conflict])
  }),
  Rpc.make("Orders.setNote", { payload: NoteInput, error: GetError }),
  // Irreversible (api.md §1.1): Terugbetalen within the role's limit, confirmed in the console, no undo.
  Rpc.make("Orders.refund", {
    payload: RefundInput,
    success: RefundResult,
    error: Schema.Union([Forbidden, NotFound, Conflict, RefundOverLimit, RefundOverBalance, AlreadyRefunded])
  }),
  Rpc.make("Products.list", { payload: ListInput, success: ProductPage, error: ListError }),
  Rpc.make("Products.get", { payload: ById, success: ProductDetail, error: GetError }),
  Rpc.make("Products.edit", {
    payload: EditInput,
    success: ProductChange,
    error: Schema.Union([Forbidden, NotFound, Conflict])
  }),
  Rpc.make("Products.setStatus", { payload: StatusInput, success: ProductChange, error: GetError }),
  Rpc.make("Products.reprice", { payload: RepriceInput, success: RepriceResult, error: GetError }),
  Rpc.make("Products.sync", { payload: ById, error: Schema.Union([Forbidden, NotFound, Conflict]) }),
  Rpc.make("Customers.list", { payload: ListInput, success: CustomerPage, error: ListError }),
  Rpc.make("Customers.get", { payload: ById, success: CustomerDetail, error: GetError })
)
  // Innermost first: `Member` needs the person (`Authenticated`) and the connection (`WithDb`) around it.
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
