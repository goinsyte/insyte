import { chargebacks } from "../../data-source"
import { orders } from "../../data-source"
import { products } from "../../data-source"
import { type RunStatus, type RunStep, VARIANTS_BY_ID, type WorkflowNode, type WorkflowRun } from "./node-types"
import { titleOf } from "./summary"

/**
 * A flow's runs, made up the same way every time from its own steps: the same flow lays out the same
 * ten runs on every load, each with the record that started it, the steps it walked (and the lane of a
 * splitsing it took), and for the ones that did not go through, why — in plain words, with the fix.
 */

export const hashOf = (id: string) => [...id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 1_000_003, 7)

const money = (n: number) => n.toLocaleString("nl-NL", { style: "currency", currency: "EUR" })

type Sample = NonNullable<WorkflowRun["record"]> & { input: Record<string, string>; bigOrder: boolean }

const FALLBACK: Sample = {
  kind: "order",
  id: "ord_5024",
  number: "SO-12224",
  name: "Daniel Brown",
  input: {
    Bestelling: "SO-12224",
    Klant: "Daniel Brown",
    "E-mail": "daniel.brown@example.com",
    Totaal: money(129),
    Land: "Duitsland"
  },
  bigOrder: true
}

/** The record a run of this trigger starts from. */
export function sampleFor(triggerId: string | undefined, n: number): Sample {
  if (triggerId === "trigger.chargeback" && chargebacks.length > 0) {
    const c = chargebacks[n % chargebacks.length]
    const o = orders.find((x) => x.id === c.order_id)
    return {
      kind: "chargeback",
      id: c.id,
      number: c.case_number,
      name: o?.customer_name ?? "Klant",
      input: {
        Zaak: c.case_number,
        Bestelling: o?.number ?? "—",
        Klant: o?.customer_name ?? "—",
        Bedrag: money(c.amount),
        Reden: c.reason
      },
      bigOrder: c.amount > 100
    }
  }
  if (triggerId === "trigger.inventory_low" && products.length > 0) {
    const p = products[n % products.length]
    return {
      kind: "product",
      id: p.id,
      number: p.variants[0]?.sku ?? p.id,
      name: p.title,
      input: { Product: p.title, SKU: p.variants[0]?.sku ?? "—", Voorraad: "14 stuks", Drempel: "20 stuks" },
      bigOrder: false
    }
  }
  if (orders.length === 0) return FALLBACK
  const o = orders[n % orders.length]
  return {
    kind: "order",
    id: o.id,
    number: o.number,
    name: o.customer_name,
    input: {
      Bestelling: o.number,
      Klant: o.customer_name,
      "E-mail": o.customer_email,
      Totaal: money(o.total),
      Land: o.shipping_address?.country ?? "Nederland"
    },
    bigOrder: o.total > 100
  }
}

/** Why a step stopped, and what fixes it, by the kind of step it is. */
function failureOf(node: WorkflowNode): { error: string; fix: string } {
  const v = VARIANTS_BY_ID[node.variantId]
  const id = v?.id ?? ""
  if (id.includes("klaviyo") || id === "action.send_email" || id.includes("gmail") || id.includes("outlook")) {
    return {
      error: `${
        titleOf(node)
      } is gestopt: het profiel van de klant staat op de uitschrijflijst, dus er mag geen mail heen.`,
      fix:
        "Laat de klant zich opnieuw inschrijven, of zet in de stap ‘Overslaan als uitgeschreven’ aan. De rest van de flow loopt dan door."
    }
  }
  if (id.includes("slack") || id.includes("teams")) {
    return {
      error: `${titleOf(node)} is gestopt: het kanaal ${String(node.config.channel ?? "#cx")} bestaat niet meer.`,
      fix: "Kies in de stap een kanaal dat er nog is. Opnieuw proberen stuurt het bericht één keer."
    }
  }
  if (id.includes("refund")) {
    return {
      error: `${titleOf(node)} is gestopt: de betaling is al volledig terugbetaald.`,
      fix:
        "Er hoeft niets te gebeuren; de klant heeft zijn geld. Zet een Filter op ‘nog niet terugbetaald’ voor deze stap."
    }
  }
  if (id === "action.notify_supplier") {
    return {
      error: "De leverancier heeft nog geen kanaal in Insyte, dus het bericht kon nergens heen.",
      fix: "Open een kanaal met de leverancier bij Chats, of laat deze stap de leverancier mailen."
    }
  }
  return {
    error: `${titleOf(node)} kreeg na 30 seconden geen antwoord van de koppeling.`,
    fix: "Probeer het opnieuw. De stap heeft een sleutel, dus er gebeurt niets dubbel."
  }
}

const MS = (seed: number, i: number) => 60 + ((seed * (i + 3) * 7919) % 1100)

/**
 * The steps a run walks. A splitsing takes one lane (the yes lane when the order is over €100); the
 * other lane's steps are skipped. `stopAt` ends the walk there with that status.
 */
