import { Db } from "@insyte/database/Db"
import type { AgentActionId } from "@insyte/domain/AgentActions"
import { mintId } from "@insyte/domain/Ids"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect, Option, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import { agentPrincipal, daySlot, decideAutonomy, freeSlot, recordAction, teamHolds } from "../../agent/Agent.ts"
import { shipStage, type WismoOrder } from "../../agent/domain/Triggers.ts"
import type { Caller, CustomerAgentContext, CustomerAgentOutput } from "../../ai/Ai.ts"
import type { BudgetExceeded, ModelUnavailable } from "../../ai/domain/Ai.ts"
import type { Hit } from "../../knowledge/domain/Knowledge.ts"
import { cite, fileGap } from "../../knowledge/Knowledge.ts"
import { ShippingValue } from "../../settings/domain/Settings.ts"
import {
  CHAT_CALLS_PER_HOUR,
  holdingPlan,
  isPlanId,
  PLAN_CHAT_CALLS_PER_HOUR,
  type PlanId,
  standingOf
} from "../../shared/domain/Billing.ts"
import { ChatChannel, type ChatMessage } from "../../shared/domain/ChatChannel.ts"
import { wordingFor } from "../../shared/domain/CustomerFacing.ts"
import type { CustomerAgentSettings, CustomerAgentSettingsInput } from "../domain/ChannelAgent.ts"
import {
  aboutAnOrder,
  AGENT_BUDGET_SHARE,
  ASK_PROOF,
  checkable,
  claimOf,
  handFor,
  handoverText,
  isOpen,
  MAX_PENDING,
  MAX_TURNS,
  type OrderFacts,
  orderStatusReply,
  PROOF_FAILED,
  PROOF_OFFERED,
  PROOF_SHOWN,
  redactContact,
  REPLY_MAX,
  replyFaults,
  STORE_VERIFY_CAP,
  triggerOf,
  VERIFY_CAP
} from "../domain/Rules.ts"
import { read, timezoneOf } from "./settings.ts"

/*
 * The customer agent at work (M15 step 8; ADR-0027, widgets/04 Klantagent): a shopper's message on the website chat
 * (`chat.received`, through the agent sink and the events queue) answered as the workspace's own agent, or handed to
 * the team. The thinking is in `think`, which the page's test chat runs too; the rest is what only a real chat has:
 * the thread's standing, the order the shopper proves, the reply, and its row in Wat Insyte deed.
 *
 * In order, for each message:
 *
 * 1. The agent off, or the website chat's mode Uit: silent. The chat is the team's, as without the agent.
 * 2. Claimed once per message; a thread a person took over, closed, or already handed over is left alone (logged as
 *    `taken`) until it is handed back.
 * 3. Zelfstandigheid's "Klant beantwoorden" (`SendReply`) is the master, the channel's mode only narrows it: Zelf doen
 *    and Zelf antwoorden answer; Eerst vragen, the offline plan's hours, or Alleen concepten leave a draft for the
 *    team; Nooit hands the chat to the team without a word. A spent budget hands it over. Outside the opening hours
 *    with "Vraag aannemen" the agent takes the question and says when a person answers.
 * 4. A message for a person (one asked for, a complaint, a chargeback or a lawyer, anger, money, a cancellation or an
 *    address change, a topic always for a colleague, too many messages) is handed over before anything else. Every
 *    message of the shopper's since the agent or the team last wrote is read so, not only the newest: a turn answers
 *    them all, and more than `MAX_PENDING` at once is a person's. "Na zoveel berichten" counts messages, not turns.
 * 5. About the shopper's own order: nothing is said of any order until they prove one (its number, and the e-mail
 *    address or the postcode on it, in the thread's store). A wrong guess gets the same answer however it was wrong;
 *    three on a thread, or many in a store within the hour, and a person takes it. A proved order's status is a fixed
 *    text from its facts, and only an order with one plain story has one; partly sent, split, sent back, refunded:
 *    a person.
 * 6. Anything else is answered only from the knowledge base's chapters published to the customer agent, for every
 *    store or the thread's own, by the model, and the answer checked: a digit, a promise or a link it was not given,
 *    and it is not sent. Nothing found: handed over, and the question filed under "Nog niet beantwoord". Before any
 *    model call (right before it, so a question nothing covers costs none): on Zelf antwoorden the day's limit, the
 *    store's calls this hour (the plan's `PLAN_CHAT_CALLS_PER_HOUR`, each one counted as it starts, under a lock, so
 *    chats at once see each other) and the agent's share of the month's budget (`AGENT_BUDGET_SHARE`); past any, a
 *    person, and no model is asked. The model never reads an e-mail address, a phone number, a postcode or a street
 *    and house number, nor the message that proved an order. A reply over the chat's `REPLY_MAX` is a person's.
 * 7. Right before anything goes (a reply or the handover's words), everything is asked again: the settings, the
 *    policy, the offline plan's hours and the opening hours, the thread, and whether this is still the shopper's
 *    newest message. Then `ChatChannel.reply` as the agent.
 *
 * Every turn is one row in `agent_actions` with its reason. No message text is logged or kept outside the chat.
 */

export const ACTION: AgentActionId = "SendReply"

