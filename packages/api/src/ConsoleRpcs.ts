import { AccessRpcs } from "./rpc/AccessRpcs.ts"
import { AgentRpcs } from "./rpc/AgentRpcs.ts"
import { AnalyticsRpcs } from "./rpc/AnalyticsRpcs.ts"
import { AuditRpcs } from "./rpc/AuditRpcs.ts"
import { AutomationsRpcs } from "./rpc/AutomationsRpcs.ts"
import { ChargebacksRpcs } from "./rpc/ChargebacksRpcs.ts"
import { ChatsRpcs } from "./rpc/ChatsRpcs.ts"
import { CommerceRpcs } from "./rpc/CommerceRpcs.ts"
import { CostsRpcs } from "./rpc/CostsRpcs.ts"
import { CoursesRpcs } from "./rpc/CoursesRpcs.ts"
import { DataRpcs } from "./rpc/DataRpcs.ts"
import { DeveloperRpcs } from "./rpc/DeveloperRpcs.ts"
import { DraftsRpcs } from "./rpc/DraftsRpcs.ts"
import { FirstAnalysisRpcs } from "./rpc/FirstAnalysisRpcs.ts"
import { ForwardingRpcs } from "./rpc/ForwardingRpcs.ts"
import { HomeRpcs } from "./rpc/HomeRpcs.ts"
import { InvitationRpcs, LandingRpcs } from "./rpc/LandingRpcs.ts"
import { LiveRpcs } from "./rpc/LiveRpcs.ts"
import { MarketingRpcs } from "./rpc/MarketingRpcs.ts"
import { MarketplaceRpcs } from "./rpc/MarketplaceRpcs.ts"
import { MembersRpcs } from "./rpc/MembersRpcs.ts"
import { NotificationsRpcs } from "./rpc/NotificationsRpcs.ts"
import { OnboardingRpcs } from "./rpc/OnboardingRpcs.ts"
import { PortalRpcs } from "./rpc/PortalRpcs.ts"
import { PrefsRpcs } from "./rpc/PrefsRpcs.ts"
import { PrivacyRpcs } from "./rpc/PrivacyRpcs.ts"
import { ProposalsRpcs } from "./rpc/ProposalsRpcs.ts"
import { QualityLinkRpcs, QualityRpcs } from "./rpc/QualityRpcs.ts"
import { QueueRpcs } from "./rpc/QueueRpcs.ts"
import { ReturnsRpcs } from "./rpc/ReturnsRpcs.ts"
import { RolesRpcs } from "./rpc/RolesRpcs.ts"
import { RunsRpcs } from "./rpc/RunsRpcs.ts"
import { SessionRpcs } from "./rpc/SessionRpcs.ts"
import { SettingsDepthRpcs } from "./rpc/SettingsDepthRpcs.ts"
import { SharedRpcs } from "./rpc/SharedRpcs.ts"
import { SheetsRpcs } from "./rpc/SheetsRpcs.ts"
import { ShellRpcs } from "./rpc/ShellRpcs.ts"
import { StoresRpcs } from "./rpc/StoresRpcs.ts"
import { SuppliersRpcs } from "./rpc/SuppliersRpcs.ts"
import { SystemRpcs } from "./rpc/SystemRpcs.ts"
import { ThreadsRpcs } from "./rpc/ThreadsRpcs.ts"
import { TicketsRpcs } from "./rpc/TicketsRpcs.ts"
import { TrackingRpcs } from "./rpc/TrackingRpcs.ts"
import { TrashRpcs } from "./rpc/TrashRpcs.ts"
import { WorkspacesRpcs } from "./rpc/WorkspacesRpcs.ts"

/** Where the console calls every RPC. The client and the server name the same path. */
export const RPC_PATH = "/api/rpc/v1"

/**
 * Every group the console calls, merged into the one the server mounts and the client is built from. A slice's group
 * joins with `.merge(…)` when it lands.
 */
export const ConsoleRpcs = SystemRpcs.merge(SessionRpcs).merge(OnboardingRpcs).merge(MembersRpcs).merge(LandingRpcs)
  .merge(InvitationRpcs)
  .merge(AccessRpcs)
  .merge(RolesRpcs)
  .merge(DeveloperRpcs)
  .merge(PrefsRpcs)
  .merge(NotificationsRpcs)
  .merge(ShellRpcs)
  .merge(StoresRpcs)
  .merge(CommerceRpcs)
  .merge(FirstAnalysisRpcs)
  .merge(SharedRpcs)
  .merge(MarketingRpcs)
  .merge(SuppliersRpcs)
  .merge(ForwardingRpcs)
  .merge(TrackingRpcs)
  .merge(ReturnsRpcs)
  .merge(PortalRpcs)
  .merge(TicketsRpcs)
  .merge(ChargebacksRpcs)
  .merge(ThreadsRpcs)
  .merge(QualityRpcs)
  .merge(QualityLinkRpcs)
  .merge(QueueRpcs)
  .merge(HomeRpcs)
  .merge(AnalyticsRpcs)
  .merge(ProposalsRpcs)
  .merge(WorkspacesRpcs)
  .merge(ChatsRpcs)
  .merge(AutomationsRpcs)
  .merge(RunsRpcs)
  .merge(CostsRpcs)
  .merge(AuditRpcs)
  .merge(TrashRpcs)
  .merge(PrivacyRpcs)
  .merge(SettingsDepthRpcs)
  .merge(CoursesRpcs)
  .merge(MarketplaceRpcs)
  .merge(LiveRpcs)
  .merge(SheetsRpcs)
  .merge(DataRpcs)
  .merge(AgentRpcs)
  .merge(DraftsRpcs)
