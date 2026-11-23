import { useSyncExternalStore } from "react"
import { BUSY, SEED, SEED_RUNS, template } from "../../fixtures/automations.ts"
import type { Automation, FlowStatus, Run, Step } from "../../fixtures/automations.ts"
import { ME } from "../../fixtures/workspace.ts"
import { useView } from "../../view.ts"

/**
 * What the demo changes about the flows while it is looked at: a draft made from a template, a
 * pause, a rename, an edited step, a publish, a delete, a run started again. Module state, so the
 * list and the editor agree, and gone on a reload, as a demo should be.
 */

type State = {
  readonly created: ReadonlyArray<Automation>
  readonly patches: Readonly<Record<string, Partial<Automation>>>
  readonly deleted: ReadonlyArray<string>
  readonly runs: ReadonlyArray<Run>
}

let state: State = { created: [], patches: {}, deleted: [], runs: [] }
const listeners = new Set<() => void>()
const set = (next: State) => {
  state = next
  for (const listener of listeners) listener()
}
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function useStore(): State {
  return useSyncExternalStore(subscribe, () => state)
}

/** Every flow the page shows, for the view's state (empty on the first day, thirty more in the busy week). */
export function useFlows(): ReadonlyArray<Automation> {
  const s = useStore()
  const view = useView()
  const base = view.staat === "leeg" ? [] : view.staat === "druk" ? [...SEED, ...BUSY] : SEED
  return [...s.created, ...base]
    .filter((a) => !s.deleted.includes(a.id))
    .map((a) => ({ ...a, ...s.patches[a.id] }))
}

export function useRuns(): ReadonlyArray<Run> {
  const s = useStore()
  const view = useView()
  if (view.staat === "leeg") return s.runs
  return [...s.runs, ...SEED_RUNS]
}

export function patch(id: string, next: Partial<Automation>) {
  set({ ...state, patches: { ...state.patches, [id]: { ...state.patches[id], ...next } } })
}

export function setStatus(id: string, status: FlowStatus) {
  patch(id, { status })
}

export function setSteps(id: string, steps: ReadonlyArray<Step>) {
  patch(id, { steps, unpublished: true, editedBy: "elena", editedAt: "zojuist" })
}

export function publish(a: Automation, note: string) {
  const version = a.version + 1
  patch(a.id, {
    version,
    unpublished: false,
    status: a.status === "concept" ? "actief" : a.status,
    editedBy: "elena",
    editedAt: "zojuist",
    versions: [{ v: version, by: ME.name, at: "zojuist", note }, ...a.versions]
  })
}

export function remove(id: string) {
  set({ ...state, deleted: [...state.deleted, id] })
}

export function restore(id: string) {
  set({ ...state, deleted: state.deleted.filter((d) => d !== id) })
}

export function addRun(run: Run) {
  set({ ...state, runs: [run, ...state.runs] })
}

let made = 0

/** A new draft, empty or from a template; nothing runs until it is published. Returns its id. */
export function createDraft(templateId?: string, name?: string): string {
  made += 1
  const from = templateId === undefined ? undefined : template(templateId)
  const id = `nieuw-${made}`
  const draft: Automation = {
    id,
    name: name ?? from?.name ?? "Nieuwe automatisering",
    description: from?.description ?? "",
    status: "concept",
    steps: from?.steps ?? [],
    runs: 0,
    runs30: 0,
    lastRun: null,
    owner: "elena",
    editedBy: "elena",
    editedAt: "zojuist",
    version: 0,
    unpublished: true,
    versions: [],
    touches: [],
    createdAt: "vandaag"
  }
  set({ ...state, created: [draft, ...state.created] })
  return id
}