/** The log's name for every chat: no shopper's words. */
const SUBJECT_LABEL = "Chat van een websitebezoeker"
const TRIGGER = { kind: "event:chat.received", label: "Nieuw chatbericht" } as const
const SOURCES = [{ kind: "chat", title: "Websitechat", detail: "Bericht van een bezoeker", to: "/inbox" }]

/** Replies on one thread before it ran away: a person takes it from there. */
export const MAX_REPLIES = 20

/** How much of the conversation the model reads. */
const HISTORY = 12

/** How much of the chat a turn reads: the model's history, and every message of the shopper's it screens, and one. */
const READ = HISTORY + MAX_PENDING + 1

/** How many chapters it reads. */
const SOURCES_READ = 3

export type HandoverReason =
  | "asks_person"
  | "sensitive"
  | "money"
  | "topic"
  | "turns"
  | "no_knowledge"
  | "unsure"
  | "verify_cap"
  | "order_complex"
  | "outside_hours"
  | "runaway"
  | "error"
  | "budget"
  | "policy"
  | "guard"
  | "disabled"
  | "limit"

export type ModelRef = { readonly name: string; readonly promptVersion: string }

/** What the agent would say to a message, or why a person should. */
export type Thought =
  | {
    readonly _tag: "Reply"
    readonly text: string
    /** Where it came from: the knowledge base (with the chapters used), a proved order, or the agent's own words. */
    readonly kind: "knowledge" | "order" | "ask_proof" | "proof_failed"
    readonly hits: ReadonlyArray<Hit>
    readonly model: ModelRef | null
  }
  | { readonly _tag: "Handover"; readonly reason: HandoverReason; readonly gap: boolean }

const handover = (reason: HandoverReason, gap = false): Thought => ({ _tag: "Handover", reason, gap })

/** What the agent thinks with, from whoever runs it: the knowledge base and the model, as the platform loads them. */
export interface Brain {
  /**
   * The chapters published to the customer agent about the question, for every store or that one (`storeId`; `null`,
   * the principal's stores).
   */
  readonly search: (
    query: string,
    storeId: string | null
  ) => Effect.Effect<ReadonlyArray<Hit>, never, Db | CurrentPrincipal>
  readonly answer: (
    input: CustomerAgentContext,
    caller: Caller
  ) => Effect.Effect<
    { readonly value: CustomerAgentOutput; readonly callId: string; readonly model: ModelRef },
    BudgetExceeded | ModelUnavailable,
    Db | CurrentPrincipal
  >
}

export interface Thinking<E = never, R = never> {
  /** What the shopper asked: their messages since the agent last spoke, oldest first, one per line. */
  readonly text: string
  /** The thread's store, whose chapters (and every store's) it may read; `null`, the principal's stores. */
  readonly storeId: string | null
  /** The conversation before it, oldest first. */
  readonly before: CustomerAgentContext["messages"]
  readonly settings: CustomerAgentSettingsInput
  readonly brand: string
  /** The proved order's facts, in words; `null` until one is. */
  readonly order: string | null
  readonly caller: Caller
  /**
   * Asked before the knowledge search and the model (a real chat's limits, its call counted): a reason, and a person
   * answers without either. None: the test chat's, which is a person's own call.
   */
  readonly gate?: Effect.Effect<HandoverReason | null, E, R>
  /** The call the gate counted, given back: nothing was found, so no model was asked. */
  readonly ungate?: Effect.Effect<void, E, R>
}

/**
 * The agent's answer to one message, from the knowledge base (and a proved order's facts), or why a person answers:
 * the same for a real chat and the page's test chat. Nothing is sent or written here but the model's row.
 */
export const think = <E = never, R = never>(brain: Brain, t: Thinking<E, R>) =>
  Effect.gen(function*() {
    const trigger = triggerOf(t.text, t.settings.handover)
    if (trigger !== null) return handover(trigger.trigger)
    const question = redactContact(t.text)
    // A chat past its limits costs neither the search's embedding nor a model call.
    const held = t.gate === undefined ? null : yield* t.gate
    if (held !== null) return handover(held)
    // Another store's chapter is never this store's answer, whatever the search returned.
    const hits = (yield* brain.search(question, t.storeId))
      .filter((h) => t.storeId === null || h.storeId === null || h.storeId === t.storeId)
      .slice(0, SOURCES_READ)
    if (hits.length === 0 && t.order === null) {
      if (t.ungate !== undefined) yield* t.ungate
      return handover("no_knowledge", true)
    }
    const knowledge = hits.map((h, i) => ({ ref: i + 1, title: h.title, text: h.text }))
    const asked = yield* Effect.result(
      brain.answer({
        brand: t.brand,
        tone: t.settings.tone,
        messages: [
          ...t.before.map((m) => (m.from === "klant" ? { ...m, text: redactContact(m.text) } : m)),
          { from: "klant", text: question }
        ],
        knowledge,
        order: t.order
      }, t.caller)
    )
    if (asked._tag === "Failure") return handover(asked.failure._tag === "BudgetExceeded" ? "budget" : "error")
    const out = asked.success.value
    const text = out.text.trim()
    if (!out.answered || text === "") return handover("no_knowledge", true)
    if (!out.sure && t.settings.handover.unsure) return handover("unsure")
    if (text.length > REPLY_MAX) return handover("guard")
    const facts = [...knowledge.map((k) => `${k.title}\n${k.text}`), t.order ?? "", t.brand].join("\n")
    // A promise is read from what the chapters and the order say, never from a chapter's title.
    const statements = [...knowledge.map((k) => k.text), t.order ?? ""].join("\n")
    // An order's state said as done only from the proved order's facts.
    if (replyFaults(text, { facts, statements, order: t.order }).length > 0) return handover("guard")
    const used = out.sources.flatMap((ref) => (hits[ref - 1] === undefined ? [] : [hits[ref - 1]!]))
    return { _tag: "Reply", text, kind: "knowledge", hits: used, model: asked.success.model } satisfies Thought
  })

