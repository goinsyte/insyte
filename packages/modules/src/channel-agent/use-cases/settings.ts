import { Conflict } from "@insyte/domain/Errors"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect, Option, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import { OfflinePlan } from "../../first-analysis/domain/FirstAnalysis.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import * as Undo from "../../shared/use-cases/Undo.ts"
import {
  AgentDay,
  AutoNotAllowedOnChannel,
  CHANNEL_KINDS,
  ChannelAgentSaved,
  ChannelAgentView,
  type Channels,
  CustomerAgentSettings,
  type CustomerAgentSettingsInput,
  DayHours,
  HandoverRules,
  HoursInvalid,
  SettingsRestore
} from "../domain/ChannelAgent.ts"
import {
  badDay,
  DEFAULT_HANDOVER_MESSAGE,
  DEFAULT_HOURS,
  DEFAULT_RULES,
  effectiveModes,
  widens
} from "../domain/Rules.ts"

/*
 * Klantagent's settings (M15 step 8; api.md §2.25): one rule set for the workspace with a mode per channel, read by the
 * team (Instellingen · Bekijken) and saved with Beheren; what widens what Insyte says to shoppers by itself (`widens`:
 * switching it on, a channel to Zelf antwoorden, the hours, handover rules that hand over less, the handover's words)
 * also needs `ai.autonomy`, and so does an undo that would. Every save has its Undo, which undoes only that save. The
 * hours default to the offline plan's (the onboarding's), then to Monday to Friday 9–18.
 *
 * The day's figures (`today`) are read with Klantenservice · Bekijken, within the reader's stores.
 */

export const RESTORE = "customer_agent.restore"

/** Only the website chat answers by itself in phase 1: the others draft at most. */
const AUTO_CHANNELS: ReadonlySet<string> = new Set(["webchat"])

interface Row {
  readonly enabled: boolean
  readonly channelModes: unknown
  readonly openingHours: unknown
  readonly outsideHours: "answer" | "take"
  readonly handover: unknown
  readonly tone: "brand" | "short" | "formal"
  readonly handoverSentence: string
  readonly version: number
}

const decodeHours = Schema.decodeUnknownOption(Schema.Array(DayHours))
const decodeRules = Schema.decodeUnknownOption(HandoverRules)
const decodePlan = Schema.decodeUnknownOption(OfflinePlan)

const modesOf = (stored: unknown): Channels => {
  const o = typeof stored === "object" && stored !== null ? (stored as Record<string, unknown>) : {}
  const mode = (k: string) => (o[k] === "auto" || o[k] === "drafts" ? o[k] : "off") as Channels["webchat"]
  return { webchat: mode("webchat"), whatsapp: mode("whatsapp"), instagram: mode("instagram"), email: mode("email") }
}

/** The workspace's time zone. */
export const timezoneOf = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<{ timezone: string | null }>`select timezone from workspaces where id = app_workspace_id()`,
    ([r]) => r?.timezone ?? "Europe/Amsterdam"
  )

/**
 * The settings in force: the saved row, or the default (off) with the offline plan's hours. Read as whoever runs it:
 * the page's reader, or the agent's turn as the system.
 */
export const read = Effect.fn("ChannelAgent.read")(function*(sql: SqlClient.SqlClient) {
  const [row] = yield* sql<Row>`
    select enabled, channel_modes, opening_hours, outside_hours, handover, tone, handover_sentence, version
    from customer_agent_settings`
  const hours = Option.getOrNull(decodeHours(row?.openingHours)) ?? (yield* planHours(sql)) ?? DEFAULT_HOURS
  return new CustomerAgentSettings({
    on: row?.enabled ?? false,
    channels: modesOf(row?.channelModes),
    hours: hours.length === 7 ? hours : DEFAULT_HOURS,
    outside: row?.outsideHours ?? "take",
    handover: Option.getOrNull(decodeRules(row?.handover)) ?? DEFAULT_RULES,
    tone: row?.tone ?? "brand",
    handoverMessage: row?.handoverSentence ?? DEFAULT_HANDOVER_MESSAGE,
    version: row?.version ?? 0
  })
})

/** The hours the onboarding's offline plan agreed, where it did. */
const planHours = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<{ plan: unknown }>`
      select offline as plan from first_analyses where offline is not null
      order by offline_at desc nulls last limit 1`,
    ([r]) => {
      const plan = Option.getOrNull(decodePlan(r?.plan))
      return plan !== null && plan.hours.length === 7 ? plan.hours : null
    }
  )

