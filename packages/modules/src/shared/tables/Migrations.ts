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
import prefs from "./migrations/0018_prefs.ts"
import notifications from "./migrations/0019_notifications.ts"
import connections from "./migrations/0020_connections.ts"
import commerce from "./migrations/0021_commerce.ts"
import inbound from "./migrations/0022_inbound.ts"
import firstAnalysis from "./migrations/0023_first_analysis.ts"
import orderNotes from "./migrations/0024_order_notes.ts"
import productCosts from "./migrations/0025_product_costs.ts"
import customerMerges from "./migrations/0026_customer_merges.ts"
import marketing from "./migrations/0027_marketing.ts"
import suppliers from "./migrations/0028_suppliers.ts"
import forwarding from "./migrations/0029_forwarding.ts"
import supplierWork from "./migrations/0030_supplier_work.ts"
import tracking from "./migrations/0031_tracking.ts"
import returns from "./migrations/0032_returns.ts"
import returnLabels from "./migrations/0033_return_labels.ts"
import returnParcels from "./migrations/0034_return_parcels.ts"
import returnPortal from "./migrations/0035_return_portal.ts"
import quality from "./migrations/0036_quality.ts"
import stockouts from "./migrations/0037_stockouts.ts"
import tickets from "./migrations/0040_tickets.ts"
import returnResolutions from "./migrations/0042_return_resolutions.ts"
import queue from "./migrations/0043_queue.ts"
import proposals from "./migrations/0044_proposals.ts"
import orderMails from "./migrations/0045_order_mails.ts"
import facts from "./migrations/0047_facts.ts"
import chat from "./migrations/0049_chat.ts"
import mail from "./migrations/0050_mail.ts"
import notify from "./migrations/0052_notify.ts"
import authSessionCountry from "./migrations/0053_auth_session_country.ts"
import sessionEvents from "./migrations/0054_session_events.ts"
import push from "./migrations/0055_push.ts"
import trash from "./migrations/0060_trash.ts"
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
  "0017_api_keys": apiKeys,
  "0018_prefs": prefs,
  "0019_notifications": notifications,
  "0020_connections": connections,
  "0021_commerce": commerce,
  "0022_inbound": inbound,
  "0023_first_analysis": firstAnalysis,
  "0024_order_notes": orderNotes,
  "0025_product_costs": productCosts,
  "0026_customer_merges": customerMerges,
  "0027_marketing": marketing,
  "0028_suppliers": suppliers,
  "0029_forwarding": forwarding,
  "0030_supplier_work": supplierWork,
  "0031_tracking": tracking,
  "0032_returns": returns,
  "0033_return_labels": returnLabels,
  "0034_return_parcels": returnParcels,
  "0035_return_portal": returnPortal,
  "0036_quality": quality,
  "0037_stockouts": stockouts,
  "0040_tickets": tickets,
  "0042_return_resolutions": returnResolutions,
  "0043_queue": queue,
  "0044_proposals": proposals,
  "0045_order_mails": orderMails,
  "0047_facts": facts,
  "0049_chat": chat,
  "0050_mail": mail,
  "0052_notify": notify,
  "0053_auth_session_country": authSessionCountry,
  "0054_session_events": sessionEvents,
  "0055_push": push,
  "0060_trash": trash
}
