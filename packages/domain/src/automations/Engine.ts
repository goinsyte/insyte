import { referencesIn } from "./Fields.ts"
import { SCOPE_GRANTS } from "./Scopes.ts"
import { STEPS_BY_ID } from "./Steps.ts"

/*
 * The engine's pure half (M12 step 3): which outbox event starts which trigger, what a run's record says as
 * `{{field}}` values, how a Filter or a Ja/nee-splitsing reads its expression, which steps run today and what the flow's
 * service account may do (M12 step 2). The executor in the Workflow and the tests read the same functions.
 */

/** A run's record as its steps read it: `order.number`, `customer.email`, … as text. */
export type RunContext = Readonly<Record<string, string>>

/** What a run is about, as `automation_runs.record_kind` says: an order, a chargeback, a variant or a mail thread. */
export type RunRecordKind = "order" | "chargeback" | "product" | "thread"

/** The triggers an outbox event starts, and the records each run is about. */
export interface Started {
  readonly trigger: string
  readonly recordKind: RunRecordKind
  readonly recordIds: ReadonlyArray<string>
  readonly summary: string
  /** "Lage voorraad": each variant's stock before and after, so each flow checks its own threshold (`crosses`). */
  readonly levels?: Readonly<Record<string, { readonly before: number; readonly after: number }>>
  /**
   * The trigger happens once to its record (an order placed, an order sent, a chargeback opened): a flow runs once per
   * record on it, however many events say so (a sync and a webhook, Insyte's fulfilment and Shopify's).
   */
  readonly once?: boolean
}

const ids = (event: Record<string, unknown>, key: string): ReadonlyArray<string> =>
  Array.isArray(event[key]) ? (event[key] as ReadonlyArray<string>) : []

const order = (trigger: string, recordIds: ReadonlyArray<string>, summary: string, once = false): Started => ({
  trigger,
  recordKind: "order",
  recordIds,
  summary,
  ...(once ? { once } : {})
})

/**
 * What starts a trigger (M12 step 3; widgets/05 §1.1). An event a flow's own service account caused starts nothing
 * (its `userId` is the account's `sa_…` id): a refund a flow made does not start "Terugbetaling aangevraagd" again, so
 * no flow sets off another, or itself, in a loop.
 */
export const startedBy = (event: { readonly type: string } & Record<string, unknown>): ReadonlyArray<Started> => {
  if (typeof event["userId"] === "string" && event["userId"].startsWith("sa_")) return []
  switch (event.type) {
    case "order.delayed":
      return [order("trigger.shipping_delay", ids(event, "orderIds"), "vertraagd")]
    case "refund.requested":
      return [order("trigger.refund_requested", ids(event, "orderIds"), "terugbetaling aangevraagd")]
    case "order.updated":
      // Fulfilled in Insyte: the order is on its way.
      return event["change"] === "fulfil"
        ? [order("trigger.order_shipped", ids(event, "orderIds"), "verzonden", true)]
        : []
    case "order.fulfilled":
      // Fulfilled in Shopify, or by an app there.
      return [order("trigger.order_shipped", ids(event, "orderIds"), "verzonden", true)]
    case "order.placed":
      return [order("trigger.order_placed", ids(event, "orderIds"), "geplaatst", true)]
    case "chargeback.opened":
      return typeof event["chargebackId"] === "string"
        ? [{
          trigger: "trigger.chargeback",
          recordKind: "chargeback",
          recordIds: [event["chargebackId"]],
          summary: "chargeback geopend",
          once: true
        }]
        : []
    case "thread.received": {
      const threadId = typeof event["threadId"] === "string" ? [event["threadId"]] : []
      const mail: Started = {
        trigger: "trigger.email_received",
        recordKind: "thread",
        recordIds: threadId,
        summary: "e-mail ontvangen"
      }
      return event["reply"] === true
        ? [mail, { ...mail, trigger: "trigger.customer_reply", summary: "antwoord van de klant" }]
        : [mail]
    }
    case "inventory.dropped": {
      const levels = Array.isArray(event["levels"])
        ? (event["levels"] as ReadonlyArray<{ variantId: string; before: number; after: number }>)
        : []
      return [{
        trigger: "trigger.inventory_low",
        recordKind: "product",
        recordIds: levels.map((l) => l.variantId),
        summary: "voorraad laag",
        levels: Object.fromEntries(levels.map((l) => [l.variantId, { before: l.before, after: l.after }]))
      }]
    }
    default:
      return []
  }
}

const TRIGGERS = [
  "order.delayed",
  "refund.requested",
  "order.updated",
  "order.fulfilled",
  "order.placed",
  "chargeback.opened",
  "thread.received",
  "inventory.dropped"
] as const

/** The event types `startedBy` reads, so the relay asks only for those. */
export const TRIGGER_EVENTS: ReadonlySet<typeof TRIGGERS[number]> = new Set(TRIGGERS)

