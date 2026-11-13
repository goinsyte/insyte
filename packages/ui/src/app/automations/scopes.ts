import { SCOPES } from "@insyte/domain/automations/Scopes"
import { flatNodes, VARIANTS_BY_ID, type WorkflowNode, type WorkflowSettings } from "./node-types"

/**
 * The rights a flow's service account can hold. A flow acts as itself, never as a person, so what it
 * may touch is listed here and granted per flow; a step whose right is switched off fails, and says so.
 * The list is the domain's (`@insyte/domain/automations/Scopes`).
 */
export { SCOPES }

export const SCOPE_LABEL: Record<string, string> = Object.fromEntries(SCOPES.map((s) => [s.id, s.label]))

/** For each right, the steps that need it, by their label. */
export function scopeNeeds(nodes: ReadonlyArray<WorkflowNode>): Map<string, Array<{ nodeId: string; label: string }>> {
  const out = new Map<string, Array<{ nodeId: string; label: string }>>()
  for (const n of flatNodes(nodes)) {
    const v = VARIANTS_BY_ID[n.variantId]
    if (!v?.scope) continue
    const list = out.get(v.scope) ?? []
    list.push({ nodeId: n.id, label: (n.config.title_override as string | undefined) ?? v.label })
    out.set(v.scope, list)
  }
  return out
}

/** The right a node needs that this flow does not hold, if any. */
export function missingScope(node: WorkflowNode, settings: WorkflowSettings): string | null {
  const scope = VARIANTS_BY_ID[node.variantId]?.scope
  return scope && settings.scopesOff.includes(scope) ? scope : null
}
