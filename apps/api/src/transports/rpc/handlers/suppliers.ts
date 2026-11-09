import { SuppliersRpcs } from "@insyte/api/rpc/SuppliersRpcs"
import { SuppliersService } from "@insyte/modules/suppliers/Suppliers"
import { Effect } from "effect"

export const SuppliersHandlers = SuppliersRpcs.toLayer(Effect.gen(function*() {
  const suppliers = yield* SuppliersService
  return SuppliersRpcs.of({
    "Suppliers.list": (input) => suppliers.list(input),
    "Suppliers.get": ({ id }) => suppliers.get(id),
    "Suppliers.create": (input) => suppliers.create(input),
    "Suppliers.update": (input) => suppliers.update(input),
    "Suppliers.setPaused": (input) => suppliers.setPaused(input),
    "Suppliers.assignProducts": (input) => suppliers.assignProducts(input),
    "Suppliers.remove": ({ id }) => suppliers.remove(id)
  })
}))
