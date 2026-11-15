import type { AgentActionId } from "@insyte/domain/AgentActions"
import { Schema } from "effect"
import type { Hours, OfflinePlan } from "../../first-analysis/domain/FirstAnalysis.ts"
import { topicOf } from "../../tickets/domain/Rules.ts"

/*
 * What starts the agent by itself (M15 step 6, ADR-0027 "started by an event"): the outbox sink `agent` hears a mail
 * come in or an order delayed and puts a task on the events queue, so the model never holds the event's transaction;
 * the consumer acts on it as the workspace's own agent, within the autonomy rules. Pure, so the rules are tested
 * without a database.
 */

/** A task on the events queue (`transports/jobs/Queue.ts`): the trigger, by the outbox event that carried it. */
export const AgentTask = Schema.Struct({
  workspaceId: Schema.String,
  /** The outbox event: a second delivery of it, or of this task, is the same trigger and acts once. */
  eventId: Schema.String,
  trigger: Schema.Union([
    Schema.Struct({
      kind: Schema.Literal("thread.received"),
      threadId: Schema.String,
      messageId: Schema.String,
      reply: Schema.Boolean
    }),
    Schema.Struct({ kind: Schema.Literal("order.delayed"), orderIds: Schema.Array(Schema.String) })
  ])
})
export type AgentTask = typeof AgentTask.Type

/** How much of a mail the rules read: the question is near the top. */
export const QUESTION_CHARS = 2000

/** Senders that are a system, never a customer: the agent answers none of them. */
export const SYSTEM_SENDER = /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounces?)([+.-].*)?@/i

/**
 * Whether a mail asks where an order is ("waar is mijn bestelling?"), by the tickets' topic rules. A reply is read by
 * its own words only: its subject is the thread's, and a "bedankt" under "Re: Waar is mijn pakket" asks nothing.
 */
export const asksWhereOrderIs = (mail: { readonly subject: string; readonly text: string; readonly reply: boolean }) =>
  topicOf(mail.reply ? "" : mail.subject, mail.text.slice(0, QUESTION_CHARS)) === "where_is_my_order"

/**
 * Words a reply that goes without a person may never say (ADR-0027: the agent never refunds, cancels or promises
 * money). A draft that says one waits for the team instead.
 */
const MONEY = /terugbetal|terug\s?betal|geld terug|refund|korting|vergoed|compensatie|tegoed|gratis|kosteloos/i

export const promisesMoney = (text: string) => MONEY.test(text)

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

/** Whether `at` falls in the opening hours (Monday first, `HH:MM` in the workspace's time zone). */
export const isOpenAt = (hours: ReadonlyArray<Hours>, timeZone: string, at: Date): boolean => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(at).map((p) => [p.type, p.value])
  )
  const day = hours[DAYS.indexOf(parts["weekday"] ?? "")]
  if (day === undefined || !day.open) return false
  const now = `${parts["hour"]}:${parts["minute"]}`
  return now >= day.from && now < day.to
}

/**
 * Whether the offline plan keeps this action for the team right now: the plan gave it Zelf doen for while nobody is
 * online, nobody changed it on Zelfstandigheid since (`changedAt`, the last policy version that touched it), and the
 * team is online now. A level set on Zelfstandigheid after the plan holds at any hour, as does every action the plan
 * does not name.
 */
export const heldForTeam = (
  plan: OfflinePlan | null,
  action: AgentActionId,
  changedAt: number | null,
  timeZone: string,
  at: Date
): boolean => {
  if (plan === null || plan.levels[action] !== "auto") return false
  if (plan.version !== null && changedAt !== null && changedAt > plan.version) return false
  return isOpenAt(plan.hours, timeZone, at)
}