/** Zelfstandigheid's "Klant beantwoorden", through `autonomy_decide` (which every principal may call). */
export const sendReplyLevel = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<{ level: "auto" | "ask" | "never" }>`select level from autonomy_decide('SendReply', null)`,
    ([r]) => r?.level ?? "ask"
  )

/** Whether the workspace's AI budget is spent this month (`ai_month_used`, as every model call reserves against it). */
const budgetSpent = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<{ spent: boolean }>`
      select coalesce(ai_month_used(null) >= b.monthly_limit_minor::bigint * 10000, false) as spent
      from (select 1) one left join ai_budgets b on b.member_id is null`,
    ([r]) => r?.spent ?? false
  )

const viewOf = Effect.fn("ChannelAgent.view")(function*(sql: SqlClient.SqlClient) {
  const settings = yield* read(sql)
  const level = yield* sendReplyLevel(sql)
  const stores = yield* sql<{ name: string }>`
    select name from stores where ${yield* inScope(sql, "id")} and status <> 'disconnected' order by created_at, id`
  return new ChannelAgentView({
    settings,
    sendReply: level,
    effective: effectiveModes(settings.on, settings.channels, level),
    stores: stores.map((s) => s.name),
    timezone: yield* timezoneOf(sql),
    budgetSpent: yield* budgetSpent(sql)
  })
})

export const get = Effect.fn("ChannelAgent.get")(function*(sql: SqlClient.SqlClient) {
  yield* Policy.require("settings", 1)
  return yield* viewOf(sql)
})

/** The settings for a key over `/v1` and MCP: the customer agent is support's. */
export const getForKey = Effect.fn("ChannelAgent.getForKey")(function*(sql: SqlClient.SqlClient) {
  yield* Policy.require("support", 1)
  return yield* viewOf(sql)
})

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** One save or undo at a time per workspace, so each reads the settings it changes. */
const lock = (sql: SqlClient.SqlClient) =>
  sql`select pg_advisory_xact_lock(hashtextextended('customer_agent:' || app_workspace_id(), 0))`

const inputOf = (s: CustomerAgentSettings): CustomerAgentSettingsInput => ({
  on: s.on,
  channels: s.channels,
  hours: s.hours,
  outside: s.outside,
  handover: s.handover,
  tone: s.tone,
  handoverMessage: s.handoverMessage
})

/** Writes the settings as the next version, on the caller's transaction. */
const write = Effect.fn("ChannelAgent.write")(function*(sql: SqlClient.SqlClient, next: CustomerAgentSettingsInput) {
  const principal = yield* CurrentPrincipal
  const topics = [...new Set(next.handover.topics.map((t) => t.trim().toLowerCase()).filter((t) => t !== ""))]
  const handover = { ...next.handover, topics }
  yield* sql`
    insert into customer_agent_settings (workspace_id, enabled, channel_modes, opening_hours, outside_hours, handover,
                                         tone, handover_sentence, version, updated_by)
    values (app_workspace_id(), ${next.on}, ${JSON.stringify(next.channels)}::jsonb, ${
    JSON.stringify(next.hours)
  }::jsonb,
            ${next.outside}, ${JSON.stringify(handover)}::jsonb, ${next.tone}, ${next.handoverMessage.trim()}, 1,
            ${principal.id})
    on conflict (workspace_id) do update
      set enabled = excluded.enabled, channel_modes = excluded.channel_modes, opening_hours = excluded.opening_hours,
          outside_hours = excluded.outside_hours, handover = excluded.handover, tone = excluded.tone,
          handover_sentence = excluded.handover_sentence, version = customer_agent_settings.version + 1,
          updated_by = excluded.updated_by`
  yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
    action: "customer_agent.changed",
    subjectType: "channel_agent",
    subjectId: principal.workspaceId,
    diff: { on: next.on, channels: next.channels, outside: next.outside, tone: next.tone }
  })
})