/* ── a real chat ──────────────────────────────────────────────────────────────────────────────────────────── */

export interface ChatTask {
  readonly eventId: string
  readonly storeId: string
  readonly threadId: string
  readonly messageId: string
}

/** What became of a message, for the queue's telemetry: never its words. */
export type Turn = "silent" | "seen" | "taken" | "answered" | "drafted" | "handed_over" | "refused"

interface ThreadRow {
  readonly replies: number
  readonly shopperTurns: number
  readonly verifyFailures: number
  readonly verifiedOrderId: string | null
}

/**
 * The agent's row for the thread, its shopper messages counted (`pending`: those since the agent or the team last wrote,
 * of which the ones after the last counted are new; the first one's time, the shopper's own). Called only while the
 * chat says nobody holds the thread: a row still marked handed over, or taken over by a person as the agent saw it, was
 * handed back since, and starts again without the order the shopper proved (whoever writes now proves it again;
 * Beslissen), its failed checks kept. A takeover and hand-back the agent never saw (no shopper message in between) is
 * the chat's `handedBackAt`: one the agent has not acted on yet (`seen_hand_back_at`) drops the proof too. The orders
 * proved on it stay listed for an erasure.
 */
const turnOn = (
  sql: SqlClient.SqlClient,
  task: ChatTask,
  pending: ReadonlyArray<ChatMessage>,
  handedBackAt: Date | null
) =>
  Effect.gen(function*() {
    // Handed back: the agent handed it over, or saw a person had it.
    const BACK = sql.literal(
      "(customer_agent_threads.handed_over_at is not null or customer_agent_threads.taken_over_at is not null)"
    )
    // A hand-back the agent has not acted on yet (the chat's own time of it, never compared with the database's clock):
    // a proof from before it is not this conversation's any more.
    const STALE = sql`(${BACK} or (${handedBackAt}::timestamptz is not null
                      and customer_agent_threads.seen_hand_back_at is distinct from ${handedBackAt}::timestamptz))`
    const [was] = yield* sql<{ countedMessageId: string | null }>`
      select counted_message_id from customer_agent_threads where thread_id = ${task.threadId} for update`
    const after = was?.countedMessageId == null ? -1 : pending.findIndex((m) => m.id === was.countedMessageId)
    const fresh = Math.max(1, pending.length - (after + 1))
    const [r] = yield* sql<ThreadRow>`
      insert into customer_agent_threads (workspace_id, thread_id, store_id, shopper_turns, first_message_at,
                                          counted_message_id, seen_hand_back_at)
      values (app_workspace_id(), ${task.threadId}, ${task.storeId}, ${fresh}, ${pending[0]!.at},
              ${pending.at(-1)!.id}, ${handedBackAt})
      on conflict (workspace_id, thread_id) do update
        set shopper_turns = case when ${BACK} then ${fresh} else customer_agent_threads.shopper_turns + ${fresh} end,
            replies = case when ${BACK} then 0 else customer_agent_threads.replies end,
            verified_order_id = case when ${STALE} then null else customer_agent_threads.verified_order_id end,
            verified_at = case when ${STALE} then null else customer_agent_threads.verified_at end,
            counted_message_id = excluded.counted_message_id, seen_hand_back_at = excluded.seen_hand_back_at,
            handed_over_at = null, handover_reason = null, held_at = null, taken_over_at = null
      returning replies, shopper_turns, verify_failures, verified_order_id`
    return r!
  })

/**
 * The customer agent's model calls in the store within the hour, over all its chats: each is counted as it starts (a
 * touchpoint `chat-call:<store>:<action>`, written under the store's lock), so chats at once see each other.
 */
const storeModelCalls = (sql: SqlClient.SqlClient, storeId: string) =>
  Effect.map(
    sql<{ n: number }>`
      select count(*)::int as n from agent_touchpoints
      where workspace_id = app_workspace_id() and starts_with(dedupe_key, ${`chat-call:${storeId}:`})
        and created_at > now() - interval '1 hour'`,
    ([r]) => r?.n ?? 0
  )

/** The calls a store's website chat may make within the hour: the plan's whose limits hold, or the default. */
const storeCallCap = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<{ workspacePlan: string; status: string | null; plan: string | null; startedAt: Date | null }>`
      select workspace_plan, status, plan, started_at from workspace_seat_facts()`,
    ([row]) => {
      const paid: PlanId | null = row?.plan != null && isPlanId(row.plan) ? row.plan : null
      const holds = holdingPlan(standingOf(row?.status, row?.startedAt), paid, row?.workspacePlan ?? "trial")
      return holds === null ? CHAT_CALLS_PER_HOUR : PLAN_CHAT_CALLS_PER_HOUR[holds]
    }
  )

