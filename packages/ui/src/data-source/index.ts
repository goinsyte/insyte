/**
 * The data seam: everything a screen in `@insyte/ui/app` reads that is not the screen's own.
 *
 * Screens, stores and hooks never import a fixture. They import the names below, and the app that
 * hosts them installs a `DataSource` once, at its composition root, before any screen module is
 * evaluated:
 *
 *   apps/design   installs `demo` — the fixtures, picked by `?scenario=empty|settled|busy`
 *   apps/console  will install an `api` source (`VITE_DATA_SOURCE=api`, ADR-0021), and may keep
 *                 `demo` for a slice that is not built yet
 *
 * Why a module-level port and not a React context: the zustand stores in `app/stores` are module
 * singletons that seed their state when they are first evaluated, outside any render, and several
 * modules read a record set at module scope (the command palette's index, the analytics history).
 * A context cannot reach either. ES modules export live bindings, so `export let` plus one
 * `installDataSource` call gives every importer the installed value with no call site changed —
 * which is what kept the move to this package a move.
 *
 * The rule that makes it safe: nothing reads these before `installDataSource` runs. The host imports
 * its install module first, so it is evaluated, with the fixtures, before the route tree. The
 * fixtures themselves import nothing from this package but types and icons.
 *
 * See ADR-0026.
 */
import type { AgentLogEntry } from "../app/lib/agent-log"
import type { AutonomySeed } from "../app/lib/autonomy"
import type { ChannelsSeed } from "../app/lib/channels"
import type { CostsSeed } from "../app/lib/costs"
import type { CoursesSeed } from "../app/lib/courses"
import type { CustomerAgentSeed } from "../app/lib/customer-agent"
import type { FirstAnalysisSeed } from "../app/lib/first-analysis"
import type { ForwardPrefs, Leg } from "../app/lib/forwarding"
import type { KnowledgeSeed } from "../app/lib/knowledge"
import type { Note } from "../app/lib/notifications"
import type { QualitySeed } from "../app/lib/quality"
import type { ReturnRecord, ReturnSettings } from "../app/lib/returns"
import type { SettingsDepthSeed } from "../app/lib/settings-depth"
import type { SheetsSeed } from "../app/lib/sheets"
import type {
  Affiliate,
  Automation,
  Chargeback,
  Conversation,
  CurrentUser,
  Customer,
  EmailThread,
  Extension,
  Member,
  Order,
  Organization,
  Product,
  ReferralLink,
  Store,
  Supplier,
  Ticket
} from "../app/lib/types/domain"
import type { NavConfig } from "../app/lib/types/nav"
import type { Persona } from "../app/lib/types/persona"
import type {
  AffiliateInvite,
  AffiliateResource,
  AffStatement,
  Application,
  ChatProfile,
  Conversion,
  ConversionStatus,
  PayoutLine,
  Presence,
  ProgramAffiliate,
  QueueRow,
  RichMessage,
  Scenario,
  Tier
} from "./types"

export type { AgentLogEntry, LogSource } from "../app/lib/agent-log"
export type { AutonomySeed } from "../app/lib/autonomy"
export type { ChannelsSeed } from "../app/lib/channels"
export type { CostLine, CostsSeed } from "../app/lib/costs"
export type { Block, Chapter, Course, CourseQuestion, CoursesSeed, Progress } from "../app/lib/courses"
export type { CustomerAgentSeed } from "../app/lib/customer-agent"
export type { FirstAnalysisSeed } from "../app/lib/first-analysis"
export type { ForwardPrefs, Leg as ForwardLeg } from "../app/lib/forwarding"
export type { KnowledgeSeed } from "../app/lib/knowledge"
export type { QualitySeed } from "../app/lib/quality"
export type { ReturnRecord, ReturnSettings } from "../app/lib/returns"
export type { SettingsDepthSeed } from "../app/lib/settings-depth"
export type { Sheet, SheetsSeed } from "../app/lib/sheets"
export type * from "./types"

/** The programme's tiers, as the brand set them. */
type TierDef = {
  readonly id: "bronze" | "silver" | "gold"
  readonly label: string
  readonly rate: number
  readonly from: number
}

/**
 * Everything a host supplies. The names are the ones the fixtures export, so a screen that reads
 * `orders` reads exactly what it read before the move.
 */
