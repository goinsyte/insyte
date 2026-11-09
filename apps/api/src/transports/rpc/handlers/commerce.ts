import { CommerceRpcs } from "@insyte/api/rpc/CommerceRpcs"
import { CustomersService } from "@insyte/modules/customers/Customers"
import { OrdersService } from "@insyte/modules/orders/Orders"
import { ProductsService } from "@insyte/modules/products/Products"
import { Effect } from "effect"

export const CommerceHandlers = CommerceRpcs.toLayer(Effect.gen(function*() {
  const orders = yield* OrdersService
  const products = yield* ProductsService
  const customers = yield* CustomersService
  return CommerceRpcs.of({
    "Orders.list": (input) => orders.list(input),
    "Orders.get": ({ id }) => orders.get(id),
    "Orders.tags": () => orders.tags,
    "Orders.tag": (input) => orders.tag(input),
    "Orders.markFulfilled": ({ ids }) => orders.markFulfilled(ids),
    "Orders.updateShipping": (input) => orders.updateShipping(input),
    "Orders.cancel": (input) => orders.cancel(input),
    "Orders.setNote": ({ id, body }) => orders.setNote(id, body),
    "Products.list": (input) => products.list(input),
    "Products.get": ({ id }) => products.get(id),
    "Customers.list": (input) => customers.list(input),
    "Customers.get": ({ id }) => customers.get(id)
  })
}))