/**
 * Whether a model call may start for this turn (`id`) in the store, and if so counted: under the store's lock, the
 * hour's calls against the plan's cap, then the agent's share of the budget. A reason, and none starts.
 */
const startCall = (storeId: string, id: string) =>
  Effect.flatMap(Effect.service(Db), (db) =>
    db.scopedFor((sql) =>
      Effect.gen(function*() {
        yield* sql`select pg_advisory_xact_lock(hashtext(app_workspace_id() || ':chat-call:' || ${storeId}))`
        if ((yield* storeModelCalls(sql, storeId)) >= (yield* storeCallCap(sql))) return "limit" as const
        if (yield* shareSpent(sql)) return "budget" as const
        yield* sql`insert into agent_touchpoints (workspace_id, dedupe_key, agent_action_id)
                   values (app_workspace_id(), ${`chat-call:${storeId}:${id}`}, ${id}) on conflict do nothing`
        // What counts is the hour's: older calls go (two hours, for a clock between the counts).
        yield* sql`delete from agent_touchpoints
                   where workspace_id = app_workspace_id() and dedupe_key like 'chat-call:%'
                     and created_at < now() - interval '2 hours'`
        return null
      })
    ))

/** A call `startCall` counted that was never made: nothing was found to ask the model about. */
const freeCall = (storeId: string, id: string) =>
  Effect.flatMap(Effect.service(Db), (db) =>
    db.scopedFor((sql) =>
      Effect.asVoid(sql`delete from agent_touchpoints
                        where workspace_id = app_workspace_id() and dedupe_key = ${`chat-call:${storeId}:${id}`}`)
    ))

/**
 * Whether the customer agent's share of the month's AI budget is spent (`AGENT_BUDGET_SHARE` of the workspace's limit,
 * its billed calls and its reservations still out). No limit, no share.
 */
const shareSpent = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<{ spent: boolean }>`
      with ws as (select coalesce(timezone, 'Europe/Amsterdam') as tz from workspaces where id = app_workspace_id()),
           since as (select (date_trunc('month', now() at time zone ws.tz) at time zone ws.tz) as start from ws),
           used as (
             select coalesce(sum(m.cost_micros), 0) as micros from model_calls m, since
             where m.workspace_id = app_workspace_id() and m.prompt_id = 'customer_agent' and not m.test
               and m.created_at >= since.start
             union all
             select coalesce(sum(a.cost_micros), 0) from ai_reservations a, since
             where a.workspace_id = app_workspace_id() and a.prompt_id = 'customer_agent' and a.settled_at is null
               and a.created_at >= since.start
           )
      select coalesce((select sum(micros) from used)
                      >= b.monthly_limit_minor::numeric * 10000 * ${AGENT_BUDGET_SHARE}, false) as spent
      from (select 1) one left join ai_budgets b on b.member_id is null`,
    ([r]) => r?.spent ?? false
  )

const decodeShipping = Schema.decodeUnknownOption(ShippingValue)

/** Only a carrier page on https goes to a shopper. */
const httpsOnly = (url: string | null) => {
  if (url === null) return null
  try {
    return new URL(url).protocol === "https:" ? url : null
  } catch {
    return null
  }
}

/** A proved order's one plain status, or `null` where it has none to say (split, partly sent, refunded, returned). */
const factsOf = (sql: SqlClient.SqlClient, orderId: string, storeId: string, tz: string) =>
  Effect.gen(function*() {
    const [o] = yield* sql<{
      number: string
      status: string
      payment: string
      fulfilment: string
      parcels: number
      parcel: string | null
      carrier: string | null
      trackingUrl: string | null
      expected: Date | null
      deliveredAt: Date | null
      wording: unknown
    }>`
      select o.number, o.status, o.payment_status as payment, o.fulfillment_status as fulfilment,
             (select count(*)::int from fulfilments a where a.order_id = o.id) as parcels,
             coalesce(d.status, f.tracking_status) as parcel, coalesce(f.carrier, d.carrier) as carrier,
             nullif(btrim(f.tracking_url), '') as tracking_url,
             case when d.estimated_delivery > now() then d.estimated_delivery end as expected,
             coalesce(d.delivered_at, f.delivered_at) as delivered_at,
             (select v.value from workspace_settings v where v.section = 'shipping') as wording
      from orders o
      left join lateral (select id, carrier, tracking_url, tracking_status, delivered_at
                         from fulfilments where order_id = o.id order by shipped_at desc nulls last limit 1) f on true
      left join deliveries d on d.fulfilment_id = f.id
      where o.id = ${orderId} and o.store_id = ${storeId} and not o.is_draft`
    if (o === undefined) return null
    const day = (d: Date | null) =>
      d === null ? null : new Intl.DateTimeFormat("nl-NL", { timeZone: tz, dateStyle: "long" }).format(d)
    const w: WismoOrder = {
      number: o.number,
      status: o.status,
      payment: o.payment,
      fulfilment: o.fulfilment,
      parcels: o.parcels,
      parcel: o.parcel,
      carrier: o.carrier,
      trackingUrl: httpsOnly(o.trackingUrl),
      expectedOn: day(o.expected),
      deliveredOn: day(o.deliveredAt)
    }
    const stage = shipStage(w)
    if (stage === null) return null
    const stored = Option.getOrNull(decodeShipping(o.wording))
    return {
      number: w.number,
      label: wordingFor(stored, stage, w.carrier).text,
      carrier: w.carrier,
      trackingUrl: w.trackingUrl,
      expectedOn: w.expectedOn,
      deliveredOn: w.deliveredOn,
      delivered: stage === "delivered"
    } satisfies OrderFacts
  })

