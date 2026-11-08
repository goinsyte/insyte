import bootstrap from "./migrations/0001_bootstrap.ts"
import platform from "./migrations/0002_platform.ts"
import auth from "./migrations/0003_auth.ts"
import capturedMail from "./migrations/0004_captured_mail.ts"
import betaAllowlist from "./migrations/0005_beta_allowlist.ts"
import authTwoFactor from "./migrations/0006_auth_two_factor.ts"
import authEvents from "./migrations/0007_auth_events.ts"
import onboarding from "./migrations/0008_onboarding.ts"
import workspaces from "./migrations/0009_workspaces.ts"
import relay from "./migrations/0010_relay.ts"
import setupTasks from "./migrations/0011_setup_tasks.ts"
import invitations from "./migrations/0012_invitations.ts"
import invitationLanding from "./migrations/0014_invitation_landing.ts"
import accessRequests from "./migrations/0015_access_requests.ts"
import rolesRestore from "./migrations/0016_roles_restore.ts"
import apiKeys from "./migrations/0017_api_keys.ts"
import removedMembers from "./migrations/contract/0013_removed_members.ts"

/**
 * Every migration, by its permanent key, in the order they were written (06; 15). A new migration is a new file and a
 * new line here; a merged one is never edited or reordered (`scripts/migrations-check.ts`).
 */
export const Migrations = {
  "0001_bootstrap": bootstrap,
  "0002_platform": platform,
  "0003_auth": auth,
  "0004_captured_mail": capturedMail,
  "0005_beta_allowlist": betaAllowlist,
  "0006_auth_two_factor": authTwoFactor,
  "0007_auth_events": authEvents,
  "0008_onboarding": onboarding,
  "0009_workspaces": workspaces,
  "0010_relay": relay,
  "0011_setup_tasks": setupTasks,
  "0012_invitations": invitations,
  "0013_removed_members": removedMembers,
  "0014_invitation_landing": invitationLanding,
  "0015_access_requests": accessRequests,
  "0016_roles_restore": rolesRestore,
  "0017_api_keys": apiKeys
}
