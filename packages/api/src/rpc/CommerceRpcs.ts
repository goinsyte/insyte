import { Forbidden, NotFound } from "@insyte/domain/Errors"
import { CustomerDetail, CustomerPage } from "@insyte/modules/customers/domain/Customers"
import { OrderDetail, OrderPage } from "@insyte/modules/orders/domain/Orders"
import { ProductDetail, ProductPage } from "@insyte/modules/products/domain/Products"
import { CursorInvalid, FilterFieldUnknown, ListInput } from "@insyte/modules/shared/domain/Filter"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

/**
 * Bestellingen, Producten and Klanten, read-only (M6.4): each list takes the list contract (filter, search, cursor,
 * page size, store) and answers a page with its counts; each detail one record. At the area's Bekijken, inside the
 * role's stores.
 */
const ListError = Schema.Union([Forbidden, FilterFieldUnknown, CursorInvalid])
const ById = Schema.Struct({ id: Schema.String })
const GetError = Schema.Union([Forbidden, NotFound])

export class CommerceRpcs extends RpcGroup.make(
  Rpc.make("Orders.list", { payload: ListInput, success: OrderPage, error: ListError }),
  Rpc.make("Orders.get", { payload: ById, success: OrderDetail, error: GetError }),
  Rpc.make("Products.list", { payload: ListInput, success: ProductPage, error: ListError }),
  Rpc.make("Products.get", { payload: ById, success: ProductDetail, error: GetError }),
  Rpc.make("Customers.list", { payload: ListInput, success: CustomerPage, error: ListError }),
  Rpc.make("Customers.get", { payload: ById, success: CustomerDetail, error: GetError })
)
  // Innermost first: `Member` needs the person (`Authenticated`) and the connection (`WithDb`) around it.
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
