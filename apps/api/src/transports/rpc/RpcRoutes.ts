import { ConsoleRpcs, RPC_PATH } from "@insyte/api/ConsoleRpcs"
import { Access } from "@insyte/modules/access/Access"
import { CustomersService } from "@insyte/modules/customers/Customers"
import { ApiKeys } from "@insyte/modules/developer/ApiKeys"
import { FirstAnalysisService } from "@insyte/modules/first-analysis/FirstAnalysis"
import { ForwardingService } from "@insyte/modules/forwarding/Forwarding"
import { MarketingService } from "@insyte/modules/marketing/Marketing"
import { Landing } from "@insyte/modules/members/Landing"
import { Members } from "@insyte/modules/members/Members"
import { NotificationsService } from "@insyte/modules/notifications/NotificationsService"
import { Onboarding } from "@insyte/modules/onboarding/Onboarding"
import { OrdersService } from "@insyte/modules/orders/Orders"
import { PrefsService } from "@insyte/modules/prefs/PrefsService"
import { ProductsService } from "@insyte/modules/products/Products"
import { RolesService } from "@insyte/modules/roles/RolesService"
import { StoresService } from "@insyte/modules/stores/Stores"
import { SuppliersService } from "@insyte/modules/suppliers/Suppliers"
import { TrackingService } from "@insyte/modules/tracking/Tracking"
import { UndoService } from "@insyte/modules/undo/Undo"
import { Workspaces } from "@insyte/modules/workspaces/Workspaces"
import { Layer } from "effect"
import { RpcSerialization } from "effect/rpc"
import { AccessHandlers } from "./handlers/access.ts"
import { CommerceHandlers } from "./handlers/commerce.ts"
import { DeveloperHandlers } from "./handlers/developer.ts"
import { FirstAnalysisHandlers } from "./handlers/first-analysis.ts"
import { ForwardingHandlers } from "./handlers/forwarding.ts"
import { LandingHandlers } from "./handlers/landing.ts"
import { MarketingHandlers } from "./handlers/marketing.ts"
import { MembersHandlers } from "./handlers/members.ts"
import { NotificationsHandlers } from "./handlers/notifications.ts"
import { OnboardingHandlers } from "./handlers/onboarding.ts"
import { PrefsHandlers } from "./handlers/prefs.ts"
import { RolesHandlers } from "./handlers/roles.ts"
import { SessionHandlers } from "./handlers/session.ts"
import { SharedHandlers } from "./handlers/shared.ts"
import { ShellHandlers } from "./handlers/shell.ts"
import { StoresHandlers } from "./handlers/stores.ts"
import { SuppliersHandlers } from "./handlers/suppliers.ts"
import { SystemHandlers } from "./handlers/system.ts"
import { TrackingHandlers } from "./handlers/tracking.ts"
import { RpcHttp } from "./RpcHttp.ts"

/** The console's RPC transport. */
export const RpcRoutes = RpcHttp(ConsoleRpcs, RPC_PATH)

/**
 * What the RPC route reads per request: the handlers and the serialization. NDJSON on both ends: the console's client
 * uses the same (13 §2). The composition root `provideMerge`s this after the transports (see `RpcHttp`).
 */
export const RpcContext = Layer.mergeAll(
  SystemHandlers,
  SessionHandlers.pipe(Layer.provide(Workspaces.layer)),
  OnboardingHandlers.pipe(
    Layer.provide(Onboarding.layer),
    Layer.provide(Layer.mergeAll(Workspaces.founder, Workspaces.setup))
  ),
  MembersHandlers.pipe(Layer.provide(Members.layer)),
  LandingHandlers.pipe(Layer.provide(Landing.layer)),
  AccessHandlers.pipe(Layer.provide(Access.layer)),
  RolesHandlers.pipe(Layer.provide(RolesService.layer)),
  DeveloperHandlers.pipe(Layer.provide(ApiKeys.layer)),
  PrefsHandlers.pipe(Layer.provide(PrefsService.layer)),
  NotificationsHandlers.pipe(Layer.provide(NotificationsService.layer)),
  StoresHandlers.pipe(Layer.provide(StoresService.layer)),
  FirstAnalysisHandlers.pipe(Layer.provide(FirstAnalysisService.layer)),
  CommerceHandlers.pipe(
    Layer.provide(Layer.mergeAll(OrdersService.layer, ProductsService.layer, CustomersService.layer))
  ),
  SharedHandlers.pipe(Layer.provide(UndoService.layer)),
  MarketingHandlers.pipe(Layer.provide(MarketingService.layer)),
  SuppliersHandlers.pipe(Layer.provide(SuppliersService.layer)),
  ForwardingHandlers.pipe(Layer.provide(ForwardingService.layer)),
  TrackingHandlers.pipe(Layer.provide(TrackingService.layer)),
  ShellHandlers.pipe(
    Layer.provide(
      Layer.mergeAll(
        Members.layer,
        NotificationsService.layer,
        PrefsService.layer,
        Workspaces.layer,
        OrdersService.layer,
        ProductsService.layer,
        CustomersService.layer
      )
    )
  )
).pipe(
  Layer.provideMerge(RpcSerialization.layerNdjson)
)
