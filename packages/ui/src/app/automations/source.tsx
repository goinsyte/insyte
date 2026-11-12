import { createContext, useContext } from "react"
import type { AutomationTemplate } from "../lib/automation-templates"
import type { Place, TestResult } from "./flow-edits"
import type { WorkflowNode, WorkflowRun, WorkflowSettings, WorkflowState } from "./node-types"

/**
 * What the automations screens read and do, from whoever hosts them (as `tickets/source.tsx` is for the tickets
 * screens): the design app from its workflow store, the console from `Automations.*` (M12 step 1). The markup is the
 * design's. What the host cannot do yet is absent, and the screens say "Binnenkort" for it, never made up: the console
 * has no runs, no test and no AI line until the executor and M15.
 */

/** What a change said: the toast's words. A host with undo tokens offers "Ongedaan maken" with it. */
export type Said = { label: string; detail?: string | undefined }

/** What is wrong with one step, as the server's validation says it (`@insyte/domain/automations/Graph`). */
export type StepIssue = { code: string; field?: string | undefined; severity: "error" | "warning"; message: string }

/** A template the workspace's records say would have work to do. */
export type Recommendation = {
  template: AutomationTemplate
  evidence: { count: number; line: string }
  /** A flow from the same trigger that is not on, to point at rather than make another. */
  idle?: WorkflowState | undefined
}

/** The canvas's edits, on the flow as the builder holds it. They apply at once; the host keeps them. */
export interface WorkflowEditor {
  getWorkflow: (id: string) => WorkflowState | undefined
  /** The flow as it was last published. */
  published: (id: string) => WorkflowState | undefined
  isDirty: (id: string) => boolean
  insertAt: (id: string, variantId: string, place: Place) => WorkflowNode | null
  moveTo: (id: string, nodeId: string, place: Place) => void
  /** Answers the Undo that puts the step back. */
  removeNode: (id: string, nodeId: string) => (() => void) | null
  updateNodeConfig: (id: string, nodeId: string, patch: Record<string, unknown>) => void
  replaceNodes: (id: string, nodes: WorkflowNode[], name?: string) => void
  updateMeta: (id: string, patch: Partial<Pick<WorkflowState, "name" | "description">>) => void
  /** Back to the published version. */
  revert: (id: string) => void
  /** An older version on the canvas, as an unpublished change; answers its Undo. */
  restoreVersion: (id: string, v: number) => (() => void) | null
}

/** What goes to the host's records. Each says what happened itself, with Undo where there is one. */
export interface AutomationCommands {
  /** A draft, empty or from a template; answers its id, or `null` where it was refused (and said so). */
  create: (input?: { templateId?: string; name?: string; nodes?: WorkflowNode[] }) => Promise<string | null>
  /** Publishes the canvas as the next version; `false` where it was refused. */
  publish: (id: string, note: string, said: Said) => Promise<boolean>
  setStatus: (id: string, status: "active" | "paused", said: Said) => Promise<void>
  duplicate: (id: string) => Promise<string | null>
  remove: (id: string, said: Said) => Promise<void>
  /** `said` with Undo for a change worth taking back (a right switched off); without, quietly. */
  updateSettings: (id: string, patch: Partial<WorkflowSettings>, said?: Said) => Promise<void>
}

export interface AutomationsSource {
  /** Every flow, by id. */
  workflows: Record<string, WorkflowState>
  /** One flow as the builder holds it. */
  useWorkflow: (id: string) => WorkflowState | undefined
  editor: WorkflowEditor
  commands: AutomationCommands
  /** "Aanbevolen". */
  recommended: ReadonlyArray<Recommendation>
  /** Who hears of a failed run: the values `WorkflowSettings.notify` holds. */
  people: ReadonlyArray<{ value: string; label: string }>
  /** "Test met voorbeeld"; absent, the button says Binnenkort. */
  test?: ((id: string) => Promise<TestResult | null>) | undefined
  /** "Opnieuw" on a run; absent where there are no runs. */
  rerun?: ((id: string, run: WorkflowRun) => WorkflowRun | null) | undefined
  /** The AI line under the canvas; absent until M15. */
  draftFromPrompt?: ((prompt: string) => WorkflowNode[]) | undefined
  /** What is wrong per step, by node id; absent, the canvas shows only the rights it lacks. */
  useIssues?: ((id: string) => ReadonlyMap<string, ReadonlyArray<StepIssue>>) | undefined
  /** Whether the canvas is kept: shown beside the name; absent, the design's store keeps it at once. */
  useSaving?: ((id: string) => "saving" | "saved" | "failed" | null) | undefined
  /** "Velden van het record": what this flow's trigger offers to `{{…}}`; absent, the design's four. */
  useFields?: ((id: string) => ReadonlyArray<string>) | undefined
  /** Runs and Geschiedenis; `false` until the executor writes runs. */
  runs: boolean
  /** Whether the role may publish, and pause or remove a flow; when not, the sentence the button says. */
  gates: { publish: Gate; manage: Gate }
}

export type Gate = { ok: boolean; reason: string }

const Context = createContext<AutomationsSource | null>(null)

export const AutomationsSourceProvider = Context.Provider

export function useAutomationsSource(): AutomationsSource {
  const source = useContext(Context)
  if (source === null) throw new Error("The automations screens need an AutomationsSourceProvider around them.")
  return source
}