/** The order a claim proves: its number in the thread's store, with that e-mail address or postcode on it. One, or none. */
const proved = (
  sql: SqlClient.SqlClient,
  storeId: string,
  claim: ReturnType<typeof claimOf>
) =>
  Effect.map(
    sql<{ id: string; customerId: string | null }>`
      select o.id, o.customer_id from orders o
      where o.store_id = ${storeId} and not o.is_draft
        and regexp_replace(o.number, '\\D', '', 'g') = ${claim.number}
        and ((${claim.email}::text is not null and lower(btrim(o.customer_email)) = ${claim.email})
             or (${claim.postcode}::text is not null
                 and upper(regexp_replace(coalesce(o.shipping_address ->> 'postcode', ''), '\\s', '', 'g'))
                     = ${claim.postcode}))
      limit 2`,
    (rows) => (rows.length === 1 ? rows[0]! : null)
  )

/** Failed order checks in the store within the hour, over all its chats: guessing across threads. */
const storeFailures = (sql: SqlClient.SqlClient, storeId: string) =>
  Effect.map(
    sql<{ n: number }>`
      select coalesce(sum(verify_failures), 0)::int as n from customer_agent_threads
      where store_id = ${storeId} and last_verify_failed_at > now() - interval '1 hour'`,
    ([r]) => r?.n ?? 0
  )

const LOG: Record<Thought["_tag"] | "Taken" | "Draft", { reason: string; sentence: string }> = {
  Reply: {
    reason: "Een websitebezoeker stelde een vraag; Insyte antwoordde uit de gepubliceerde kennisbank.",
    sentence: "Websitebezoeker geantwoord uit de kennisbank"
  },
  Draft: {
    reason: "Een websitebezoeker stelde een vraag; Insyte zette een concept klaar voor het team.",
    sentence: "Concept klaargezet voor een chat"
  },
  Handover: {
    reason: "Een websitebezoeker stelde een vraag die voor een collega is; Insyte droeg de chat over.",
    sentence: "Chat overgedragen aan het team"
  },
  Taken: {
    reason: "Een collega heeft de chat; Insyte zweeg.",
    sentence: "Chat bij het team gelaten"
  }
}

const SENTENCE: Record<Exclude<Extract<Thought, { _tag: "Reply" }>["kind"], "knowledge">, string> = {
  order: "Websitebezoeker de status van de bestelling gegeven",
  ask_proof: "Websitebezoeker gevraagd de bestelling te bevestigen",
  proof_failed: "Bestelling van een websitebezoeker niet bevestigd"
}

/**
 * The model's words in the log's history before `upTo`: the shopper's, the agent's and the team's, a system line not.
 * A shopper's message that offered an order's proof says only that it did.
 */
export const historyForModel = (
  history: ReadonlyArray<ChatMessage>,
  upTo: string,
  verified: boolean
): CustomerAgentContext["messages"] => {
  const until = history.findIndex((m) => m.id === upTo)
  return (until === -1 ? history : history.slice(0, until)).flatMap((m): CustomerAgentContext["messages"] => {
    if (m.author === "system") return []
    if (m.author !== "shopper") return [{ from: m.author === "agent" ? "insyte" : "team", text: m.text }]
    const claim = claimOf(m.text)
    const offered = claim.email !== null || claim.postcode !== null
    return [{ from: "klant", text: offered ? (verified ? PROOF_SHOWN : PROOF_OFFERED) : m.text }]
  })
}

/** The newest message of the shopper's in the history, or none. */
const newestOfShopper = (history: ReadonlyArray<ChatMessage>) =>
  [...history].reverse().find((m) => m.author === "shopper") ?? null

/**
 * The shopper's messages since the agent or the team last wrote, oldest first: what one turn answers. `whole`: all of
 * them are in `history` (it reached the last word, or the thread's start), not only the newest `limit` of the chat.
 */
const sinceLastWord = (history: ReadonlyArray<ChatMessage>, limit: number) => {
  const pending: Array<ChatMessage> = []
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i]!
    if (m.author === "agent" || m.author === "team") return { pending, whole: true }
    if (m.author === "shopper") pending.unshift(m)
  }
  return { pending, whole: history.length < limit }
}

/**
 * One shopper's message, as the workspace's agent. Whatever happens is logged and nothing is thrown but a database
 * that did not answer (the queue retries that, and the message is acted on once).
 */