/** "Lage voorraad"'s threshold when the flow names none. */
export const DEFAULT_THRESHOLD = 10

/** Whether a stock change passes the flow's threshold: it was above, and is at or under it now. */
export const crosses = (
  config: Readonly<Record<string, unknown>>,
  level: { readonly before: number; readonly after: number }
): boolean => {
  const n = Number(config["threshold"])
  const threshold = Number.isFinite(n) && n >= 0 ? n : DEFAULT_THRESHOLD
  return level.before > threshold && level.after <= threshold
}

/** "E-mail ontvangen" with "bevat": the subject or the message holds the text, case aside; without one, every mail. */
export const mailMatches = (
  config: Readonly<Record<string, unknown>>,
  mail: { readonly subject: string; readonly body: string }
) => {
  const want = String(config["contains"] ?? "").trim().toLowerCase()
  return want === "" || `${mail.subject}\n${mail.body}`.toLowerCase().includes(want)
}

/* ── "Op een vast moment" (M12 step 3) ─────────────────────────────────────────────────────── */

export interface Schedule {
  readonly every: "day" | "week" | "month"
  readonly hour: number
  readonly records: "orders_open" | "customers_idle"
  readonly days: number
}

/** A schedule trigger's settings, each to its default when missing or out of range. */
export const scheduleOf = (config: Readonly<Record<string, unknown>>): Schedule => {
  const int = (key: string, fallback: number, max: number) => {
    const n = Number(config[key])
    return Number.isInteger(n) && n >= 0 && n <= max ? n : fallback
  }
  const every = config["every"] === "week" || config["every"] === "month" ? config["every"] : "day"
  return {
    every,
    hour: int("hour", 9, 23),
    records: config["records"] === "customers_idle" ? "customers_idle" : "orders_open",
    days: Math.max(1, int("days", 5, 365))
  }
}

/** Whether the schedule is due at this local hour: its hour, on its day (Monday, or the 1st). */
export const scheduleDue = (
  s: Schedule,
  local: { readonly hour: number; readonly weekday: number; readonly day: number }
): boolean =>
  local.hour === s.hour && (s.every === "day" || (s.every === "week" ? local.weekday === 1 : local.day === 1))

/** How far back a tick looks for records that came due: its own period and a day, so a missed tick is made good. */
export const lookbackDays = (s: Schedule): number => (s.every === "day" ? 2 : s.every === "week" ? 8 : 32)

/** `{{order.number}}` and friends filled in; a field the record does not have becomes empty. */
export const fill = (text: string, context: RunContext): string =>
  text.replace(/\{\{\s*([a-z_]+(?:\.[a-z_]+)*)\s*\}\}/g, (_, path: string) => context[path] ?? "")

/** Every `{{field}}` the config of a step reads that the record does not have. */
export const missingIn = (config: Readonly<Record<string, unknown>>, context: RunContext): ReadonlyArray<string> =>
  Object.values(config)
    .flatMap((v) => (typeof v === "string" ? referencesIn(v) : []))
    .filter((path) => context[path] === undefined)

/** "129,95" and "€ 1.240,00" as numbers; `undefined` when it is not one. */
const numberOf = (text: string): number | undefined => {
  const cleaned = text.replace(/[€\s]/g, "")
  if (cleaned === "") return undefined
  const normal = /,\d{1,2}$/.test(cleaned) ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/,/g, "")
  const n = Number(normal)
  return Number.isFinite(n) ? n : undefined
}

const OPERATORS = [">=", "<=", "!=", "==", ">", "<", "=", "bevat", "contains"] as const

/**
 * A Filter's or a splitsing's `{{order.total}} > 100`, read against the record: numbers compare as numbers, the rest as
 * text, case aside. Without an operator, a filled-in value that is not empty, "0" or "false" counts as true.
 */
