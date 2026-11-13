import { ConsoleRpcs, RPC_PATH } from "@insyte/api/ConsoleRpcs"
import { Access } from "@insyte/modules/access/Access"
import { AnalyticsService } from "@insyte/modules/analytics/Analytics"
import { AuditService } from "@insyte/modules/audit/Audit"
import { AutomationsService } from "@insyte/modules/automations/Automations"
import { RunsService } from "@insyte/modules/automations/Runs"
import { ChargebacksService } from "@insyte/modules/chargebacks/Chargebacks"
import { ChatsService } from "@insyte/modules/chats/Chats"
import { CostsService } from "@insyte/modules/costs/Costs"
import { CoursesService } from "@insyte/modules/courses/Courses"
import { CustomersService } from "@insyte/modules/customers/Customers"
import { ApiKeys } from "@insyte/modules/developer/ApiKeys"
import { Webhooks } from "@insyte/modules/developer/Webhooks"
import { FirstAnalysisService } from "@insyte/modules/first-analysis/FirstAnalysis"
import { ForwardingService } from "@insyte/modules/forwarding/Forwarding"
import { HomeService } from "@insyte/modules/home/Home"
import { InboxService } from "@insyte/modules/inbox/Inbox"
import { LiveService } from "@insyte/modules/live/Live"
import { MarketingService } from "@insyte/modules/marketing/Marketing"
import { MarketplaceService } from "@insyte/modules/marketplace/Marketplace"
import { Landing } from "@insyte/modules/members/Landing"
import { Members } from "@insyte/modules/members/Members"
import { NotificationsService } from "@insyte/modules/notifications/NotificationsService"
import { Onboarding } from "@insyte/modules/onboarding/Onboarding"
import { OrdersService } from "@insyte/modules/orders/Orders"
import { PrefsService } from "@insyte/modules/prefs/PrefsService"
import { ProductsService } from "@insyte/modules/products/Products"
import { ProposalsService } from "@insyte/modules/proposals/Proposals"
import { QualityLinkService, QualityService } from "@insyte/modules/quality/Quality"
import { QueueService } from "@insyte/modules/queue/Queue"
import { PortalService } from "@insyte/modules/returns/Portal"
import { ReturnsService } from "@insyte/modules/returns/Returns"
import { RolesService } from "@insyte/modules/roles/RolesService"
import { ActiveSessions } from "@insyte/modules/sessions/ActiveSessions"
import { SettingsDepth } from "@insyte/modules/settings/SettingsDepth"
import { StoresService } from "@insyte/modules/stores/Stores"
import { SuppliersService } from "@insyte/modules/suppliers/Suppliers"
import { TicketsService } from "@insyte/modules/tickets/Tickets"
import { TrackingService } from "@insyte/modules/tracking/Tracking"
import { TrashService } from "@insyte/modules/trash/Trash"
import { UndoService } from "@insyte/modules/undo/Undo"
import { Workspaces } from "@insyte/modules/workspaces/Workspaces"
import { WorkspaceSettings } from "@insyte/modules/workspaces/WorkspaceSettings"
import { Layer } from "effect"
import { RpcSerialization } from "effect/rpc"
import { AccessHandlers } from "./handlers/access.ts"
import { AnalyticsHandlers } from "./handlers/analytics.ts"
import { AuditHandlers } from "./handlers/audit.ts"
import { AutomationsHandlers } from "./handlers/automations.ts"
import { ChargebacksHandlers } from "./handlers/chargebacks.ts"
import { ChatsHandlers } from "./handlers/chats.ts"
import { CommerceHandlers } from "./handlers/commerce.ts"
import { CostsHandlers } from "./handlers/costs.ts"
import { CoursesHandlers } from "./handlers/courses.ts"
import { DeveloperHandlers } from "./handlers/developer.ts"
import { FirstAnalysisHandlers } from "./handlers/first-analysis.ts"
import { ForwardingHandlers } from "./handlers/forwarding.ts"
import { HomeHandlers } from "./handlers/home.ts"
import { LandingHandlers } from "./handlers/landing.ts"
import { LiveHandlers } from "./handlers/live.ts"
import { MarketingHandlers } from "./handlers/marketing.ts"
import { MarketplaceHandlers } from "./handlers/marketplace.ts"
import { MembersHandlers } from "./handlers/members.ts"
import { NotificationsHandlers } from "./handlers/notifications.ts"
import { OnboardingHandlers } from "./handlers/onboarding.ts"
import { PortalHandlers } from "./handlers/portal.ts"
import { PrefsHandlers } from "./handlers/prefs.ts"
import { ProposalsHandlers } from "./handlers/proposals.ts"
import { QualityHandlers } from "./handlers/quality.ts"
import { QueueHandlers } from "./handlers/queue.ts"
import { ReturnsHandlers } from "./handlers/returns.ts"
import { RolesHandlers } from "./handlers/roles.ts"
import { RunsHandlers } from "./handlers/runs.ts"
import { SessionHandlers } from "./handlers/session.ts"
import { SettingsDepthHandlers } from "./handlers/settings-depth.ts"
import { SharedHandlers } from "./handlers/shared.ts"
import { ShellHandlers } from "./handlers/shell.ts"
import { StoresHandlers } from "./handlers/stores.ts"
import { SuppliersHandlers } from "./handlers/suppliers.ts"
import { SystemHandlers } from "./handlers/system.ts"
import { ThreadsHandlers } from "./handlers/threads.ts"
import { TicketsHandlers } from "./handlers/tickets.ts"
import { TrackingHandlers } from "./handlers/tracking.ts"
import { TrashHandlers } from "./handlers/trash.ts"
import { WorkspacesHandlers } from "./handlers/workspaces.ts"
import { RpcHttp } from "./RpcHttp.ts"

