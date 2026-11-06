/**
 * The demo data source: every fixture the screens read, under the names the seam declares.
 *
 * `lib/mock-data`, `lib/scenario.ts` and `lib/affiliate-data.ts` from the old console, moved here
 * whole. Each module picks its rows by `?scenario=` when it is first evaluated, which is why
 * switching the design state reloads the page.
 */
import type { DataSource } from "@insyte/ui/data-source"
import {
  AFF_TODAY,
  affiliateStatements,
  COMMISSION,
  CONVERSION_STATUS,
  CONVERSIONS,
  DESTINATIONS,
  RETURN_DAYS,
  TIERS,
  weeklyFor
} from "./affiliate-data.ts"
import {
  PAYOUT_MONTH,
  REJECT_REASONS,
  seedAffiliateInvites,
  seedApplications,
  seedPayouts,
  seedProgramAffiliates,
  tierOf
} from "./mock-data/affiliate-program.ts"
import { currentAffiliateByState } from "./mock-data/affiliates.ts"
import { agentActionsSeed } from "./mock-data/agent-actions.ts"
import { automations } from "./mock-data/automations.ts"
import { autonomySeed } from "./mock-data/autonomy.ts"
import { channelsSeed } from "./mock-data/channels.ts"
import { chargebacks } from "./mock-data/chargebacks.ts"
import {
  chatProfiles,
  conversationDescription,
  conversations,
  messagesByConversation,
  threadsByMessage
} from "./mock-data/chats.ts"
import { costsSeed } from "./mock-data/costs.ts"
import { coursesSeed } from "./mock-data/courses.ts"
import { currentUserByPersona } from "./mock-data/current-user.ts"
import { customerAgentSeed } from "./mock-data/customer-agent.ts"
import { customers } from "./mock-data/customers.ts"
import { aiReplySuggestions, emailThreads } from "./mock-data/emails.ts"
import { firstAnalysisSeed } from "./mock-data/first-analysis.ts"
import { forwardingPrefsSeed, forwardingSeed } from "./mock-data/forwarding.ts"
import { knowledgeSeed } from "./mock-data/knowledge.ts"
import { extensions } from "./mock-data/marketplace.ts"
import { lastActionById, members, presenceById } from "./mock-data/members.ts"
import { navByPersona } from "./mock-data/nav.ts"
import { seedNotifications } from "./mock-data/notifications.ts"
import { orders } from "./mock-data/orders.ts"
import { org } from "./mock-data/org.ts"
import { queue } from "./mock-data/plates.ts"
import { products } from "./mock-data/products.ts"
import { qualitySeed } from "./mock-data/quality.ts"
import { referralLinks } from "./mock-data/referrals.ts"
import { affiliateFaqs, affiliateResources } from "./mock-data/resources.ts"
import { deliveriesSeed, returnSettingsSeed, returnsSeed } from "./mock-data/returns.ts"
import { settingsDepthSeed } from "./mock-data/settings-depth.ts"
import { sheetsSeed } from "./mock-data/sheets.ts"
import { stores } from "./mock-data/stores.ts"
import { ownSupplier, suppliers } from "./mock-data/suppliers.ts"
import { tickets } from "./mock-data/tickets.ts"
import { byScenario, longEmail, longName, SCENARIO, SCENARIOS, setScenario } from "./scenario.ts"

export const demo: DataSource = {
  SCENARIO,
  SCENARIOS,
  byScenario,
  setScenario,
  longName,
  longEmail,
  // The reference is a design tool in every build, not only under `vite dev`.
  designControls: true,
  org,
  currentUserByPersona,
  navByPersona,
  stores,
  members,
  presenceById,
  lastActionById,
  extensions,
  orders,
  customers,
  products,
  suppliers,
  ownSupplier,
  tickets,
  chargebacks,
  automations,
  queue,
  conversations,
  conversationDescription,
  messagesByConversation,
  threadsByMessage,
  chatProfiles,
  emailThreads,
  aiReplySuggestions,
  seedNotifications,
  currentAffiliateByState,
  referralLinks,
  affiliateResources,
  affiliateFaqs,
  AFF_TODAY,
  COMMISSION,
  RETURN_DAYS,
  TIERS,
  DESTINATIONS,
  CONVERSIONS,
  CONVERSION_STATUS,
  weeklyFor,
  affiliateStatements,
  tierOf,
  PAYOUT_MONTH,
  REJECT_REASONS,
  seedProgramAffiliates,
  seedApplications,
  seedPayouts,
  seedAffiliateInvites,
  autonomySeed,
  agentActionsSeed,
  forwardingSeed,
  forwardingPrefsSeed,
  returnsSeed,
  coursesSeed,
  costsSeed,
  sheetsSeed,
  settingsDepthSeed,
  returnSettingsSeed,
  deliveriesSeed,
  qualitySeed,
  channelsSeed,
  knowledgeSeed,
  customerAgentSeed,
  firstAnalysisSeed
}
