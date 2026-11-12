import { useSyncExternalStore } from "react"
import { flatNodes, newNodeId, VARIANTS_BY_ID, type WorkflowNode } from "./node-types"

/*
 * The canvas's edits as pure functions over a flow's steps: where a step goes (the main line, or one lane of a
 * splitsing), adding, moving and taking one out, and a copy with fresh ids. The design's store and the console's
 * working copy both edit with these, so the builder behaves the same over either.
 */

export const node = (
  variantId: string,
  config: Record<string, unknown> = {},
  branches?: WorkflowNode["branches"]
): WorkflowNode => ({
  id: newNodeId(),
  variantId,
  config: { ...(VARIANTS_BY_ID[variantId]?.defaultConfig ?? {}), ...config },
  ...(branches ? { branches } : {})
})

export const cloneNodes = (nodes: ReadonlyArray<WorkflowNode>): WorkflowNode[] =>
  nodes.map((n) => ({
    ...n,
    id: newNodeId(),
    config: { ...n.config },
    ...(n.branches ? { branches: { yes: cloneNodes(n.branches.yes), no: cloneNodes(n.branches.no) } } : {})
  }))

/* ── where a step goes: the main line, or one lane of a splitsing ────────────────────────────────── */

export type Lane = { branchId: string; side: "yes" | "no" }
export type Place = { lane?: Lane; index: number }

export const isTrigger = (n?: WorkflowNode) => (n ? VARIANTS_BY_ID[n.variantId]?.kind === "trigger" : false)

function withList(
  nodes: WorkflowNode[],
  lane: Lane | undefined,
  f: (list: WorkflowNode[]) => WorkflowNode[]
): WorkflowNode[] {
  if (!lane) return f(nodes)
  return nodes.map((
    n
  ) => (n.id === lane.branchId && n.branches
    ? { ...n, branches: { ...n.branches, [lane.side]: f(n.branches[lane.side]) } }
    : n)
  )
}

export function without(nodes: WorkflowNode[], nodeId: string): [WorkflowNode[], WorkflowNode | null] {
  let found: WorkflowNode | null = null
  const out = nodes
    .filter((n) => {
      if (n.id === nodeId) {
        found = n
        return false
      }
      return true
    })
    .map((n) => {
      if (!n.branches || found) return n
      const [yes, a] = without(n.branches.yes, nodeId)
      const [no, b] = without(n.branches.no, nodeId)
      found = a ?? b
      return found ? { ...n, branches: { yes, no } } : n
    })
  return [out, found]
}

/** Where a node sits now. */
export function placeOf(nodes: ReadonlyArray<WorkflowNode>, nodeId: string): Place | null {
  const i = nodes.findIndex((n) => n.id === nodeId)
  if (i >= 0) return { index: i }
  for (const n of nodes) {
    if (!n.branches) continue
    for (const side of ["yes", "no"] as const) {
      const j = n.branches[side].findIndex((m) => m.id === nodeId)
      if (j >= 0) return { lane: { branchId: n.id, side }, index: j }
    }
  }
  return null
}

export function insertInto(nodes: WorkflowNode[], n: WorkflowNode, place: Place): WorkflowNode[] {
  return withList(nodes, place.lane, (list) => {
    const min = !place.lane && isTrigger(list[0]) ? 1 : 0
    const at = Math.max(min, Math.min(place.index, list.length))
    const next = [...list]
    next.splice(at, 0, n)
    return next
  })
}

/* ── the builder's edits, as the design's store makes them (`workflow-store.ts`), over a list ─────── */

/** A step added at a place; a trigger always replaces the one at the head. */
export function insertStep(
  nodes: WorkflowNode[],
  variantId: string,
  place: Place
): { nodes: WorkflowNode[]; node: WorkflowNode } | null {
  const variant = VARIANTS_BY_ID[variantId]
  if (!variant) return null
  if (variant.kind === "trigger") {
    const n = node(variantId)
    return { nodes: isTrigger(nodes[0]) ? [n, ...nodes.slice(1)] : [n, ...nodes], node: n }
  }
  if (variant.kind === "branch" && place.lane) return null
  const n = node(variantId, {}, variant.kind === "branch" ? { yes: [], no: [] } : undefined)
  return { nodes: insertInto(nodes, n, place), node: n }
}

/** A step moved to another place, in its own lane or another; `null` where it cannot go there. */
export function moveStep(nodes: WorkflowNode[], nodeId: string, place: Place): WorkflowNode[] | null {
  const from = placeOf(nodes, nodeId)
  const [rest, moving] = without(nodes, nodeId)
  if (!moving || !from || isTrigger(moving)) return null
  if (moving.branches && place.lane) return null
  const sameList = (from.lane?.branchId ?? "") === (place.lane?.branchId ?? "") && from.lane?.side === place.lane?.side
  const index = sameList && from.index < place.index ? place.index - 1 : place.index
  return insertInto(rest, moving, { ...place, index })
}

/** A step taken out, with where it stood so Undo can put it back; the trigger stays. */
export function removeStep(
  nodes: WorkflowNode[],
  nodeId: string
): { nodes: WorkflowNode[]; gone: WorkflowNode; at: Place } | null {
  const at = placeOf(nodes, nodeId)
  const [rest, gone] = without(nodes, nodeId)
  if (!gone || !at || isTrigger(gone)) return null
  return { nodes: rest, gone, at }
}

/** One step's settings changed, wherever it stands. */
export function configure(nodes: WorkflowNode[], nodeId: string, patch: Record<string, unknown>): WorkflowNode[] {
  return nodes.map((n) =>
    n.id === nodeId
      ? { ...n, config: { ...n.config, ...patch } }
      : n.branches
      ? {
        ...n,
        branches: { yes: configure(n.branches.yes, nodeId, patch), no: configure(n.branches.no, nodeId, patch) }
      }
      : n
  )
}

/* ── a flow's name, read off its steps ─────────────────────────────────────────────────────────── */

export const UNTITLED = "Naamloze automatisering"

/** A name read off the steps: "Bestelling vertraagd → E-mail versturen + Ticket aanmaken". */
export function nameFromNodes(nodes: WorkflowNode[]) {
  const [trigger, ...rest] = nodes
  if (!trigger) return UNTITLED
  const actions = flatNodes(rest)
    .map((n) => VARIANTS_BY_ID[n.variantId])
    .filter((v) => v?.kind === "action")
    .slice(0, 2)
    .map((v) => v.label)
  const head = VARIANTS_BY_ID[trigger.variantId]?.label ?? "Flow"
  return actions.length ? `${head} → ${actions.join(" + ")}` : head
}

/* ── the step a test is on, which the canvas lights ────────────────────────────────────────────── */

export type TestResult =
  | { ok: true; sample: { number: string; name: string }; steps: number }
  | { ok: false; sample: { number: string; name: string }; nodeId: string; step: string; reason: string }

type ActiveRun = { automationId: string; nodeId: string | null; failedId?: string }
let activeRun: ActiveRun | null = null
const runListeners = new Set<() => void>()

export const runStore = {
  get: () => activeRun,
  set(next: ActiveRun | null) {
    activeRun = next
    for (const l of runListeners) l()
  },
  subscribe(l: () => void) {
    runListeners.add(l)
    return () => runListeners.delete(l)
  }
}

export function useActiveRun() {
  return useSyncExternalStore(runStore.subscribe, runStore.get, runStore.get)
}
