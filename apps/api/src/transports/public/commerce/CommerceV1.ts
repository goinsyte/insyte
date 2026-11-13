import type { ListQuery } from "@insyte/api/http/Paging"
import { CustomersService } from "@insyte/modules/customers/Customers"
import { OrdersService } from "@insyte/modules/orders/Orders"
import { ProductsService } from "@insyte/modules/products/Products"
import { Context, Effect, Layer } from "effect"
import { scopeMissing } from "../shared/errors.ts"
import { invalid, listInput } from "../shared/paging.ts"
import { customerPageV1, orderPageV1, productPageV1 } from "./present.ts"

/* The commerce mirror's lists (M6.4, M19.2, M19.3): orders, products and customers, a page at a time. */

const make = Effect.gen(function*() {
  const orders = yield* OrdersService
  const products = yield* ProductsService
  const customers = yield* CustomersService
  return {
    orders: (query: ListQuery) =>
      orders.list(listInput(query, "status")).pipe(
        Effect.map(orderPageV1),
        Effect.catchTags({
          Forbidden: scopeMissing,
          CursorInvalid: () => invalid("cursor"),
          FilterFieldUnknown: () => invalid("status")
        })
      ),
    products: (query: ListQuery) =>
      products.list(listInput(query, "status")).pipe(
        Effect.map(productPageV1),
        Effect.catchTags({
          Forbidden: scopeMissing,
          CursorInvalid: () => invalid("cursor"),
          FilterFieldUnknown: () => invalid("status")
        })
      ),
    customers: (query: ListQuery) =>
      customers.list(listInput(query, undefined)).pipe(
        Effect.map(customerPageV1),
        Effect.catchTags({
          Forbidden: scopeMissing,
          CursorInvalid: () => invalid("cursor"),
          FilterFieldUnknown: () => invalid("status")
        })
      )
  }
})

/**
 * The commerce lists, as the key the door let in.
 *
 * @effect-expect-leaking CurrentPrincipal CurrentApiKey Db
 */
export class CommerceV1 extends Context.Service<CommerceV1, Effect.Success<typeof make>>()("api-worker/CommerceV1") {
  static readonly layer = Layer.effect(this, make).pipe(
    Layer.provide(Layer.mergeAll(OrdersService.layer, ProductsService.layer, CustomersService.layer))
  )
}