export const onChat = (brain: Brain, task: ChatTask) =>
  Effect.gen(function*() {
    const db = yield* Db
    // The settings as the system reads them; off, or Uit on the website chat: the team's, as without the agent.
    const settings = yield* db.scopedFor(read)
    if (!settings.on || settings.channels.webchat === "off") return "silent" as Turn
    const agent = yield* agentPrincipal()
    return yield* turn(brain, task, settings).pipe(Effect.provideService(CurrentPrincipal, agent))
  })

const turn = (brain: Brain, task: ChatTask, settings: CustomerAgentSettings) =>
  Effect.gen(function*() {
    const db = yield* Db
    const chat = yield* ChatChannel
    const id = mintId("aga")
    const dedupeKey = `chat:${task.messageId}`
    const claimed = yield* db.scoped((sql) =>
      sql`insert into agent_touchpoints (workspace_id, dedupe_key, agent_action_id)
          values (app_workspace_id(), ${dedupeKey}, ${id}) on conflict do nothing returning dedupe_key`
    )
    if (claimed.length === 0) return "seen" as Turn

    const d = yield* db.scoped((sql) => decideAutonomy(sql, ACTION, null))
    const write = (row: {
      readonly decision: "run" | "propose" | "refuse"
      readonly outcome: "done" | "failed" | "proposed" | "refused"
      readonly refuseReason: string | null
      readonly reason: string
      readonly sentence: string
      readonly model?: ModelRef | null
      readonly error?: string | null
    }) =>
      db.scoped((sql) =>
        recordAction(sql, {
          id,
          action: ACTION,
          input: null,
          storeId: task.storeId,
          subject: { type: "chat", id: task.threadId, label: SUBJECT_LABEL },
          trigger: TRIGGER,
          policyVersion: d.policyVersion,
          level: d.level,
          decision: row.decision,
          refuseReason: row.refuseReason,
          reason: row.reason,
          sentence: row.sentence,
          before: null,
          after: null,
          effect: null,
          outcome: row.outcome,
          error: row.error ?? null,
          proposalId: null,
          undo: null,
          dedupeKey,
          sources: SOURCES,
          model: row.model ?? null
        })
      )
    const taken = (reason = "taken") =>
      Effect.as(
        write({ decision: "refuse", outcome: "refused", refuseReason: reason, ...LOG.Taken }),
        "taken" as Turn
      )

    // The thread, as the agent may see it: out of its stores, it is not the agent's.
    const found = yield* Effect.result(chat.thread(task.threadId))
    if (found._tag === "Failure" || found.success.storeId !== task.storeId) {
      yield* write({ decision: "refuse", outcome: "refused", refuseReason: "scope", ...LOG.Taken })
      return "refused" as Turn
    }
    const thread = found.success
    if (thread.takenOverBy !== null) {
      // A person has it: the day's "Wachten" no longer counts it.
      yield* db.scoped((sql) =>
        sql`update customer_agent_threads set taken_over_at = coalesce(taken_over_at, now())
            where thread_id = ${task.threadId}`
      )
      return yield* taken()
    }
    if (thread.closedAt !== null || thread.handover !== null) return yield* taken()
    const tz = yield* db.scoped(timezoneOf)
    const history = yield* chat.history(task.threadId, { limit: READ })
    const message = history.find((m) => m.id === task.messageId)
    // A newer message of the shopper's came in meanwhile: that one's turn answers both.
    if (message === undefined || message.author !== "shopper" || newestOfShopper(history)?.id !== task.messageId) {
      return yield* taken("taken")
    }
    // Every message of the shopper's since the agent or the team last wrote: each is screened and counted, and the turn
    // answers all. More than it reads at once: a person.
    const { pending, whole } = sinceLastWord(history, READ)
    const asked = pending.map((m) => m.text).join("\n")
    const row = yield* db.scoped((sql) => turnOn(sql, task, pending, thread.handedBackAt))

    // The master, narrowed by the channel. Nooit, or a budget spent, or the agent switched off on Zelfstandigheid:
    // the team's, without the agent writing anything. A spent budget, the day's limit or the agent switched off asks
    // nobody for a draft (that would call the model): the chat goes to the team, and on Zelf doen and Zelf antwoorden
    // the shopper is told so in the handover's fixed words.
    const unprepared = d.decision === "propose" &&
      ["budget", "disabled", "locked", "unknown", "limit"].includes(d.reason ?? "")
    const holds = d.decision === "run" && (yield* teamHolds(ACTION))
    const level = d.decision === "refuse"
      ? "never"
      : unprepared
      ? d.level
      : d.decision === "propose" || holds
      ? "ask"
      : "auto"
    const now = new Date()
    const open = isOpen(settings.hours, tz, now)
    const { hand, mode } = handFor({
      on: true,
      mode: settings.channels.webchat,
      level,
      open,
      outside: settings.outside
    })
    // On Zelf antwoorden the day's slot is held from before the model is asked until the reply went or did not.
    let slot = false
    const release = () => (slot ? Effect.tap(freeSlot(id), () => Effect.sync(() => (slot = false))) : Effect.void)

    // What the agent would do, before it does it.
    const thought: Thought = yield* Effect.gen(function*() {
      if (hand === "silent") return handover("disabled")
      if (level === "never") return handover("policy")
      if (unprepared) return handover(d.reason === "budget" ? "budget" : d.reason === "limit" ? "limit" : "disabled")
      if (hand === "handover") return handover("outside_hours")
      if (row.replies >= MAX_REPLIES) return handover("runaway")
      const rules = settings.handover
      if (!whole || pending.length > MAX_PENDING) return handover("turns")
      if (row.shopperTurns > MAX_TURNS) return handover("turns")
      if (rules.afterMessages !== null && row.shopperTurns > rules.afterMessages) return handover("turns")
      for (const m of pending) {
        const trigger = triggerOf(m.text, rules)
        if (trigger !== null) return handover(trigger.trigger)
      }
      const claim = claimOf(message.text)
      const ownOrder = pending.some((m) => aboutAnOrder(m.text))
      // A new claim of an order is checked, whatever was proved before; a question about the proved one is answered.
      if (checkable(claim)) {
        return yield* db.scoped((sql) =>
          Effect.gen(function*() {
            yield* sql`select pg_advisory_xact_lock(hashtext(app_workspace_id() || ':chat-proof:' || ${task.storeId}))`
            const [current] = yield* sql<{ verifyFailures: number }>`
              select verify_failures from customer_agent_threads where thread_id = ${task.threadId} for update`
            if (
              (current?.verifyFailures ?? VERIFY_CAP) >= VERIFY_CAP ||
              (yield* storeFailures(sql, task.storeId)) >= STORE_VERIFY_CAP
            ) {
              return handover("verify_cap")
            }
            const order = yield* proved(sql, task.storeId, claim)
            if (order === null) {
              const [f] = yield* sql<{ verifyFailures: number }>`
                update customer_agent_threads set verify_failures = verify_failures + 1, last_verify_failed_at = now()
                where thread_id = ${task.threadId} returning verify_failures`
              return (f?.verifyFailures ?? VERIFY_CAP) >= VERIFY_CAP
                ? handover("verify_cap")
                : ({ _tag: "Reply", text: PROOF_FAILED, kind: "proof_failed", hits: [], model: null } satisfies Thought)
            }
            yield* sql`update customer_agent_threads
                       set verified_order_id = ${order.id}, verified_at = now(),
                           proved_order_ids = case when ${order.id} = any(proved_order_ids) then proved_order_ids
                                                   else array_append(proved_order_ids, ${order.id}::text) end
                       where thread_id = ${task.threadId}`
            if (order.customerId !== null) yield* chat.bindCustomer(task.threadId, order.customerId)
            const facts = yield* factsOf(sql, order.id, task.storeId, tz)
            const said = facts === null ? null : orderStatusReply(facts, settings.tone === "formal")
            return said === null
              ? handover("order_complex")
              : ({ _tag: "Reply", text: said, kind: "order", hits: [], model: null } satisfies Thought)
          })
        )
      }
      if (ownOrder && row.verifiedOrderId !== null && claim.number === null) {
        const facts = yield* db.scoped((sql) => factsOf(sql, row.verifiedOrderId!, task.storeId, tz))
        const said = facts === null ? null : orderStatusReply(facts, settings.tone === "formal")
        return said === null
          ? handover("order_complex")
          : ({ _tag: "Reply", text: said, kind: "order", hits: [], model: null } satisfies Thought)
      }
      if (ownOrder) {
        return row.verifyFailures >= VERIFY_CAP
          ? handover("verify_cap")
          : ({ _tag: "Reply", text: ASK_PROOF, kind: "ask_proof", hits: [], model: null } satisfies Thought)
      }
      // Right before the model is asked: the day's slot on Zelf antwoorden, then the store's calls this hour and the
      // agent's share of the budget, the call counted.
      const gate = Effect.gen(function*() {
        if (mode === "auto") {
          if (!(yield* daySlot(ACTION, id))) return "limit" as const
          slot = true
        }
        return yield* startCall(task.storeId, id)
      })
      const [brand] = yield* db.scoped((sql) =>
        sql<{ name: string }>`select name from stores where id = ${task.storeId}`
      )
      const orderFacts = row.verifiedOrderId === null
        ? null
        : yield* db.scoped((sql) => factsOf(sql, row.verifiedOrderId!, task.storeId, tz))
      return yield* think(brain, {
        text: asked,
        storeId: task.storeId,
        before: historyForModel(history, pending[0]?.id ?? task.messageId, row.verifiedOrderId !== null).slice(
          -HISTORY
        ),
        settings,
        brand: brand?.name ?? "",
        order: orderFacts === null ? null : orderStatusReply(orderFacts, false),
        ungate: freeCall(task.storeId, id),
        caller: { memberId: null, principalKind: "agent", subject: { type: "chat", id: task.threadId } },
        gate
      })
    })

    if (thought._tag === "Handover") {
      yield* release()
      if (thought.gap) {
        yield* db.scoped((sql) =>
          fileGap(sql, {
            question: redactContact(asked),
            channel: "webchat",
            customerLabel: "Websitebezoeker",
            threadId: task.threadId,
            ticketId: null,
            storeId: task.storeId,
            sourceKind: "channel_message",
            sourceId: task.messageId
          })
        )
      }
      // Zelf antwoorden tells the shopper a colleague takes it and when, asked again right before it goes; Nooit and
      // the drafts say nothing.
      if (mode === "auto" && thought.reason !== "policy" && thought.reason !== "disabled") {
        const still = yield* recheck(task, "handover")
        if (still === "taken" || still === "scope") return yield* taken(still)
        if (still === null) yield* Effect.ignore(chat.reply(task.threadId, handoverText(settings, tz, now)))
      }
      yield* chat.handOver(task.threadId, thought.reason)
      yield* db.scoped((sql) =>
        sql`update customer_agent_threads
            set handed_over_at = now(), handover_reason = ${thought.reason},
                held_at = case when ${thought.reason === "runaway"} then now() else held_at end
            where thread_id = ${task.threadId}`
      )
      yield* write({
        decision: d.decision === "refuse" ? "refuse" : "propose",
        outcome: d.decision === "refuse" ? "refused" : "proposed",
        refuseReason: d.decision === "refuse" ? d.reason ?? "policy" : thought.reason,
        ...LOG.Handover
      })
      return "handed_over" as Turn
    }

    const sentence = thought.kind === "knowledge" ? LOG.Reply.sentence : SENTENCE[thought.kind]
    if (mode !== "auto") {
      // Alleen concepten, Eerst vragen or the plan's hours: a draft on the chat for the team, nothing sent.
      yield* db.scoped((sql) =>
        Effect.gen(function*() {
          const draftId = mintId("drf")
          yield* sql`insert into drafts (id, workspace_id, subject_type, subject_id, kind, text, principal_kind,
                                         principal_id, prompt_id, prompt_version)
                     values (${draftId}, app_workspace_id(), 'chat', ${task.threadId}, 'reply', ${thought.text},
                             'agent', ${(yield* CurrentPrincipal).id}, 'customer_agent',
                             ${thought.model?.promptVersion ?? "fixed"})`
          yield* cite(sql, thought.hits, { kind: "draft", id: draftId })
        })
      )
      yield* write({
        decision: "propose",
        outcome: "proposed",
        refuseReason: holds ? "hours" : d.reason ?? "policy",
        model: thought.model,
        ...LOG.Draft
      })
      return "drafted" as Turn
    }

    // Zelf antwoorden: the day's slot (a fixed text has none yet), then everything asked again right before it goes.
    if (!slot) {
      if (!(yield* daySlot(ACTION, id))) {
        yield* chat.handOver(task.threadId, "limit")
        yield* db.scoped((sql) =>
          sql`update customer_agent_threads set handed_over_at = now(), handover_reason = 'limit'
              where thread_id = ${task.threadId}`
        )
        yield* write({ decision: "propose", outcome: "proposed", refuseReason: "limit", ...LOG.Handover })
        return "handed_over" as Turn
      }
      slot = true
    }
    const still = yield* recheck(task, "reply")
    if (still !== null) {
      yield* release()
      return yield* taken(still)
    }
    const sent = yield* Effect.result(chat.reply(task.threadId, thought.text))
    if (sent._tag === "Failure") {
      yield* release()
      return yield* taken(sent.failure._tag === "NotFound" ? "scope" : "taken")
    }
    yield* db.scoped((sql) =>
      Effect.gen(function*() {
        yield* sql`update customer_agent_threads
                   set replies = replies + 1, first_reply_at = coalesce(first_reply_at, now()), last_reply_at = now()
                   where thread_id = ${task.threadId}`
        yield* cite(sql, thought.hits, { kind: "channel_message", id: sent.success.messageId })
      })
    )
    yield* write({
      decision: "run",
      outcome: "done",
      refuseReason: null,
      model: thought.model,
      reason: thought.kind === "knowledge" ? LOG.Reply.reason : "Een websitebezoeker vroeg naar een bestelling.",
      sentence
    })
    return "answered" as Turn
  })

