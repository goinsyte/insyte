import { Schema } from "effect"
import { fieldsOf, referencesIn } from "./Fields.ts"
import { SCOPE_LABEL } from "./Scopes.ts"
import { BRAND_NAME, fieldSchemaOf, type Step, STEPS_BY_ID } from "./Steps.ts"

/*
 * A flow's steps, as the canvas draws them and `automations.draft_nodes` / `automation_versions.nodes` hold them: one
 * line from the trigger down, where a Ja/nee-splitsing carries two lanes that merge back into the line after it. Lanes
 * do not nest (domain.md §11), so the schema has two levels and no more. `validate` is what save shows per step and what
 * publish refuses on: one pure function, the same in the browser and on the server.
 */

const NodeId = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64))
const VariantId = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64))
const Config = Schema.Record(Schema.String, Schema.Unknown)

/** A step in a lane of a splitsing. */
export const LaneNode = Schema.Struct({ id: NodeId, variantId: VariantId, config: Config })
export type LaneNode = typeof LaneNode.Type

/** A step on the main line. */
export const FlowNode = Schema.Struct({
  id: NodeId,
  variantId: VariantId,
  config: Config,
  branches: Schema.optional(Schema.Struct({ yes: Schema.Array(LaneNode), no: Schema.Array(LaneNode) }))
})
export type FlowNode = typeof FlowNode.Type

/** Most steps a flow may have, lanes included: a canvas, not a program. */
export const MAX_STEPS = 100

export const Flow = Schema.Array(FlowNode)
export type Flow = ReadonlyArray<FlowNode>

/** Every step of a flow, the lanes of a splitsing included, in the order a run meets them. */
export const flat = (nodes: Flow): ReadonlyArray<FlowNode | LaneNode> =>
  nodes.flatMap((n) => (n.branches === undefined ? [n] : [n, ...n.branches.yes, ...n.branches.no]))

/** The flow's trigger: the step at its head, if that is one. */
export const triggerOf = (nodes: Flow): FlowNode | undefined => {
  const head = nodes[0]
  return head !== undefined && STEPS_BY_ID[head.variantId]?.kind === "trigger" ? head : undefined
}

/** The rights the flow's steps need, once each, in catalogue order. */
export const scopesRequired = (nodes: Flow): ReadonlyArray<string> => {
  const needed = new Set(flat(nodes).flatMap((n) => STEPS_BY_ID[n.variantId]?.scope ?? []))
  return Object.keys(SCOPE_LABEL).filter((s) => needed.has(s))
}

/** The connected services the flow's steps run on, once each. */
export const brandsUsed = (nodes: Flow): ReadonlyArray<string> => [
  ...new Set(flat(nodes).flatMap((n) => STEPS_BY_ID[n.variantId]?.brand ?? []))
]

export type IssueCode =
  | "missing_trigger"
  | "unreachable"
  | "cycle"
  | "unknown_step"
  | "soon"
  | "nested_branch"
  | "empty_branch"
  | "missing_field"
  | "invalid_value"
  | "out_of_range"
  | "unresolved_reference"
  | "scope_off"
  | "connection_missing"
  | "too_many_steps"
  | "one_refund"

export interface Issue {
  /** The step it is about; `null` for the flow as a whole. */
  readonly nodeId: string | null
  readonly code: IssueCode
  /** The config field, where it is one. */
  readonly field?: string
  /** An error stops publishing; a warning is said and does not. */
  readonly severity: "error" | "warning"
  /** What the inspector says, in Dutch. */
  readonly message: string
}

export const IssueSchema = Schema.Struct({
  nodeId: Schema.NullOr(Schema.String),
  code: Schema.String,
  field: Schema.optional(Schema.String),
  severity: Schema.Literals(["error", "warning"]),
  message: Schema.String
})

export interface ValidateContext {
  /** Rights switched off for this flow (Instellingen › Rechten). */
  readonly scopesOff?: ReadonlyArray<string>
  /** The connected services, by their brand id ("shopify", "klaviyo"); absent, nobody is told to connect one. */
  readonly connected?: ReadonlySet<string>
  /** The flow's own id: a step that starts the flow itself is a loop. */
  readonly selfId?: string
}

const isEmpty = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "")

const fieldIssues = (node: FlowNode | LaneNode, step: Step, fields: ReadonlySet<string>): ReadonlyArray<Issue> => {
  const out: Array<Issue> = []
  for (const f of step.fields) {
    const value = node.config[f.key]
    if (isEmpty(value)) {
      if ("required" in f && f.required === true) {
        out.push({
          nodeId: node.id,
          code: "missing_field",
          field: f.key,
          severity: "error",
          message: `${f.label} is leeg.`
        })
      }
      continue
    }
    if (f.type === "number" && typeof value === "number" && f.max !== undefined && value > f.max) {
      out.push({
        nodeId: node.id,
        code: "out_of_range",
        field: f.key,
        severity: "error",
        message: `${f.label} mag hoogstens ${f.max.toLocaleString("nl-NL")} zijn.`
      })
      continue
    }
    if (!Schema.is(fieldSchemaOf(f))(value)) {
      out.push({
        nodeId: node.id,
        code: "invalid_value",
        field: f.key,
        severity: "error",
        message: `${f.label} heeft geen geldige waarde.`
      })
      continue
    }
    if (typeof value === "string" && fields.size > 0) {
      const unknown = referencesIn(value).find((r) => !fields.has(r))
      if (unknown !== undefined) {
        out.push({
          nodeId: node.id,
          code: "unresolved_reference",
          field: f.key,
          severity: "error",
          message: `{{${unknown}}} bestaat niet bij deze trigger.`
        })
      }
    }
  }
  return out
}

