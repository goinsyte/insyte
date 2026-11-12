import { referencesIn } from "./Fields.ts"
import { SCOPE_IDS } from "./Scopes.ts"
import { STEPS_BY_ID } from "./Steps.ts"

/*
 * The engine's pure half (M12 step 3): which outbox event starts which trigger, what a run's record says as
 * `{{field}}` values, how a Filter or a Ja/nee-splitsing reads its expression, which steps run today and what the flow's
 * service account may do (M12 step 2). The executor in the Workflow and the tests read the same functions.
 */

/** A run's record as its steps read it: `order.number`, `customer.email`, … as text. */
export type RunContext = Readonly<Record<string, string>>

/** The triggers an outbox event starts, and the records each run is about. */
export interface Started {
  readonly trigger: string
  readonly recordKind: "order"
  readonly recordIds: ReadonlyArray<string>
  readonly summary: string
}

/** What starts a trigger today. The rest wait for their source: Shopify's own events (M6), mail (M11), M13's disputes. */
export const startedBy = (event: { readonly type: string } & Record<string, unknown>): Started | undefined => {
  const orderIds = Array.isArray(event["orderIds"]) ? (event["orderIds"] as ReadonlyArray<string>) : []
  switch (event.type) {
    case "order.delayed":
      return { trigger: "trigger.shipping_delay", recordKind: "order", recordIds: orderIds, summary: "vertraagd" }
    case "refund.requested":
      return {
        trigger: "trigger.refund_requested",
        recordKind: "order",
        recordIds: orderIds,
        summary: "terugbetaling aangevraagd"
      }
    case "order.updated":
      // Fulfilled in Insyte: the order is on its way.
      return event["change"] === "fulfil"
        ? { trigger: "trigger.order_shipped", recordKind: "order", recordIds: orderIds, summary: "verzonden" }
        : undefined
    default:
      return undefined
  }
}

/** The event types `startedBy` reads, so the relay asks only for those. */
export const TRIGGER_EVENTS: ReadonlySet<string> = new Set(["order.delayed", "refund.requested", "order.updated"])

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
  "action.track_event"
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

type Grant = { readonly area: string; readonly level: 1 | 2 | 3; readonly special?: string }

/**
 * What each of a flow's rights lets its service account do, in the permission catalogue's terms (one vocabulary with
 * the API keys): an area at a level, and for money and disputes the special that guards them.
 */
export const SCOPE_GRANTS: Readonly<Record<string, ReadonlyArray<Grant>>> = {
  "orders.read": [{ area: "orders", level: 1 }],
  "orders.write": [{ area: "orders", level: 2 }],
  "customers.read": [{ area: "customers", level: 1 }],
  "customers.write": [{ area: "customers", level: 2 }],
  "customers.email": [{ area: "customers", level: 1 }, { area: "support", level: 2 }],
  "tickets.write": [{ area: "support", level: 2 }],
  "team.notify": [{ area: "team", level: 1 }],
  "suppliers.message": [{ area: "suppliers", level: 2 }],
  "refunds.write": [{ area: "orders", level: 2, special: "refunds.write" }],
  "payments.read": [{ area: "orders", level: 1 }],
  "disputes.write": [{ area: "chargebacks", level: 2, special: "disputes.write" }],
  "stock.read": [{ area: "products", level: 1 }],
  "marketing.write": [{ area: "customers", level: 2 }],
  "accounting.write": [{ area: "data", level: 2 }],
  "files.write": [{ area: "data", level: 2 }],
  "ai.draft": [{ area: "support", level: 1 }]
}

/** The rights an account holds: what the version needs, less what was switched off, plus what was added. */
export const accountScopes = (
  required: ReadonlyArray<string>,
  settings: { readonly scopesOff: ReadonlyArray<string>; readonly scopesExtra: ReadonlyArray<string> }
): ReadonlyArray<string> => {
  const held = new Set([...required.filter((s) => !settings.scopesOff.includes(s)), ...settings.scopesExtra])
  return SCOPE_IDS.filter((s) => held.has(s))
}

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
