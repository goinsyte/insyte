import { type Flow, triggerOf } from "@insyte/domain/automations/Graph"
import type { AutomationDetail, AutomationList, AutomationRow } from "@insyte/modules/automations/domain/Automations"
import type { RunDetail, RunList, RunRow } from "@insyte/modules/automations/domain/Runs"
import { iso } from "../shared/time.ts"

/* Automations in the public shape (M12): a flow, its steps and versions, and a run with what each step did. */

const automationV1 = (a: AutomationRow) => ({
  id: a.id,
  name: a.name,
  description: a.description,
  status: a.status,
  live_version: a.liveVersion,
  trigger: triggerOf(a.nodes)?.variantId ?? null,
  unpublished_changes: a.dirty,
  owner: a.owner,
  runs_total: a.runsTotal,
  saved_at: new Date(a.savedAt).toISOString(),
  created_at: new Date(a.createdAt).toISOString()
})

const lane = (n: { readonly id: string; readonly variantId: string; readonly config: Record<string, unknown> }) => ({
  id: n.id,
  step: n.variantId,
  config: n.config
})

const stepsV1 = (nodes: Flow) =>
  nodes.map((n) => ({
    ...lane(n),
    ...(n.branches === undefined ? {} : { branches: { yes: n.branches.yes.map(lane), no: n.branches.no.map(lane) } })
  }))

/** A run in the public shape; its steps only where one run is read. */
export const runV1 = (r: RunRow, steps: RunDetail["steps"] = []) => ({
  id: r.id,
  automation_id: r.automationId,
  version: r.version,
  status: r.status,
  reason: r.reason,
  trigger: r.triggerVariant,
  manual: r.manual,
  record: r.record === null ? null : { type: r.record.kind, id: r.record.id, number: r.record.number },
  started_at: new Date(r.startedAt).toISOString(),
  finished_at: iso(r.finishedAt),
  steps: steps.map((s) => ({
    step_id: s.nodeId,
    step: s.variantId,
    lane: s.lane,
    status: s.status,
    explanation: s.explanation
  }))
})

export const automationPageV1 = (list: AutomationList) => ({ data: list.rows.map(automationV1), counts: list.counts })

export const automationDetailV1 = (d: AutomationDetail) => ({
  ...automationV1(d.automation),
  draft: stepsV1(d.automation.nodes),
  live: d.liveNodes === null ? null : stepsV1(d.liveNodes),
  versions: d.versions.map((v) => ({
    version: v.version,
    note: v.note,
    published_at: new Date(v.at).toISOString(),
    published_by: v.by
  })),
  issues: d.issues.map((i) => ({
    step_id: i.nodeId,
    code: i.code,
    field: i.field ?? null,
    severity: i.severity,
    message: i.message
  }))
})

export const runPageV1 = (list: RunList) => ({ data: list.rows.map((r) => runV1(r)), next_cursor: list.next })