/**
 * What is wrong with a flow, per step (widgets/05 §1.4; M12's publish invariants): one trigger at the head, every step
 * reachable from it and none twice, lanes only on the main line, required fields set, numbers in range, `{{field}}`
 * references the trigger's record carries, no step that is "Binnenkort", at most one "Terugbetalen", and the rights it
 * needs granted. A connected service that is not connected is a warning: the step says "Koppel …" and the flow can
 * still be published.
 */
export const validate = (nodes: Flow, ctx: ValidateContext = {}): ReadonlyArray<Issue> => {
  const issues: Array<Issue> = []
  const trigger = triggerOf(nodes)
  const fields = new Set(trigger === undefined ? [] : fieldsOf(trigger.variantId).map((f) => f.path))
  const all = flat(nodes)
  if (all.length > MAX_STEPS) {
    issues.push({
      nodeId: null,
      code: "too_many_steps",
      severity: "error",
      message: `Een flow heeft hoogstens ${MAX_STEPS} stappen.`
    })
  }
  if (trigger === undefined) {
    issues.push({
      nodeId: null,
      code: "missing_trigger",
      severity: "error",
      message: "De flow begint niet met een trigger."
    })
  }
  const seen = new Set<string>()
  const off = new Set(ctx.scopesOff ?? [])
  // One "Terugbetalen" a flow: a second would refund the same order again in the same run.
  for (const extra of all.filter((n) => n.variantId === "action.refund").slice(1)) {
    issues.push({
      nodeId: extra.id,
      code: "one_refund",
      severity: "error",
      message: "Een flow betaalt hoogstens één keer terug. Haal deze tweede stap Terugbetalen weg."
    })
  }

  const check = (node: FlowNode | LaneNode, index: number, inLane: boolean) => {
    if (seen.has(node.id)) {
      issues.push({
        nodeId: node.id,
        code: "cycle",
        severity: "error",
        message: "Deze stap staat twee keer in de flow."
      })
      return
    }
    seen.add(node.id)
    const step = STEPS_BY_ID[node.variantId]
    if (step === undefined) {
      issues.push({ nodeId: node.id, code: "unknown_step", severity: "error", message: "Deze stap bestaat niet meer." })
      return
    }
    if (step.kind === "trigger" && (inLane || index > 0)) {
      issues.push({
        nodeId: node.id,
        code: "unreachable",
        severity: "error",
        message: "Een trigger kan alleen bovenaan staan."
      })
    } else if (trigger === undefined && !inLane) {
      issues.push({ nodeId: node.id, code: "unreachable", severity: "error", message: "Geen trigger start deze stap." })
    }
    if (step.soon === true) {
      issues.push({ nodeId: node.id, code: "soon", severity: "error", message: `${step.label} komt binnenkort.` })
    }
    if (step.kind === "branch") {
      const lanes = "branches" in node ? node.branches : undefined
      if (inLane) {
        issues.push({
          nodeId: node.id,
          code: "nested_branch",
          severity: "error",
          message: "Een splitsing kan niet in een andere splitsing."
        })
      } else if (lanes === undefined || lanes.yes.length + lanes.no.length === 0) {
        issues.push({
          nodeId: node.id,
          code: "empty_branch",
          severity: "error",
          message: "Beide wegen van de splitsing zijn leeg."
        })
      }
    }
    if (step.id === "action.run_workflow" && ctx.selfId !== undefined && node.config.workflow_id === ctx.selfId) {
      issues.push({
        nodeId: node.id,
        code: "cycle",
        field: "workflow_id",
        severity: "error",
        message: "Deze stap start de flow zelf opnieuw."
      })
    }
    issues.push(...fieldIssues(node, step, fields))
    if (step.scope !== undefined && off.has(step.scope)) {
      issues.push({
        nodeId: node.id,
        code: "scope_off",
        severity: "error",
        message: `De flow mag niet: ${SCOPE_LABEL[step.scope] ?? step.scope}. Zet het aan onder Instellingen › Rechten.`
      })
    }
    if (step.brand !== undefined && ctx.connected !== undefined && !ctx.connected.has(step.brand)) {
      issues.push({
        nodeId: node.id,
        code: "connection_missing",
        severity: "warning",
        message: `Koppel ${BRAND_NAME[step.brand] ?? step.brand}`
      })
    }
  }

  nodes.forEach((n, i) => {
    check(n, i, false)
    if (n.branches !== undefined) {
      for (const lane of [n.branches.yes, n.branches.no]) lane.forEach((l, j) => check(l, j, true))
    }
  })
  return issues
}

/** Whether the flow may be published as it stands. */
export const publishable = (issues: ReadonlyArray<Issue>) => issues.every((i) => i.severity !== "error")