export type DataSource = {
  /* ── the design state (`?scenario=`) ── */
  readonly SCENARIO: Scenario
  readonly SCENARIOS: ReadonlyArray<{ id: Scenario; label: string; detail: string }>
  readonly byScenario: <A>(c: { empty: A; settled: A; busy?: () => A }) => A
  readonly setScenario: (next: Scenario, to?: string) => void
  readonly longName: (i: number) => string
  readonly longEmail: (i: number) => string
  /**
   * Whether the persona and design-state switcher renders outside `vite dev`. The reference shows
   * it in every build; the product shows it in development only, as it always has.
   */
  readonly designControls: boolean

  /* ── the workspace ── */
  readonly org: Organization
  readonly currentUserByPersona: Record<Persona, CurrentUser>
  readonly navByPersona: Record<Persona, NavConfig>
  readonly stores: Store[]
  readonly members: Member[]
  readonly presenceById: Record<string, Presence>
  readonly lastActionById: Record<string, string>
  readonly extensions: Extension[]

  /* ── records ── */
  readonly orders: Order[]
  readonly customers: Customer[]
  readonly products: Product[]
  readonly suppliers: Supplier[]
  readonly ownSupplier: Supplier
  readonly tickets: Ticket[]
  readonly chargebacks: Chargeback[]
  readonly automations: Automation[]
  readonly queue: QueueRow[]
  readonly conversations: Conversation[]
  readonly conversationDescription: Record<string, string>
  readonly messagesByConversation: Record<string, RichMessage[]>
  /** Replies under a message, by the message they answer. */
  readonly threadsByMessage: Record<string, RichMessage[]>
  readonly chatProfiles: Record<string, ChatProfile>
  readonly emailThreads: EmailThread[]
  readonly aiReplySuggestions: Record<string, string[]>
  readonly seedNotifications: () => Note[]

  /* ── the partner programme ── */
  readonly currentAffiliateByState: { approved: Affiliate; pending: Affiliate; rejected: Affiliate }
  readonly referralLinks: ReferralLink[]
  readonly affiliateResources: AffiliateResource[]
  readonly affiliateFaqs: Array<{ q: string; a: string }>
  readonly AFF_TODAY: number
  readonly COMMISSION: number
  readonly RETURN_DAYS: number
  readonly TIERS: ReadonlyArray<TierDef>
  readonly DESTINATIONS: Array<{ id: string; label: string; path: string }>
  readonly CONVERSIONS: Conversion[]
  readonly CONVERSION_STATUS: Record<
    ConversionStatus,
    { label: string; tone: "warning" | "info" | "success" | "neutral" }
  >
  readonly weeklyFor: (
    links: ReadonlyArray<ReferralLink>,
    linkId?: string
  ) => Array<{ label: string; conversions: number; clicks: number; earned: number }>
  readonly affiliateStatements: () => AffStatement[]
  readonly tierOf: (id: Tier) => TierDef
  readonly PAYOUT_MONTH: { label: string; payDay: number }
  readonly REJECT_REASONS: ReadonlyArray<string>
  readonly seedProgramAffiliates: () => ProgramAffiliate[]
  readonly seedApplications: () => Application[]
  readonly seedPayouts: () => PayoutLine[]
  readonly seedAffiliateInvites: () => AffiliateInvite[]

  /* ── the agent (ADR-0027) ── */
  readonly autonomySeed: AutonomySeed
  readonly agentActionsSeed: AgentLogEntry[]
  /* ── the forwarding queue (PLAN 24) ── */
  readonly forwardingSeed: Leg[]
  readonly forwardingPrefsSeed: ForwardPrefs
  /* ── returns and claims (PLAN 25) ── */
  readonly returnsSeed: ReturnRecord[]
  readonly returnSettingsSeed: ReturnSettings
  /** When each sent order arrived, by order id: the return window counts from here. */
  readonly deliveriesSeed: Record<string, string>
  /* ── product quality (PLAN 26) ── */
  readonly qualitySeed: QualitySeed
  /* ── the inbox's chat channels (PLAN 27) ── */
  readonly channelsSeed: ChannelsSeed
  /* ── the knowledge base (PLAN 28) ── */
  readonly knowledgeSeed: KnowledgeSeed
  /* ── the customer agent (PLAN 28) ── */
  readonly customerAgentSeed: CustomerAgentSeed
  /* ── courses (PLAN 39) ── */
  readonly coursesSeed: CoursesSeed
  /* ── costs (PLAN 42) ── */
  readonly costsSeed: CostsSeed
  /* ── rekenbladen (PLAN 40) ── */
  readonly sheetsSeed: SheetsSeed
  /* ── settings depth (PLAN 43) ── */
  readonly settingsDepthSeed: SettingsDepthSeed
  /* ── the first analysis (PLAN 45) ── */
  readonly firstAnalysisSeed: FirstAnalysisSeed
}