/** The console's RPC transport. */
export const RpcRoutes = RpcHttp(ConsoleRpcs, RPC_PATH)

/**
 * What the RPC route reads per request: the handlers and the serialization. NDJSON on both ends: the console's client
 * uses the same (13 §2). The composition root `provideMerge`s this after the transports (see `RpcHttp`).
 */
export const RpcContext = Layer.mergeAll(
  SystemHandlers,
  SessionHandlers.pipe(Layer.provide([Workspaces.layer, ActiveSessions.layer])),
  OnboardingHandlers.pipe(
    Layer.provide(Onboarding.layer),
    Layer.provide(Layer.mergeAll(Workspaces.founder, Workspaces.setup))
  ),
  MembersHandlers.pipe(Layer.provide(Members.layer)),
  LandingHandlers.pipe(Layer.provide(Landing.layer)),
  AccessHandlers.pipe(Layer.provide(Access.layer)),
  RolesHandlers.pipe(Layer.provide(RolesService.layer)),
  DeveloperHandlers.pipe(Layer.provide(Layer.mergeAll(ApiKeys.layer, Webhooks.layer))),
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
  ReturnsHandlers.pipe(Layer.provide(ReturnsService.layer)),
  PortalHandlers.pipe(Layer.provide(PortalService.layer)),
  TicketsHandlers.pipe(Layer.provide(TicketsService.layer)),
  AutomationsHandlers.pipe(Layer.provide(AutomationsService.layer)),
  RunsHandlers.pipe(Layer.provide(RunsService.layer)),
  ChargebacksHandlers.pipe(Layer.provide(ChargebacksService.layer)),
  ThreadsHandlers.pipe(Layer.provide(InboxService.layer)),
  QueueHandlers.pipe(Layer.provide(QueueService.layer)),
  HomeHandlers.pipe(Layer.provide(HomeService.layer)),
  AnalyticsHandlers.pipe(Layer.provide(AnalyticsService.layer)),
  ProposalsHandlers.pipe(Layer.provide(ProposalsService.layer)),
  ChatsHandlers.pipe(Layer.provide(Layer.mergeAll(ChatsService.layer, UndoService.layer))),
  QualityHandlers.pipe(Layer.provide(Layer.mergeAll(QualityService.layer, QualityLinkService.layer))),
  WorkspacesHandlers.pipe(Layer.provide(WorkspaceSettings.layer)),
  CostsHandlers.pipe(Layer.provide(CostsService.layer)),
  AuditHandlers.pipe(Layer.provide(AuditService.layer)),
  TrashHandlers.pipe(Layer.provide(TrashService.layer)),
  SettingsDepthHandlers.pipe(Layer.provide(SettingsDepth.layer)),
  CoursesHandlers.pipe(Layer.provide(CoursesService.layer)),
  MarketplaceHandlers.pipe(Layer.provide(MarketplaceService.layer)),
  LiveHandlers.pipe(Layer.provide(LiveService.layer)),
  ShellHandlers.pipe(
    Layer.provide(
      Layer.mergeAll(
        Members.layer,
        NotificationsService.layer,
        PrefsService.layer,
        Workspaces.layer,
        OrdersService.layer,
        ProductsService.layer,
        CustomersService.layer,
        TicketsService.layer,
        InboxService.layer,
        ChatsService.layer,
        ChargebacksService.layer
      )
    )
  )
).pipe(
  Layer.provideMerge(RpcSerialization.layerNdjson)
)
