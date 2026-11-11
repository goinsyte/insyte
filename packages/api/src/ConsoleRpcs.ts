import { AccessRpcs } from "./rpc/AccessRpcs.ts"
import { CommerceRpcs } from "./rpc/CommerceRpcs.ts"
import { DeveloperRpcs } from "./rpc/DeveloperRpcs.ts"
import { FirstAnalysisRpcs } from "./rpc/FirstAnalysisRpcs.ts"
import { ForwardingRpcs } from "./rpc/ForwardingRpcs.ts"
import { HomeRpcs } from "./rpc/HomeRpcs.ts"
import { InvitationRpcs, LandingRpcs } from "./rpc/LandingRpcs.ts"
import { MarketingRpcs } from "./rpc/MarketingRpcs.ts"
import { MembersRpcs } from "./rpc/MembersRpcs.ts"
import { NotificationsRpcs } from "./rpc/NotificationsRpcs.ts"
import { OnboardingRpcs } from "./rpc/OnboardingRpcs.ts"
import { PortalRpcs } from "./rpc/PortalRpcs.ts"
import { PrefsRpcs } from "./rpc/PrefsRpcs.ts"
import { ProposalsRpcs } from "./rpc/ProposalsRpcs.ts"
import { QualityLinkRpcs, QualityRpcs } from "./rpc/QualityRpcs.ts"
import { QueueRpcs } from "./rpc/QueueRpcs.ts"
import { ReturnsRpcs } from "./rpc/ReturnsRpcs.ts"
import { RolesRpcs } from "./rpc/RolesRpcs.ts"
import { SessionRpcs } from "./rpc/SessionRpcs.ts"
import { SharedRpcs } from "./rpc/SharedRpcs.ts"
import { ShellRpcs } from "./rpc/ShellRpcs.ts"
import { StoresRpcs } from "./rpc/StoresRpcs.ts"
import { SuppliersRpcs } from "./rpc/SuppliersRpcs.ts"
import { SystemRpcs } from "./rpc/SystemRpcs.ts"
import { TicketsRpcs } from "./rpc/TicketsRpcs.ts"
import { TrackingRpcs } from "./rpc/TrackingRpcs.ts"

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
  .merge(QualityRpcs)
  .merge(QualityLinkRpcs)
  .merge(QueueRpcs)
  .merge(HomeRpcs)
  .merge(ProposalsRpcs)