const check = (next: CustomerAgentSettingsInput) =>
  Effect.gen(function*() {
    const auto = CHANNEL_KINDS.find((k) => next.channels[k] === "auto" && !AUTO_CHANNELS.has(k))
    if (auto !== undefined) return yield* new AutoNotAllowedOnChannel({ channel: auto })
    const day = badDay(next.hours)
    if (day !== null) return yield* new HoursInvalid({ day })
    if (next.handoverMessage.trim() === "") return yield* new HoursInvalid({ day: -1 })
  })

/** "Opslaan", "Aanzetten voor de websitechat", "Klantagent uitzetten": the whole form, with its Undo. */
export const set = Effect.fn("ChannelAgent.set")(function*(sql: SqlClient.SqlClient, next: CustomerAgentSettingsInput) {
  yield* Policy.require("settings", 2)
  yield* check(next)
  yield* lock(sql)
  const was = yield* read(sql)
  if (widens(inputOf(was), next)) yield* Policy.requireAction("ai.autonomy")
  if (!same(inputOf(was), { ...next, handoverMessage: next.handoverMessage.trim() })) {
    yield* write(sql, next)
    const undo = yield* Undo.issue(sql, {
      command: RESTORE,
      compensation: {
        before: was.version === 0 ? null : inputOf(was),
        version: was.version + 1
      } satisfies typeof SettingsRestore.Type
    })
    return new ChannelAgentSaved({ view: yield* viewOf(sql), undo })
  }
  return new ChannelAgentSaved({ view: yield* viewOf(sql), undo: null })
})

const decodeRestore = Schema.decodeUnknownEffect(SettingsRestore)

/** The undo of a save: the settings before it again, as a save of their own. */
export const restore = Effect.fn("ChannelAgent.restore")(function*(sql: SqlClient.SqlClient, compensation: unknown) {
  const c = yield* decodeRestore(compensation).pipe(Effect.orDie)
  yield* Policy.require("settings", 2)
  const principal = yield* CurrentPrincipal
  yield* lock(sql)
  const now = yield* read(sql)
  // Saved again since: this token undoes that later save too, which is not its own.
  if (c.version !== undefined && now.version !== c.version) {
    return yield* new Conflict({ entity: "customer_agent", reason: "changed" })
  }
  const back = c.before ?? { ...inputOf(now), on: false }
  if (widens(inputOf(now), back)) yield* Policy.requireAction("ai.autonomy")
  if (c.before === null) {
    // Never saved before: back to the default, which is off.
    yield* sql`update customer_agent_settings set enabled = false, version = version + 1, updated_by = ${principal.id}`
    yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
      action: "customer_agent.changed",
      subjectType: "channel_agent",
      subjectId: principal.workspaceId,
      diff: { on: false }
    })
    return
  }
  yield* write(sql, c.before)
})

/* ── the day ──────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The five figures of the customer agent's day, in the workspace's time zone, within the reader's stores: the chats it
 * heard today, those it answered and kept, those it handed over, those handed over (a runaway thread too) and still
 * waiting for a colleague (not taken over since, as far as the agent saw), and its first reply's average delay after
 * the shopper's first message.
 */
export const today = Effect.fn("ChannelAgent.today")(function*(sql: SqlClient.SqlClient) {
  yield* Policy.require("support", 1)
  const scope = yield* inScope(sql, "t.store_id")
  const [r] = yield* sql<{ conversations: number; handled: number; handedOver: number; waiting: number; avg: number }>`
    with day as (
      select (date_trunc('day', now() at time zone tz) at time zone tz) as start
      from (select coalesce(timezone, 'Europe/Amsterdam') as tz from workspaces where id = app_workspace_id()) w
    )
    select count(*)::int as conversations,
           count(*) filter (where t.replies > 0 and t.handed_over_at is null)::int as handled,
           count(*) filter (where t.handed_over_at >= day.start)::int as handed_over,
           count(*) filter (where (t.handed_over_at is not null or t.held_at is not null)
                            and t.taken_over_at is null)::int as waiting,
           coalesce(round(avg(extract(epoch from t.first_reply_at - t.first_message_at))
                          filter (where t.first_reply_at is not null)), 0)::int as avg
    from customer_agent_threads t cross join day
    where t.first_message_at >= day.start and ${scope}`
  return new AgentDay({
    conversations: r?.conversations ?? 0,
    handled: r?.handled ?? 0,
    handedOver: r?.handedOver ?? 0,
    waiting: r?.waiting ?? 0,
    avgSeconds: r?.avg ?? 0
  })
})
