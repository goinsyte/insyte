import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { validate } from "@insyte/domain/automations/Graph"
import type {
  AutomationChange,
  AutomationDetail,
  AutomationList,
  Recommendation as ServerRecommendation
} from "@insyte/modules/automations/domain/Automations"
import { cloneNodes, configure, insertStep, moveStep, removeStep } from "@insyte/ui/app/automations/flow-edits"
import type { WorkflowSettings, WorkflowState } from "@insyte/ui/app/automations/node-types"
import type {
  AutomationCommands,
  AutomationsSource,
  Recommendation,
  Said,
  StepIssue,
  WorkflowEditor
} from "@insyte/ui/app/automations/source"
import { undoable } from "@insyte/ui/app/lib/undo"
import { Exit, Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { toast } from "sonner"
import { automationFieldsAtom, AUTOMATIONS, automationWrites } from "../data/automations.ts"
import { frameAtom } from "../data/frame.ts"
import { failureOf, type RefusalCopy, sayRefusal, useGate } from "../frame/refusals.ts"
import { issuesByNode, publishedOf, templateOf, workflowOfDetail, workflowOfRow } from "./automation-of.tsx"

/*
 * The automations screens' source in the console (M12 step 1): `Automations.list` for the list, `Automations.get` for
 * the builder, and the server's commands. The builder edits a working copy here, at once, and keeps it with
 * `Automations.saveDraft` a moment after the last edit; what is wrong per step is the domain's `validate`, the same
 * function publishing refuses on. A save that does not take keeps the canvas as it is and says so beside the name. Runs,
 * Test met voorbeeld and the AI line are absent until the executor and M15, and the screens say Binnenkort.
 */

const SAVE_AFTER_MS = 800

const COPY: RefusalCopy = {
  gone: "Die automatisering bestaat niet meer",
  conflicts: {
    not_published: ["Publiceer eerst", "Een concept gaat aan zodra het gepubliceerd is."],
    published_since: ["Te laat om ongedaan te maken", "Er is intussen een nieuwere versie gepubliceerd."]
  },
  invalid: {
    too_large: "Deze flow is te groot om te bewaren.",
    required: "Een naam is verplicht.",
    unknown_scope: "Dat recht bestaat niet.",
    not_a_member: "Die collega zit niet meer in het team."
  },
  other: (tagged) => {
    if (tagged._tag === "NothingToPublish") {
      toast("Er is niets nieuws om te publiceren", { description: "Wat op het canvas staat, is al live." })
      return true
    }
    if (tagged._tag === "InvalidFlow") {
      const issues = tagged["issues"] as ReadonlyArray<{ message: string }>
      toast.error("Deze flow kan nog niet live", {
        description: issues.length > 1
          ? `${issues[0]?.message} En nog ${issues.length - 1} ${issues.length === 2 ? "punt" : "punten"}.`
          : issues[0]?.message
      })
      return true
    }
    return false
  }
}

const refused = (error: unknown) => sayRefusal(error, COPY)

type Saving = "saving" | "saved" | "failed" | null

interface Copy {
  readonly working: WorkflowState
  readonly published: WorkflowState | undefined
  readonly connected: ReadonlySet<string>
  readonly issues: ReadonlyMap<string, ReadonlyArray<StepIssue>>
  readonly saving: Saving
  /** An edit not yet sent, or on its way: the server's copy does not replace it. */
  readonly pending: boolean
  readonly from: AutomationDetail
}

const issuesOf = (w: WorkflowState, connected: ReadonlySet<string>) =>
  issuesByNode(validate(w.nodes, { scopesOff: w.settings.scopesOff, connected, selfId: w.automationId }))

const copyOf = (detail: AutomationDetail): Copy => {
  const working = workflowOfDetail(detail)
  const connected = new Set(detail.connected)
  return {
    working,
    published: publishedOf(detail, working),
    connected,
    issues: issuesOf(working, connected),
    saving: null,
    pending: false,
    from: detail
  }
}

const same = (a: WorkflowState | undefined, b: WorkflowState | undefined) =>
  a !== undefined && b !== undefined && JSON.stringify(a.nodes) === JSON.stringify(b.nodes)

/** The working copies, per page: an external store the builder reads with `useSyncExternalStore`. */
function createCopies() {
  let copies: Record<string, Copy> = {}
  const listeners = new Set<() => void>()
  const notify = () => {
    for (const l of listeners) l()
  }
  return {
    get: (id: string): Copy | undefined => copies[id],
    subscribe: (l: () => void) => {
      listeners.add(l)
      return () => void listeners.delete(l)
    },
    /** The first server copy, while the page renders: nobody listens yet. */
    seed(detail: AutomationDetail) {
      if (copies[detail.automation.id] === undefined) copies = { ...copies, [detail.automation.id]: copyOf(detail) }
    },
    /** The server's flow; steps, name and description edited here and not yet kept stay as they are. */
    sync(detail: AutomationDetail) {
      const id = detail.automation.id
      const was = copies[id]
      if (was?.from === detail) return
      const next = copyOf(detail)
      if (was === undefined || !was.pending) {
        copies = { ...copies, [id]: { ...next, saving: was?.saving ?? null } }
      } else {
        const working = {
          ...next.working,
          nodes: was.working.nodes,
          name: was.working.name,
          description: was.working.description
        }
        copies = {
          ...copies,
          [id]: { ...next, working, issues: issuesOf(working, next.connected), saving: was.saving, pending: true }
        }
      }
      notify()
    },
    edit(id: string, patch: (w: WorkflowState) => WorkflowState) {
      const was = copies[id]
      if (was === undefined) return false
      const working = patch(was.working)
      copies = {
        ...copies,
        [id]: { ...was, working, issues: issuesOf(working, was.connected), pending: true }
      }
      notify()
      return true
    },
    mark(id: string, saving: Saving, pending?: boolean) {
      const was = copies[id]
      if (was === undefined) return
      copies = { ...copies, [id]: { ...was, saving, pending: pending ?? was.pending } }
      notify()
    }
  }
}

type Copies = ReturnType<typeof createCopies>

const recommendationsOf = (rows: ReadonlyArray<ServerRecommendation> | undefined): ReadonlyArray<Recommendation> =>
  (rows ?? []).flatMap((r) => {
    const template = templateOf(r.templateId)
    return template === undefined ? [] : [{ template, evidence: { count: r.count, line: r.line } }]
  })

/** The page over `Automations.list` and, on a flow's page, `Automations.get`. */
export function useConsoleAutomationsSource(input: {
  readonly list?: AutomationList | undefined
  readonly detail?: AutomationDetail | undefined
  readonly recommended?: ReadonlyArray<ServerRecommendation> | undefined
}): AutomationsSource {
  const [copies] = useState(createCopies)
  if (input.detail !== undefined) copies.seed(input.detail)
  useEffect(() => {
    if (input.detail !== undefined) copies.sync(input.detail)
  }, [copies, input.detail])
  const frame = Option.getOrUndefined(AsyncResult.value(useAtomValue(frameAtom)))
  const people = useMemo(
    () => frame?.teammates.map((t) => ({ value: t.id, label: t.name })) ?? [],
    [frame]
  )
  const { commands, editor } = useCommands(copies)
  const workflows = useMemo(
    () => Object.fromEntries((input.list?.rows ?? []).map((r) => [r.id, workflowOfRow(r)])),
    [input.list]
  )
  const recommended = useMemo(() => recommendationsOf(input.recommended), [input.recommended])
  const publish = useGate("automations.publish")
  const manage = useGate("automations", 3)
  const gates = useMemo(
    () => ({ publish, manage }),
    // A gate is a fresh object each render: its contents are what change.
    [publish.ok, publish.reason, manage.ok, manage.reason]
  )
  return useMemo<AutomationsSource>(() => ({
    workflows,
    useWorkflow: (id) =>
      useSyncExternalStore(copies.subscribe, () => copies.get(id)?.working, () => copies.get(id)?.working),
    useIssues: (id) => {
      const issues = useSyncExternalStore(copies.subscribe, () => copies.get(id)?.issues, () => copies.get(id)?.issues)
      return issues ?? NO_ISSUES
    },
    useFields: (id) => {
      const trigger = useSyncExternalStore(
        copies.subscribe,
        () => copies.get(id)?.working.nodes[0]?.variantId,
        () => copies.get(id)?.working.nodes[0]?.variantId
      )
      const rows = Option.getOrUndefined(AsyncResult.value(useAtomValue(automationFieldsAtom(trigger ?? ""))))
      return useMemo(() => rows?.map((r) => r.path) ?? NO_FIELDS, [rows])
    },
    useSaving: (id) =>
      useSyncExternalStore(
        copies.subscribe,
        () => copies.get(id)?.saving ?? null,
        () => copies.get(id)?.saving ?? null
      ),
    editor,
    commands,
    recommended,
    people,
    runs: false,
    gates
  }), [workflows, copies, editor, commands, recommended, people, gates])
}

const NO_ISSUES: ReadonlyMap<string, ReadonlyArray<StepIssue>> = new Map()
const NO_FIELDS: ReadonlyArray<string> = []

function useCommands(copies: Copies): { commands: AutomationCommands; editor: WorkflowEditor } {
  const keys = { reactivityKeys: [...AUTOMATIONS] }
  const writers = {
    create: useAtomSet(automationWrites.create, { mode: "promiseExit" }),
    saveDraft: useAtomSet(automationWrites.saveDraft, { mode: "promiseExit" }),
    duplicate: useAtomSet(automationWrites.duplicate, { mode: "promiseExit" }),
    remove: useAtomSet(automationWrites.remove, { mode: "promiseExit" }),
    publish: useAtomSet(automationWrites.publish, { mode: "promiseExit" }),
    setStatus: useAtomSet(automationWrites.setStatus, { mode: "promiseExit" }),
    updateSettings: useAtomSet(automationWrites.updateSettings, { mode: "promiseExit" }),
    undo: useAtomSet(automationWrites.undo, { mode: "promiseExit" })
  }
  // The commands outlive a render (a save waits a moment): they reach the writers through a ref.
  const writes = useRef(writers)
  writes.current = writers
  const [timers] = useState(() => new Map<string, ReturnType<typeof setTimeout>>())
  const [inFlight] = useState(() => new Map<string, Promise<boolean>>())

  return useMemo(() => {
    const write = {
      create: (...a: Parameters<typeof writers.create>) => writes.current.create(...a),
      saveDraft: (...a: Parameters<typeof writers.saveDraft>) => writes.current.saveDraft(...a),
      duplicate: (...a: Parameters<typeof writers.duplicate>) => writes.current.duplicate(...a),
      remove: (...a: Parameters<typeof writers.remove>) => writes.current.remove(...a),
      publish: (...a: Parameters<typeof writers.publish>) => writes.current.publish(...a),
      setStatus: (...a: Parameters<typeof writers.setStatus>) => writes.current.setStatus(...a),
      updateSettings: (...a: Parameters<typeof writers.updateSettings>) => writes.current.updateSettings(...a),
      undo: (...a: Parameters<typeof writers.undo>) => writes.current.undo(...a)
    }
    const undo = (token: string) =>
      void write.undo({ payload: { token }, ...keys }).then((exit) => {
        if (Exit.isFailure(exit)) refused(failureOf(exit))
      })

    /** Keeps the canvas now; answers whether the server has it. */
    const save = async (id: string): Promise<boolean> => {
      const t = timers.get(id)
      if (t !== undefined) clearTimeout(t)
      timers.delete(id)
      const running = inFlight.get(id)
      if (running !== undefined) await running
      const copy = copies.get(id)
      if (copy === undefined || !copy.pending) return copy?.saving !== "failed"
      const sent = copy.working
      copies.mark(id, "saving")
      const done = write.saveDraft({
        payload: {
          id,
          nodes: sent.nodes,
          name: sent.name.trim() || copy.from.automation.name,
          description: sent.description
        },
        ...keys
      }).then((exit) => {
        if (Exit.isFailure(exit)) {
          copies.mark(id, "failed")
          refused(failureOf(exit))
          return false
        }
        // An edit made while this one was on its way is still waiting.
        copies.mark(id, "saved", copies.get(id)?.working !== sent)
        return true
      })
      inFlight.set(id, done)
      const ok = await done
      inFlight.delete(id)
      return ok
    }

    const later = (id: string) => {
      const t = timers.get(id)
      if (t !== undefined) clearTimeout(t)
      timers.set(id, setTimeout(() => void save(id), SAVE_AFTER_MS))
    }

    const edit = (id: string, patch: (w: WorkflowState) => WorkflowState) => {
      if (copies.edit(id, patch)) later(id)
    }

    /** Says what the change did, with its undo; the server's flow takes the copy's place. */
    const answered = (exit: Exit.Exit<AutomationChange, unknown>, said: Said | undefined): boolean => {
      if (Exit.isFailure(exit)) {
        refused(failureOf(exit))
        return false
      }
      const { automation, undo: ticket } = exit.value
      if (automation !== null) copies.sync(automation)
      if (said === undefined) return true
      if (ticket === null) toast.success(said.label, { description: said.detail })
      else undoable(said.label, () => undo(ticket.token), said.detail)
      return true
    }

    const editor: WorkflowEditor = {
      getWorkflow: (id) => copies.get(id)?.working,
      published: (id) => copies.get(id)?.published,
      isDirty: (id) => {
        const copy = copies.get(id)
        return copy?.published !== undefined && !same(copy.working, copy.published)
      },
      insertAt: (id, variantId, place) => {
        const w = copies.get(id)?.working
        const made = w === undefined ? null : insertStep(w.nodes, variantId, place)
        if (made === null) return null
        edit(id, (x) => ({ ...x, nodes: made.nodes }))
        return made.node
      },
      moveTo: (id, nodeId, place) => {
        const w = copies.get(id)?.working
        const nodes = w === undefined ? null : moveStep(w.nodes, nodeId, place)
        if (nodes !== null) edit(id, (x) => ({ ...x, nodes }))
      },
      removeNode: (id, nodeId) => {
        const w = copies.get(id)?.working
        const gone = w === undefined ? null : removeStep(w.nodes, nodeId)
        if (gone === null || w === undefined) return null
        const before = w.nodes
        edit(id, (x) => ({ ...x, nodes: gone.nodes }))
        return () => edit(id, (x) => ({ ...x, nodes: before }))
      },
      updateNodeConfig: (id, nodeId, patch) => edit(id, (x) => ({ ...x, nodes: configure(x.nodes, nodeId, patch) })),
      replaceNodes: (id, nodes, name) => edit(id, (x) => ({ ...x, nodes, name: name ?? x.name })),
      updateMeta: (id, patch) => edit(id, (x) => ({ ...x, ...patch })),
      revert: (id) => {
        const published = copies.get(id)?.published
        if (published !== undefined) edit(id, (x) => ({ ...x, nodes: cloneNodes(published.nodes) }))
      },
      restoreVersion: (id, v) => {
        const w = copies.get(id)?.working
        const entry = w?.versions.find((x) => x.v === v)
        if (w === undefined || entry === undefined) return null
        const before = w.nodes
        edit(id, (x) => ({ ...x, nodes: cloneNodes(entry.nodes) }))
        return () => edit(id, (x) => ({ ...x, nodes: before }))
      }
    }

    const notifyOf = (patch: Partial<WorkflowSettings>) =>
      patch.notify === undefined ? {} : { notifyMemberId: patch.notify === "" ? null : patch.notify }

    const commands: AutomationCommands = {
      create: async (input = {}) => {
        const exit = await write.create({
          payload: {
            ...(input.templateId === undefined ? {} : { templateId: input.templateId }),
            ...(input.name === undefined ? {} : { name: input.name }),
            ...(input.nodes === undefined ? {} : { nodes: input.nodes })
          },
          ...keys
        })
        if (Exit.isFailure(exit)) {
          refused(failureOf(exit))
          return null
        }
        const made = exit.value.automation
        if (made !== null) copies.sync(made)
        return made?.automation.id ?? null
      },
      publish: async (id, note, said) => {
        if (!(await save(id))) return false
        return answered(await write.publish({ payload: { id, note }, ...keys }), said)
      },
      setStatus: async (id, status, said) => {
        answered(await write.setStatus({ payload: { id, status }, ...keys }), said)
      },
      duplicate: async (id) => {
        if (!(await save(id))) return null
        const exit = await write.duplicate({ payload: { id }, ...keys })
        if (Exit.isFailure(exit)) {
          refused(failureOf(exit))
          return null
        }
        const made = exit.value.automation
        if (made !== null) copies.sync(made)
        return made?.automation.id ?? null
      },
      remove: async (id, said) => {
        const t = timers.get(id)
        if (t !== undefined) clearTimeout(t)
        timers.delete(id)
        answered(await write.remove({ payload: { id }, ...keys }), said)
      },
      updateSettings: async (id, patch, said) => {
        answered(
          await write.updateSettings({
            payload: {
              id,
              ...(patch.scopesOff === undefined ? {} : { scopesOff: patch.scopesOff }),
              ...(patch.scopesExtra === undefined ? {} : { scopesExtra: patch.scopesExtra }),
              ...(patch.rateLimit === undefined ? {} : { rateLimit: patch.rateLimit as 0 | 30 | 60 | 120 | 500 }),
              ...notifyOf(patch)
            },
            ...keys
          }),
          said
        )
      }
    }
    return { commands, editor }
    // The copies, the timers and the writers' ref live as long as the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [copies])
}