/**
 * Right before anything goes (as `Inbox.sendQueued` does for mail), asked again: the agent still on with Zelf
 * antwoorden, the thread not taken, closed or handed over, and the message still the shopper's newest. For a reply also
 * the master still at Zelf doen, the offline plan's hours not the team's, and within the opening hours unless the
 * settings answer outside them; for the handover's words, the master not at Nooit. `null`: it may go; else why not.
 */
const recheck = (task: ChatTask, kind: "reply" | "handover") =>
  Effect.gen(function*() {
    const db = yield* Db
    const chat = yield* ChatChannel
    const s = yield* db.scopedFor(read)
    if (!s.on || s.channels.webchat !== "auto") return "disabled"
    const d = yield* db.scoped((sql) => decideAutonomy(sql, ACTION, null))
    if (kind === "reply") {
      if (d.decision !== "run") return d.reason === "budget" ? "budget" : d.reason === "limit" ? "limit" : "policy"
      if (yield* teamHolds(ACTION)) return "hours"
      const tz = yield* db.scoped(timezoneOf)
      if (!isOpen(s.hours, tz, new Date()) && s.outside === "take") return "outside_hours"
    } else if (d.level !== "auto") return "policy"
    const t = yield* Effect.result(chat.thread(task.threadId))
    if (t._tag === "Failure") return "scope"
    if (t.success.closedAt !== null || t.success.takenOverBy !== null || t.success.handover !== null) return "taken"
    const h = yield* chat.history(task.threadId, { limit: HISTORY })
    return newestOfShopper(h)?.id === task.messageId ? null : "taken"
  })
