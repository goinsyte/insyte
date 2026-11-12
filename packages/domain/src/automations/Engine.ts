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