function walk(
  nodes: ReadonlyArray<WorkflowNode>,
  seed: number,
  bigOrder: boolean,
  stopAt?: { nodeId: string; status: "error" | "waiting" },
  duplicate = false
): RunStep[] {
  const out: RunStep[] = []
  let stopped = false
  const push = (n: WorkflowNode, lane?: "yes" | "no", skip = false) => {
    const i = out.length
    const status: RunStep["status"] = stopped
      ? stopAt?.status === "waiting"
        ? "pending"
        : "skipped"
      : skip || (duplicate && i > 0)
      ? "skipped"
      : stopAt?.nodeId === n.id
      ? stopAt.status
      : "ok"
    out.push({
      nodeId: n.id,
      variantId: n.variantId,
      label: titleOf(n),
      status,
      ms: status === "ok" || status === "error" ? MS(seed, i) : 0,
      ...(lane ? { lane } : {})
    })
    if (stopAt?.nodeId === n.id && !skip) stopped = true
  }
  for (const n of nodes) {
    push(n)
    if (n.branches) {
      const taken = bigOrder ? "yes" : "no"
      for (const side of ["yes", "no"] as const) for (const m of n.branches[side]) push(m, side, side !== taken)
    }
  }
  return out
}

const waitsOn = (n: WorkflowNode) => {
  const v = VARIANTS_BY_ID[n.variantId]
  return v?.ai === true || v?.id === "action.require_approval" || v?.id === "delay.wait_no_reply"
}
const canFail = (n: WorkflowNode) => {
  const v = VARIANTS_BY_ID[n.variantId]
  return v?.kind === "action" && !v.ai
}

/** What a run's status says, in the words the Runs tab uses. */
export function runLabel(r: WorkflowRun): string {
  if (r.status === "succeeded") return "Geslaagd"
  if (r.status === "failed") return "Mislukt"
  if (r.status === "duplicate") return "Dubbel, overgeslagen"
  if (r.status === "running") return "Loopt"
  if (r.status === "stopped") return "Gestopt"
  if (r.status === "skipped") return "Overgeslagen"
  if (r.waitingOn?.kind === "approval") return "Wacht op goedkeuring"
  if (r.waitingOn?.kind === "wait") return "Wacht"
  const step = r.timeline?.find((s) => s.status === "waiting")
  return step?.variantId === "delay.wait_no_reply" ? "Wacht op antwoord" : "Wacht op voorstel"
}

export function makeRun(
  automationId: string,
  nodes: ReadonlyArray<WorkflowNode>,
  opts: {
    n: number
    at: string
    status: RunStatus
    version: number
    manual?: boolean
    record?: WorkflowRun["record"]
    key?: string
  }
): WorkflowRun {
  const seed = hashOf(`${automationId}:${opts.n}`)
  const sample = sampleFor(nodes[0]?.variantId, hashOf(automationId) + opts.n * 7)
  const flat = nodes.flatMap((x) => (x.branches ? [x, ...(sample.bigOrder ? x.branches.yes : x.branches.no)] : [x]))
  const record = opts.record ?? sample
  let status = opts.status
  let stopAt: { nodeId: string; status: "error" | "waiting" } | undefined
  let failure: { error: string; fix: string } | undefined
  if (status === "failed") {
    const n = flat.find(canFail)
    if (n) {
      stopAt = { nodeId: n.id, status: "error" }
      failure = failureOf(n)
    } else status = "succeeded"
  }
  if (status === "waiting") {
    const n = flat.find(waitsOn)
    if (n) stopAt = { nodeId: n.id, status: "waiting" }
    else status = "succeeded"
  }
  const timeline = walk(nodes, seed, sample.bigOrder, stopAt, status === "duplicate")
  const durationMs = status === "duplicate" ? 40 + (seed % 60) : timeline.reduce((t, s) => t + s.ms, 0)
  return {
    id: `run_${automationId}_${opts.n}`,
    at: opts.at,
    status,
    steps: timeline.filter((s) => s.status === "ok" || s.status === "error").length,
    durationMs,
    cause: nodes[0] ? titleOf(nodes[0]) : "De trigger",
    ...failure,
    ...(opts.manual ? { manual: true } : {}),
    record: { kind: record.kind, id: record.id, number: record.number, name: record.name },
    version: opts.version,
    key: opts.key ?? `run-${(seed % 9000) + 1000}`,
    timeline,
    input: sample.input
  }
}

/** The seeded runs: the last `count`, ending at the last run and spaced by how often the flow fires. */
export function seedRuns(
  automationId: string,
  nodes: ReadonlyArray<WorkflowNode>,
  o: {
    last: string
    perMonth: number
    count: number
    version: number
    pattern: { failed?: number; waiting?: number; duplicate?: number }
  }
): WorkflowRun[] {
  const last = Date.parse(o.last)
  const gap = Math.max(20, Math.round((30 * 24 * 60) / Math.max(1, o.perMonth))) * 60_000
  const runs: WorkflowRun[] = []
  for (let i = 0; i < o.count; i++) {
    const status: RunStatus = i === o.pattern.waiting
      ? "waiting"
      : i === o.pattern.failed
      ? "failed"
      : i === o.pattern.duplicate
      ? "duplicate"
      : "succeeded"
    const at = new Date(last - i * gap - (hashOf(`${automationId}${i}`) % 40) * 60_000).toISOString()
    // A version is live from when it was published, so the older runs ran on older versions.
    const version = Math.max(1, o.version - Math.floor(i / 4))
    runs.push(makeRun(automationId, nodes, { n: i, at, status, version }))
  }
  // A duplicate is a second event for a record that already ran: it carries that run's record and key.
  const dup = runs.findIndex((r) => r.status === "duplicate")
  const prev = runs[dup + 1]
  if (dup >= 0 && prev) runs[dup] = { ...runs[dup], record: prev.record, key: prev.key, input: prev.input }
  return runs
}
