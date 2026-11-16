import { AUTONOMY_LEVELS } from "@insyte/domain/AgentActions"
import { Schema } from "effect"
import { UndoTicket } from "../../shared/domain/Undo.ts"

/*
 * Klantagent (M15 step 8; widgets/04 §F, api.md §2.25, domain.md §6.4): the customer agent's settings as the page edits
 * them, one rule set for the workspace with a mode per channel; its day in five figures; and the test chat. Errors carry
 * tags and fields; the console says them in Dutch.
 */

export const CHANNEL_KINDS = ["webchat", "whatsapp", "instagram", "email"] as const
export type ChannelKind = (typeof CHANNEL_KINDS)[number]

/** "Zelf antwoorden", "Alleen concepten", "Uit". Only the website chat may answer by itself (phase 1). */
export const ChannelMode = Schema.Literals(["auto", "drafts", "off"])
export type ChannelMode = typeof ChannelMode.Type

/** A time of day, `HH:mm`; `24:00` is the end of a day. */
const Time = Schema.String.check(Schema.isPattern(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/))

export const DayHours = Schema.Struct({ open: Schema.Boolean, from: Time, to: Time })
export type DayHours = typeof DayHours.Type

export const HandoverRules = Schema.Struct({
  /** "Insyte twijfelt aan het antwoord". */
  unsure: Schema.Boolean,
  /** "De klant vraagt om een mens". */
  asksPerson: Schema.Boolean,
  /** "Altijd voor een collega": lower-cased, unique. */
  topics: Schema.Array(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(40))).check(
    Schema.isMaxLength(20)
  ),
  /** "Na zoveel berichten"; `null` is never. */
  afterMessages: Schema.NullOr(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 50 })))
})
export type HandoverRules = typeof HandoverRules.Type

export const Channels = Schema.Struct({
  webchat: ChannelMode,
  whatsapp: ChannelMode,
  instagram: ChannelMode,
  email: ChannelMode
})
export type Channels = typeof Channels.Type

/** The page's form, whole: what `ChannelAgent.set` saves and `ChannelAgent.test` runs on. */
export const CustomerAgentSettingsInput = Schema.Struct({
  on: Schema.Boolean,
  channels: Channels,
  /** Seven days, Monday first, in the workspace's time zone. */
  hours: Schema.Array(DayHours).check(Schema.isBetweenLength(7, 7)),
  /** Outside the hours: answer from the knowledge base, or take the question and say when a person replies. */
  outside: Schema.Literals(["answer", "take"]),
  handover: HandoverRules,
  tone: Schema.Literals(["brand", "short", "formal"]),
  /** What the shopper reads at a handover; `{wanneer}` becomes when a person is next there. */
  handoverMessage: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(500))
})
export type CustomerAgentSettingsInput = typeof CustomerAgentSettingsInput.Type

export class CustomerAgentSettings extends Schema.Class<CustomerAgentSettings>("channelAgent/Settings")({
  ...CustomerAgentSettingsInput.fields,
  /** Saves so far; 0 is the default, never saved. */
  version: Schema.Int
}) {}

/** The settings with what they come to now: the autonomy rule they narrow, and the stores the chat is on. */
export class ChannelAgentView extends Schema.Class<ChannelAgentView>("channelAgent/View")({
  settings: CustomerAgentSettings,
  /** Zelfstandigheid's "Klant beantwoorden": the master. A channel's `auto` is effective only at `auto`. */
  sendReply: Schema.Literals(AUTONOMY_LEVELS),
  /** Each channel's mode as it works now: narrowed by `sendReply` (and off while the agent is). */
  effective: Channels,
  /** The stores the reader reaches, by name: where the website chat answers. */
  stores: Schema.Array(Schema.String),
  timezone: Schema.String,
  /** The workspace's AI budget is spent this month: every new chat goes to the team until it turns or is raised. */
  budgetSpent: Schema.Boolean
}) {}

export class ChannelAgentSaved extends Schema.Class<ChannelAgentSaved>("channelAgent/Saved")({
  view: ChannelAgentView,
  undo: Schema.NullOr(UndoTicket)
}) {}

/** "Gesprekken vandaag", "Zelf afgehandeld", "Overgedragen", "Wachten", "Eerste reactie" (seconds). */
export class AgentDay extends Schema.Class<AgentDay>("channelAgent/Day")({
  conversations: Schema.Int,
  handled: Schema.Int,
  handedOver: Schema.Int,
  waiting: Schema.Int,
  avgSeconds: Schema.Int
}) {}

export const TestInput = Schema.Struct({
  text: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(1000)),
  /** The page's draft, unsaved. */
  settings: CustomerAgentSettingsInput
})
export type TestInput = typeof TestInput.Type

/** What the agent would say to one message, and from where; nothing is sent. */
export class TestAnswer extends Schema.Class<TestAnswer>("channelAgent/TestAnswer")({
  text: Schema.String,
  source: Schema.NullOr(Schema.Struct({ articleId: Schema.String, title: Schema.String, version: Schema.Int })),
  /** Handed to a person: why, in Dutch ("de klant vraagt om een mens"), and its code. */
  handover: Schema.NullOr(Schema.Struct({ reason: Schema.String, label: Schema.String })),
  /** What would become of it: answered, a draft for the team, or nothing sent (the agent off on the website chat). */
  mode: ChannelMode
}) {}

/** `auto` on a channel that cannot answer by itself yet. */
export class AutoNotAllowedOnChannel
  extends Schema.TaggedError<AutoNotAllowedOnChannel>()("AutoNotAllowedOnChannel", { channel: Schema.String })
{}

/** A day whose closing time is not after its opening time (0 is Monday). */
export class HoursInvalid extends Schema.TaggedError<HoursInvalid>()("HoursInvalid", { day: Schema.Int }) {}

/** The compensation of a save (`customer_agent.restore`): the settings before it, or none (the default). */
export const SettingsRestore = Schema.Struct({ before: Schema.NullOr(CustomerAgentSettingsInput) })
