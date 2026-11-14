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
    "Orders.flagDelayed": ({ ids }) => orders.flagDelayed(ids),
    "Orders.clearDelay": ({ ids }) => orders.clearDelay(ids),
    "Orders.setNote": ({ id, body }) => orders.setNote(id, body),
    "Orders.refund": (input) => orders.refund(input),
    "Products.list": (input) => products.list(input),
    "Products.get": ({ id }) => products.get(id),
    "Products.edit": (input) => products.edit(input),
    "Products.setStatus": (input) => products.setStatus(input),
    "Products.reprice": (input) => products.reprice(input),
    "Products.sync": ({ id }) => products.sync(id),
    "Customers.list": (input) => customers.list(input),
    "Customers.get": ({ id }) => customers.get(id),
    "Customers.tag": (input) => customers.tag(input),
    "Customers.create": (input) => customers.create(input),
    "Customers.merge": (input) => customers.merge(input),
    "Customers.duplicates": () => customers.duplicates,
    "Customers.markNotDuplicate": ({ key }) => customers.markNotDuplicate(key)
  })
}))
