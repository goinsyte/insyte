import { AccessRpcs } from "./rpc/AccessRpcs.ts"
import { DeveloperRpcs } from "./rpc/DeveloperRpcs.ts"
import { InvitationRpcs, LandingRpcs } from "./rpc/LandingRpcs.ts"
import { MembersRpcs } from "./rpc/MembersRpcs.ts"
import { NotificationsRpcs } from "./rpc/NotificationsRpcs.ts"
import { OnboardingRpcs } from "./rpc/OnboardingRpcs.ts"
import { PrefsRpcs } from "./rpc/PrefsRpcs.ts"
import { RolesRpcs } from "./rpc/RolesRpcs.ts"
import { SessionRpcs } from "./rpc/SessionRpcs.ts"
import { ShellRpcs } from "./rpc/ShellRpcs.ts"
import { SystemRpcs } from "./rpc/SystemRpcs.ts"

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
