import { SupplierPortalRpcs } from "@insyte/api/rpc/SupplierPortalRpcs"
import { SupplierPortalService } from "@insyte/modules/supplier-portal/SupplierPortal"
import { UndoService } from "@insyte/modules/undo/Undo"
import { Effect } from "effect"

export const SupplierPortalHandlers = SupplierPortalRpcs.toLayer(Effect.gen(function*() {
  const portal = yield* SupplierPortalService
  const undo = yield* UndoService
  return SupplierPortalRpcs.of({
    "SupplierPortal.me": () => portal.me,
    "SupplierPortal.dashboard": () => portal.dashboard,
    "SupplierPortal.orders.list": (input) => portal.listOrders(input),
    "SupplierPortal.orders.get": ({ orderId }) => portal.getOrder(orderId),
    "SupplierPortal.orders.accept": (input) => portal.accept(input),
    "SupplierPortal.orders.ship": (input) => portal.ship(input),
    "SupplierPortal.orders.reportProblem": (input) => portal.reportProblem(input),
    "SupplierPortal.products.list": () => portal.listProducts,
    "SupplierPortal.products.get": ({ productId }) => portal.getProduct(productId),
    "SupplierPortal.products.saveStock": (input) => portal.saveStock(input),
    "SupplierPortal.products.setReporting": (input) => portal.setReporting(input),
    "SupplierPortal.quality.list": (input) => portal.listChecks(input),
    "SupplierPortal.undo": ({ token }) => undo.undo(token)
  })
}))
