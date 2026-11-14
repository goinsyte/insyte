import { Conflict, Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import {
  AcceptInput,
  OrderRef,
  OrdersListInput,
  ProductRef,
  QualityListInput,
  ReportProblemInput,
  SaveStockInput,
  SetReportingInput,
  ShipInput,
  UndoInput
} from "@insyte/modules/supplier-portal/domain/Inputs"
import {
  ScopeMissing,
  StockChange,
  SupplierCheckRow,
  SupplierDashboard,
  SupplierMe,
  SupplierOrderChange,
  SupplierOrderDetail,
  SupplierOrderList,
  SupplierProductDetail,
  SupplierProductList
} from "@insyte/modules/supplier-portal/domain/Portal"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { SupplierContact } from "./SupplierContact.ts"
import { WithDb } from "./WithDb.ts"

/**
 * The supplier portal (M16 step 2; widgets/06 Part A), for a supplier contact signed in to one brand: its orders,
 * products, stock and checks, never the brand's own. An order or product that is not the supplier's is `NotFound`.
 */
export class SupplierPortalRpcs extends RpcGroup.make(
  Rpc.make("SupplierPortal.me", { success: SupplierMe }),
  Rpc.make("SupplierPortal.dashboard", { success: SupplierDashboard }),
  Rpc.make("SupplierPortal.orders.list", { payload: OrdersListInput, success: SupplierOrderList }),
  Rpc.make("SupplierPortal.orders.get", { payload: OrderRef, success: SupplierOrderDetail, error: NotFound }),
  Rpc.make("SupplierPortal.orders.accept", {
    payload: AcceptInput,
    success: SupplierOrderChange,
    error: ScopeMissing
  }),
  Rpc.make("SupplierPortal.orders.ship", { payload: ShipInput, success: SupplierOrderChange, error: ScopeMissing }),
  Rpc.make("SupplierPortal.orders.reportProblem", {
    payload: ReportProblemInput,
    success: SupplierOrderChange,
    error: Schema.Union([ScopeMissing, NotFound, Conflict, Invalid])
  }),
  Rpc.make("SupplierPortal.products.list", { success: SupplierProductList }),
  Rpc.make("SupplierPortal.products.get", { payload: ProductRef, success: SupplierProductDetail, error: NotFound }),
  Rpc.make("SupplierPortal.products.saveStock", {
    payload: SaveStockInput,
    success: StockChange,
    error: Schema.Union([ScopeMissing, NotFound, Conflict, Invalid])
  }),
  Rpc.make("SupplierPortal.products.setReporting", {
    payload: SetReportingInput,
    success: SupplierProductDetail,
    error: Schema.Union([ScopeMissing, NotFound, Conflict])
  }),
  Rpc.make("SupplierPortal.quality.list", { payload: QualityListInput, success: Schema.Array(SupplierCheckRow) }),
  Rpc.make("SupplierPortal.undo", { payload: UndoInput, error: Schema.Union([Forbidden, NotFound, Conflict]) })
)
  .middleware(SupplierContact)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
