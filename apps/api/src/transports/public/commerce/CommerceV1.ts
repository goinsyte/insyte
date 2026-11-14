import type { LowStockQuery } from "@insyte/api/http/groups/CommerceGroup"
import type { ListQuery } from "@insyte/api/http/Paging"
import { CustomersService } from "@insyte/modules/customers/Customers"
import { OrdersService } from "@insyte/modules/orders/Orders"
import { ProductsService } from "@insyte/modules/products/Products"
import { Context, Effect, Layer } from "effect"
import { scopeMissing } from "../shared/errors.ts"
import { invalid, listInput } from "../shared/paging.ts"
import { customerPageV1, lowStockV1, orderPageV1, productPageV1 } from "./present.ts"

/* The commerce mirror's lists (M6.4, M19.2, M19.3): orders, products and customers, a page at a time; what runs low. */

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
    lowStock: (query: LowStockQuery) =>
      products.lowStock({
        ...(query.store_id === undefined ? {} : { storeId: query.store_id }),
        ...(query.threshold === undefined
          ? {}
          : { threshold: Math.min(100_000, Math.max(0, Math.floor(query.threshold))) }),
        ...(query.limit === undefined ? {} : { limit: Math.min(200, Math.max(1, Math.floor(query.limit))) })
      }).pipe(Effect.map(lowStockV1), Effect.catchTag("Forbidden", scopeMissing)),
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