export const holds = (expression: string, context: RunContext): boolean => {
  const filled = fill(expression, context).trim()
  for (const op of OPERATORS) {
    const at = op === "bevat" || op === "contains"
      ? filled.toLowerCase().indexOf(` ${op} `)
      : filled.indexOf(op)
    if (at < 0) continue
    const left = filled.slice(0, at).trim().replace(/^["']|["']$/g, "")
    const right = filled.slice(at + (op === "bevat" || op === "contains" ? op.length + 2 : op.length)).trim()
      .replace(/^["']|["']$/g, "")
    const [a, b] = [numberOf(left), numberOf(right)]
    const numeric = a !== undefined && b !== undefined
    switch (op) {
      case ">":
        return numeric && a > b
      case "<":
        return numeric && a < b
      case ">=":
        return numeric && a >= b
      case "<=":
        return numeric && a <= b
      case "!=":
        return numeric ? a !== b : left.toLowerCase() !== right.toLowerCase()
      case "==":
      case "=":
        return numeric ? a === b : left.toLowerCase() === right.toLowerCase()
      case "bevat":
      case "contains":
        return left.toLowerCase().includes(right.toLowerCase())
    }
  }
  return filled !== "" && filled !== "0" && filled.toLowerCase() !== "false"
}

/** How the engine meets a step: decided in a step, waited out, carried out through a slice, or not yet. */
export type Handling =
  | "trigger"
  | "condition"
  | "branch"
  | "wait"
  | "wait_no_reply"
  | "approval"
  | "action"
  | "unsupported"

/** The actions that run today, through their slices; the rest of the catalogue says why it cannot yet. */
export const RUNNABLE: ReadonlySet<string> = new Set([
  "action.create_ticket",
  "action.tag_customer",
  "action.alert_team",
  "action.track_event",
  "action.notify_supplier",
  "action.refund",
  "action.assign_supplier",
  "action.update_tracking",
  "action.check_eta",
  "action.ai_compose",
  "action.ai_classify",
  "action.ai_summarize"
])

export const handlingOf = (variantId: string): Handling => {
  const step = STEPS_BY_ID[variantId]
  if (step === undefined) return "unsupported"
  if (step.kind === "trigger") return "trigger"
  if (step.kind === "condition") return "condition"
  if (step.kind === "branch") return "branch"
  if (variantId === "delay.wait") return "wait"
  if (variantId === "delay.wait_no_reply") return "wait_no_reply"
  if (variantId === "action.require_approval") return "approval"
  return RUNNABLE.has(variantId) ? "action" : "unsupported"
}

/* ── the flow's service account (M12 step 2) ───────────────────────────────────────────────── */

/** The levels and specials those rights add up to; every area starts at 0 and reads its records at 1 at most. */
export const grantsOf = (scopes: ReadonlyArray<string>) => {
  const levels: Record<string, number> = {}
  const specials: Record<string, boolean> = {}
  for (const scope of scopes) {
    for (const g of SCOPE_GRANTS[scope] ?? []) {
      levels[g.area] = Math.max(levels[g.area] ?? 0, g.level)
      if (g.special !== undefined) specials[g.special] = true
    }
  }
  return { levels, specials }
}

/* ── a run's steps as the Runs drawer shows them (M12 step 5) ──────────────────────────────── */

/** What the engine wrote for one step (its latest attempt). */
export interface StepRow {
  readonly nodeId: string
  readonly status: "succeeded" | "failed" | "skipped" | "waiting" | "stopped"
  readonly attempt: number
  readonly ms: number
  readonly explanation: string | null
  /** A splitsing's lane, as its step decided it. */
  readonly lane?: "yes" | "no" | undefined
}

export interface TimelineStep {
  readonly nodeId: string
  readonly variantId: string
  readonly config: Readonly<Record<string, unknown>>
  readonly lane: "yes" | "no" | null
  readonly status: "ok" | "error" | "skipped" | "waiting" | "pending" | "stopped"
  readonly ms: number
  readonly attempt: number
  readonly explanation: string | null
}

const SHOWN = { succeeded: "ok", failed: "error", skipped: "skipped", waiting: "waiting", stopped: "stopped" } as const

type Shape = {
  readonly id: string
  readonly variantId: string
  readonly config: Readonly<Record<string, unknown>>
  readonly branches?: { readonly yes: ReadonlyArray<Shape>; readonly no: ReadonlyArray<Shape> } | undefined
}

/**
 * The run's version laid out step by step with what each did: a lane a splitsing did not take is skipped, a step a
 * waiting run has not reached is `pending`, and one a finished run never reached is skipped.
 */
export const timelineOf = (
  nodes: ReadonlyArray<Shape>,
  rows: ReadonlyArray<StepRow>,
  open: boolean
): ReadonlyArray<TimelineStep> => {
  const latest = new Map<string, StepRow>()
  for (const r of rows) {
    const was = latest.get(r.nodeId)
    if (was === undefined || r.attempt >= was.attempt) latest.set(r.nodeId, r)
  }
  const one = (n: Shape, lane: "yes" | "no" | null, taken: boolean): TimelineStep => {
    const row = latest.get(n.id)
    return {
      nodeId: n.id,
      variantId: n.variantId,
      config: n.config,
      lane,
      status: row !== undefined ? SHOWN[row.status] : !taken ? "skipped" : open ? "pending" : "skipped",
      ms: row?.ms ?? 0,
      attempt: row?.attempt ?? 1,
      explanation: row?.explanation ?? null
    }
  }
  return nodes.flatMap((n) => {
    const head = one(n, null, true)
    if (n.branches === undefined) return [head]
    const decided = latest.get(n.id)?.lane
    const lanes = (["yes", "no"] as const).flatMap((side) =>
      n.branches![side].map((m) => one(m, side, decided === undefined || decided === side))
    )
    return [head, ...lanes]
  })
}
