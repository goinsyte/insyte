/*
 * Where each seam binding stands (09-cutover.md §1): `demo` is still read from the fixtures, `api` is read through
 * atoms in the console (the reference keeps its demo source for it), `code` is configuration that stays in code,
 * `demo-only` belongs to the reference's design controls. A slice that cuts over changes its rows here in the same pull
 * request. `test/seam.test.ts` holds the list to the seam; `bun run bundle:check` holds it to the console's bundle,
 * where no module may read an `api` binding and every other read is a row of `CONSOLE_READS_LEFT`.
 */

export type SeamStatus = "demo" | "api" | "code" | "demo-only"

export const CUTOVER: Record<string, { readonly status: SeamStatus; readonly milestone: string }> = {
  SCENARIO: { status: "demo-only", milestone: "M4" },
  SCENARIOS: { status: "demo-only", milestone: "—" },
  byScenario: { status: "demo-only", milestone: "—" },
  setScenario: { status: "demo-only", milestone: "—" },
  longName: { status: "demo-only", milestone: "—" },
  longEmail: { status: "demo-only", milestone: "—" },
  designControls: { status: "demo-only", milestone: "M0" },
  org: { status: "api", milestone: "M3" },
  currentUserByPersona: { status: "api", milestone: "M2/M3" },
  navByPersona: { status: "code", milestone: "M4/M5" }, // lib/nav-config.ts since step 7.4
  stores: { status: "demo", milestone: "M6" },
  members: { status: "demo", milestone: "M3" },
  presenceById: { status: "demo", milestone: "M5" },
  lastActionById: { status: "demo", milestone: "M5" }, // the console has no `presence.doing` yet: an empty record
  extensions: { status: "api", milestone: "M6/M17" },
  orders: { status: "demo", milestone: "M6 (reads), M7 (commands)" },
  customers: { status: "demo", milestone: "M6/M7" },
  products: { status: "demo", milestone: "M6/M7" },
  suppliers: { status: "demo", milestone: "M8" },
  ownSupplier: { status: "api", milestone: "M16" },
  tickets: { status: "demo", milestone: "M11" },
  chargebacks: { status: "demo", milestone: "M13" },
  automations: { status: "demo", milestone: "M12" },
  queue: { status: "demo", milestone: "M10" },
  conversations: { status: "api", milestone: "M11" },
  conversationDescription: { status: "api", milestone: "M11" },
  messagesByConversation: { status: "api", milestone: "M11" },
  threadsByMessage: { status: "api", milestone: "M11" },
  chatProfiles: { status: "api", milestone: "M11" },
  emailThreads: { status: "api", milestone: "M11" },
  aiReplySuggestions: { status: "api", milestone: "M11 (templates), M15 (AI)" },
  seedNotifications: { status: "api", milestone: "M5" },
  currentAffiliateByState: { status: "demo", milestone: "M16" },
  referralLinks: { status: "demo", milestone: "M16" },
  affiliateResources: { status: "demo", milestone: "M16" },
  affiliateFaqs: { status: "demo", milestone: "M16" },
  AFF_TODAY: { status: "demo", milestone: "M16" },
  COMMISSION: { status: "demo", milestone: "M16" },
  RETURN_DAYS: { status: "demo", milestone: "M16" },
  TIERS: { status: "demo", milestone: "M16" },
  DESTINATIONS: { status: "demo", milestone: "M16" },
  CONVERSIONS: { status: "demo", milestone: "M16" },
  CONVERSION_STATUS: { status: "code", milestone: "M16" },
  weeklyFor: { status: "demo", milestone: "M16" },
  affiliateStatements: { status: "demo", milestone: "M16" },
  tierOf: { status: "code", milestone: "M16" },
  PAYOUT_MONTH: { status: "demo", milestone: "M16" },
  REJECT_REASONS: { status: "demo", milestone: "M16" },
  seedProgramAffiliates: { status: "demo", milestone: "M16" },
  seedApplications: { status: "demo", milestone: "M16" },
  seedPayouts: { status: "demo", milestone: "M16" },
  seedAffiliateInvites: { status: "demo", milestone: "M16" },
  autonomySeed: { status: "api", milestone: "M15" },
  agentActionsSeed: { status: "api", milestone: "M15" },
  forwardingSeed: { status: "api", milestone: "M8" },
  forwardingPrefsSeed: { status: "api", milestone: "M8" },
  returnsSeed: { status: "api", milestone: "M9" },
  returnSettingsSeed: { status: "api", milestone: "M9" },
  deliveriesSeed: { status: "api", milestone: "M8" },
  qualitySeed: { status: "api", milestone: "M9" },
  channelsSeed: { status: "demo", milestone: "M15" },
  knowledgeSeed: { status: "api", milestone: "M15" },
  customerAgentSeed: { status: "api", milestone: "M15" },
  coursesSeed: { status: "api", milestone: "M17" },
  costsSeed: { status: "api", milestone: "M13" },
  sheetsSeed: { status: "api", milestone: "M14" },
  settingsDepthSeed: { status: "api", milestone: "M17" },
  firstAnalysisSeed: { status: "api", milestone: "M6 (early read), M15 (finding)" }
}

/**
 * The modules in the console's bundle that still import a seam binding, which there is `undefined` because the console
 * installs no data source. Each read is guarded or sits on a path only the reference takes (the design's in-place app
 * dialog, its seeded flows and sample runs, its invitation and workspace seeds). The list only shrinks: moving a read
 * into the reference's own source deletes its file here, and `bundle:check` fails on a file that no longer reads.
 */
export const CONSOLE_READS_LEFT: Record<string, ReadonlyArray<string>> = {
  SCENARIO: ["packages/ui/src/app/stores/settings-store.ts"],
  byScenario: [
    "packages/ui/src/app/lib/team.ts",
    "packages/ui/src/app/stores/home-store.ts",
    "packages/ui/src/app/stores/settings-store.ts"
  ],
  longName: ["packages/ui/src/app/lib/team.ts"],
  longEmail: ["packages/ui/src/app/lib/team.ts"],
  stores: ["packages/ui/src/app/lib/api.ts", "packages/ui/src/app/stores/workspace-store.ts"],
  members: ["packages/ui/src/app/lib/team.ts", "packages/ui/src/app/stores/workspace-store.ts"],
  presenceById: ["packages/ui/src/app/lib/team.ts", "packages/ui/src/app/notifications/note-parts.tsx"],
  orders: [
    "packages/ui/src/app/automations/runs.ts",
    "packages/ui/src/app/lib/api.ts",
    "packages/ui/src/app/stores/workspace-store.ts"
  ],
  customers: ["packages/ui/src/app/lib/api.ts"],
  products: ["packages/ui/src/app/automations/runs.ts", "packages/ui/src/app/lib/api.ts"],
  suppliers: ["packages/ui/src/app/lib/team.ts"],
  tickets: ["packages/ui/src/app/stores/workspace-store.ts"],
  chargebacks: ["packages/ui/src/app/automations/runs.ts", "packages/ui/src/app/stores/workspace-store.ts"],
  automations: [
    "packages/ui/src/app/automations/automations-screen.tsx",
    "packages/ui/src/app/automations/overview-tab.tsx"
  ],
  queue: ["packages/ui/src/app/stores/workspace-store.ts"],
  channelsSeed: ["packages/ui/src/app/stores/workspace-store.ts"]
}
