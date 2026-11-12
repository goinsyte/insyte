import type { AutomationDetail, AutomationRow } from "@insyte/modules/automations/domain/Automations"
import type { RunDetail, RunRow } from "@insyte/modules/automations/domain/Runs"
import type { WorkflowNode, WorkflowRun, WorkflowState } from "@insyte/ui/app/automations/node-types"
import type { StepIssue } from "@insyte/ui/app/automations/source"
import { titleOf } from "@insyte/ui/app/automations/summary"
import { TEMPLATES } from "@insyte/ui/app/lib/automation-templates"

/*
 * The server's flows in the screens' shapes (`node-types.ts`): a row for the list, a detail for the builder, and their
 * runs (`Runs.list`, `Runs.get`); the source lays a flow's runs into its history. `notify` is a member id, as the
 * source's `people` offer them; the owner when none is chosen. `.tsx` because the ui types reach `data-source`.
 */

const iso = (ms: number) => new Date(ms).toISOString()

/** The server's steps are readonly; the canvas edits copies. */
const nodesOf = (nodes: AutomationRow["nodes"]): Array<WorkflowNode> =>
  nodes.map((n) => ({
    id: n.id,
    variantId: n.variantId,
    config: { ...n.config },
    ...(n.branches === undefined
      ? {}
      : {
        branches: {
          yes: n.branches.yes.map((l) => ({ id: l.id, variantId: l.variantId, config: { ...l.config } })),
          no: n.branches.no.map((l) => ({ id: l.id, variantId: l.variantId, config: { ...l.config } }))
        }
      })
  }))

export const workflowOfRow = (a: AutomationRow): WorkflowState => ({
  automationId: a.id,
  name: a.name,
  description: a.description,
  status: a.status,
  nodes: nodesOf(a.nodes),
  savedAt: iso(a.savedAt),
  createdAt: iso(a.createdAt),
  owner: a.owner?.name ?? "",
  version: a.liveVersion,
  versions: [],
  settings: { scopesOff: [], scopesExtra: [], notify: a.owner?.id ?? "", rateLimit: 0 },
  runs: a.runsTotal,
  history: []
})

export const workflowOfDetail = (d: AutomationDetail): WorkflowState => ({
  ...workflowOfRow(d.automation),
  versions: d.versions.map((v) => ({
    v: v.version,
    at: iso(v.at),
    by: v.by?.name ?? "Insyte",
    note: v.note,
    nodes: nodesOf(v.nodes)
  })),
  settings: {
    scopesOff: [...d.settings.scopesOff],
    scopesExtra: [...d.settings.scopesExtra],
    notify: d.settings.notify?.id ?? d.automation.owner?.id ?? "",
    rateLimit: d.settings.rateLimit
  }
})

/** The flow as it was last published, for "Wijzigingen terugdraaien" and the version note. */
export const publishedOf = (d: AutomationDetail, working: WorkflowState): WorkflowState | undefined =>
  d.liveNodes === null ? undefined : { ...working, nodes: nodesOf(d.liveNodes) }

export const issuesByNode = (
  issues: ReadonlyArray<{ readonly nodeId: string | null } & StepIssue>
): ReadonlyMap<string, ReadonlyArray<StepIssue>> => {
  const out = new Map<string, Array<StepIssue>>()
  for (const { nodeId, ...issue } of issues) {
    if (nodeId === null) continue
    out.set(nodeId, [...(out.get(nodeId) ?? []), issue])
  }
  return out
}

export const templateOf = (id: string) => TEMPLATES.find((t) => t.id === id)

/** A run as the list holds it: its steps and what went in come with `Runs.get`. */
export const runOfRow = (r: RunRow): WorkflowRun => ({
  id: r.id,
  at: iso(r.startedAt),
  status: r.status,
  steps: r.steps,
  durationMs: r.durationMs,
  cause: r.cause,
  ...(r.status === "failed" && r.reason !== null ? { error: r.reason } : {}),
  ...((r.status === "stopped" || r.status === "skipped") && r.reason !== null ? { reason: r.reason } : {}),
  ...(r.manual ? { manual: true } : {}),
  ...(r.record === null ? {} : { record: { ...r.record } }),
  version: r.version,
  key: r.key,
  ...(r.waiting === null ? {} : { waitingOn: { kind: r.waiting } })
})

export const runOfDetail = (d: RunDetail): WorkflowRun => ({
  ...runOfRow(d.run),
  timeline: d.steps.map((s) => ({
    nodeId: s.nodeId,
    variantId: s.variantId,
    label: titleOf({ id: s.nodeId, variantId: s.variantId, config: { ...s.config } }),
    status: s.status,
    ms: s.ms,
    ...(s.lane === null ? {} : { lane: s.lane })
  })),
  input: { ...d.input },
  ...(d.waitingOn === null
    ? {}
    : { waitingOn: { kind: d.waitingOn.kind, ...(d.waitingOn.approver ? { approver: d.waitingOn.approver } : {}) } })
})
