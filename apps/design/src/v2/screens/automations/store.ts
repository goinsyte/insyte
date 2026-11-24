import { useSyncExternalStore } from "react"
import { BUSY, SEED, SEED_RUNS, stepType, template } from "../../fixtures/automations.ts"
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

/* ── the test a person starts: the step it is on, and where it stopped ──────────────────────────── */

type TestState = {
  readonly flowId: string
  /** The step being walked now; null once it has finished. */
  readonly at: string | null
  /** The steps it went through. */
  readonly done: ReadonlyArray<string>
  readonly failed?: { readonly id: string; readonly reason: string }
  readonly sample: string
}

let test: TestState | null = null
const testListeners = new Set<() => void>()

export function setTest(next: TestState | null) {
  test = next
  for (const listener of testListeners) listener()
}

const subscribeTest = (listener: () => void) => {
  testListeners.add(listener)
  return () => testListeners.delete(listener)
}

export function useTest(flowId: string): TestState | null {
  const t = useSyncExternalStore(subscribeTest, () => test)
  return t?.flowId === flowId ? t : null
}

export function setSteps(id: string, steps: ReadonlyArray<Step>) {
  patch(id, { steps, unpublished: true, editedBy: "elena", editedAt: "zojuist" })
  /* An edit clears the red a failed test left on a step. */
  if (test?.flowId === id && test.at === null) setTest(null)
}

/** A change to the flow's settings, written into its logboek under the person who made it. */
export function logSetting(a: Automation, what: string, next: Partial<Automation>) {
  patch(a.id, { ...next, log: [{ by: ME.name, at: "zojuist", what }, ...(a.log ?? [])] })
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

/* A template's step gets the fields it needs, so the draft can be tested as it stands. */
const ready = (st: Step): Step => {
  const t = stepType(st.type)
  const values: Record<string, string> = { ...st.values }
  for (const field of t?.fields ?? []) {
    if (field.required !== true || (values[field.key] ?? "").trim() !== "") continue
    values[field.key] = field.key === "supplier"
      ? "De leverancier van de bestelling"
      : field.key === "to"
      ? "{{klant.e-mail}}"
      : field.placeholder ?? st.summary
  }
  return { ...st, values }
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
    steps: (from?.steps ?? []).map(ready),
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
