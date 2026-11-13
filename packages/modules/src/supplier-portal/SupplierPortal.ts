import type { Db } from "@insyte/database/Db"
import type { Conflict, Invalid, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import type { CurrentUser } from "@insyte/domain/Session"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import type { Relay } from "../shared/domain/Outbox.ts"
import type {
  AcceptInput,
  OrdersListInput,
  QualityListInput,
  ReportProblemInput,
  SaveStockInput,
  SetReportingInput,
  ShipInput
} from "./domain/Inputs.ts"
import type {
  CurrentSupplierContact,
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
} from "./domain/Portal.ts"
import * as Commands from "./use-cases/commands.ts"
import { held, type HeldContact } from "./use-cases/contacts.ts"
import * as Reads from "./use-cases/reads.ts"

type R = Db | CurrentPrincipal | CurrentSupplierContact

/**
 * The supplier portal (M16 step 2; widgets/06 Part A): what a supplier contact reads and does for one brand, held to
 * the supplier's own projection by RLS (`Db.scopedPartner`, 0075).
 *
 * @effect-expect-leaking Db CurrentPrincipal CurrentSupplierContact CurrentUser Relay
 */
export class SupplierPortalService extends Context.Service<SupplierPortalService, {
  /** The supplier contacts the signed-in person holds, newest first: the portal's middleware takes the first. */
  readonly held: Effect.Effect<ReadonlyArray<HeldContact>, never, Db | CurrentUser>
  readonly me: Effect.Effect<SupplierMe, never, R>
  readonly dashboard: Effect.Effect<SupplierDashboard, never, R>
  readonly listOrders: (input: OrdersListInput) => Effect.Effect<SupplierOrderList, never, R>
  readonly getOrder: (orderId: string) => Effect.Effect<SupplierOrderDetail, NotFound, R>
  readonly accept: (input: AcceptInput) => Effect.Effect<SupplierOrderChange, ScopeMissing, R>
  readonly ship: (input: ShipInput) => Effect.Effect<SupplierOrderChange, ScopeMissing, R | Relay>
  readonly reportProblem: (
    input: ReportProblemInput
  ) => Effect.Effect<SupplierOrderChange, ScopeMissing | NotFound | Conflict | Invalid, R | Relay>
  readonly listProducts: Effect.Effect<SupplierProductList, never, R>
  readonly getProduct: (productId: string) => Effect.Effect<SupplierProductDetail, NotFound, R>
  readonly saveStock: (
    input: SaveStockInput
  ) => Effect.Effect<StockChange, ScopeMissing | NotFound | Conflict | Invalid, R>
  readonly setReporting: (
    input: SetReportingInput
  ) => Effect.Effect<SupplierProductDetail, ScopeMissing | NotFound | Conflict, R>
  readonly listChecks: (input: QualityListInput) => Effect.Effect<ReadonlyArray<SupplierCheckRow>, never, R>
}>()("modules/SupplierPortalService") {
  // A database that does not answer is a defect, as everywhere.
  static readonly layer = Layer.succeed(SupplierPortalService, {
    held: held().pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    me: Reads.me().pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    dashboard: Reads.dashboard().pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    listOrders: (input) => Reads.listOrders(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    getOrder: (orderId) => Reads.getOrder(orderId).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    accept: (input) => Commands.accept(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    ship: (input) => Commands.ship(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    reportProblem: (input) => Commands.reportProblem(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    listProducts: Reads.listProducts().pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    getProduct: (productId) => Reads.getProduct(productId).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    saveStock: (input) => Commands.saveStock(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    setReporting: (input) => Commands.setReporting(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    listChecks: (input) => Reads.listChecks(input).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))
  })
}

/** `SupplierPortal.undo`'s compensation, registered as `supplier_portal.restore` where the app is composed. */
export { RESTORE, restore } from "./use-cases/commands.ts"