/* The live bindings. Unassigned until `installDataSource`; see the rule at the top of this file. */
export let SCENARIO: DataSource["SCENARIO"]
export let SCENARIOS: DataSource["SCENARIOS"]
export let byScenario: DataSource["byScenario"]
export let setScenario: DataSource["setScenario"]
export let longName: DataSource["longName"]
export let longEmail: DataSource["longEmail"]
export let designControls: DataSource["designControls"]
export let org: DataSource["org"]
export let currentUserByPersona: DataSource["currentUserByPersona"]
export let navByPersona: DataSource["navByPersona"]
export let stores: DataSource["stores"]
export let members: DataSource["members"]
export let presenceById: DataSource["presenceById"]
export let lastActionById: DataSource["lastActionById"]
export let extensions: DataSource["extensions"]
export let orders: DataSource["orders"]
export let customers: DataSource["customers"]
export let products: DataSource["products"]
export let suppliers: DataSource["suppliers"]
export let ownSupplier: DataSource["ownSupplier"]
export let tickets: DataSource["tickets"]
export let chargebacks: DataSource["chargebacks"]
export let automations: DataSource["automations"]
export let queue: DataSource["queue"]
export let conversations: DataSource["conversations"]
export let conversationDescription: DataSource["conversationDescription"]
export let messagesByConversation: DataSource["messagesByConversation"]
export let threadsByMessage: DataSource["threadsByMessage"]
export let chatProfiles: DataSource["chatProfiles"]
export let emailThreads: DataSource["emailThreads"]
export let aiReplySuggestions: DataSource["aiReplySuggestions"]
export let seedNotifications: DataSource["seedNotifications"]
export let currentAffiliateByState: DataSource["currentAffiliateByState"]
export let referralLinks: DataSource["referralLinks"]
export let affiliateResources: DataSource["affiliateResources"]
export let affiliateFaqs: DataSource["affiliateFaqs"]
export let AFF_TODAY: DataSource["AFF_TODAY"]
export let COMMISSION: DataSource["COMMISSION"]
export let RETURN_DAYS: DataSource["RETURN_DAYS"]
export let TIERS: DataSource["TIERS"]
export let DESTINATIONS: DataSource["DESTINATIONS"]
export let CONVERSIONS: DataSource["CONVERSIONS"]
export let CONVERSION_STATUS: DataSource["CONVERSION_STATUS"]
export let weeklyFor: DataSource["weeklyFor"]
export let affiliateStatements: DataSource["affiliateStatements"]
export let tierOf: DataSource["tierOf"]
export let PAYOUT_MONTH: DataSource["PAYOUT_MONTH"]
export let REJECT_REASONS: DataSource["REJECT_REASONS"]
export let seedProgramAffiliates: DataSource["seedProgramAffiliates"]
export let seedApplications: DataSource["seedApplications"]
export let seedPayouts: DataSource["seedPayouts"]
export let seedAffiliateInvites: DataSource["seedAffiliateInvites"]
export let autonomySeed: DataSource["autonomySeed"]
export let agentActionsSeed: DataSource["agentActionsSeed"]
export let forwardingSeed: DataSource["forwardingSeed"]
export let forwardingPrefsSeed: DataSource["forwardingPrefsSeed"]
export let returnsSeed: DataSource["returnsSeed"]
export let returnSettingsSeed: DataSource["returnSettingsSeed"]
export let deliveriesSeed: DataSource["deliveriesSeed"]
export let qualitySeed: DataSource["qualitySeed"]
export let channelsSeed: DataSource["channelsSeed"]
export let knowledgeSeed: DataSource["knowledgeSeed"]
export let customerAgentSeed: DataSource["customerAgentSeed"]
export let coursesSeed: DataSource["coursesSeed"]
export let costsSeed: DataSource["costsSeed"]
export let sheetsSeed: DataSource["sheetsSeed"]
export let settingsDepthSeed: DataSource["settingsDepthSeed"]
export let firstAnalysisSeed: DataSource["firstAnalysisSeed"]

let installed = false

/**
 * Install the host's source. Once: a second call would leave every store seeded from the first,
 * which is a bug that looks like stale data, so it throws instead.
 */
export function installDataSource(source: DataSource): void {
  if (installed) throw new Error("installDataSource: a data source is already installed")
  installed = true
  ;({
    SCENARIO,
    SCENARIOS,
    byScenario,
    setScenario,
    longName,
    longEmail,
    designControls,
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
    returnSettingsSeed,
    deliveriesSeed,
    qualitySeed,
    channelsSeed,
    knowledgeSeed,
    customerAgentSeed,
    coursesSeed,
    costsSeed,
    sheetsSeed,
    settingsDepthSeed,
    firstAnalysisSeed
  } = source)
}
